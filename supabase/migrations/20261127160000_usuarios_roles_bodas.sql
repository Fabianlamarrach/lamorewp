-- Usuarios, roles (superadmin / pareja), bodas y presupuestos.
--
-- Modelo:
--   auth.users  ──1:1──  profiles (rol)  ──1:1──  weddings  ──1:N──  budget_items
--                                                     └──1:1──  wedding_notes (solo superadmin)
--
-- Seguridad (RLS):
--   * pareja: solo ve y edita su perfil, su boda y sus partidas de presupuesto.
--     No puede cambiar su rol, ni el estado de su boda.
--   * superadmin: ve y edita todo; cambia roles y elimina cuentas mediante funciones RPC.
--   * anon (sin sesión): no ve nada.
-- El registro público siempre crea cuentas "pareja". El primer superadmin se crea con
--   npm run db:admin -- correo@ejemplo.com

-- ---------- Tipos ----------
create type public.app_role as enum ('superadmin', 'pareja');
create type public.wedding_status as enum ('consulta', 'presupuestada', 'confirmada', 'celebrada', 'cancelada');

-- ---------- Tablas ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 40),
  role        public.app_role not null default 'pareja',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.weddings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references public.profiles (id) on delete cascade,
  partner1_name     text not null default '' check (char_length(partner1_name) <= 120),
  partner2_name     text not null default '' check (char_length(partner2_name) <= 120),
  wedding_date      date,
  venue             text not null default '' check (char_length(venue) <= 200),
  city              text not null default '' check (char_length(city) <= 120),
  guests_estimated  integer check (guests_estimated between 0 and 100000),
  budget_total      numeric(12, 2) check (budget_total >= 0),
  status            public.wedding_status not null default 'consulta',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index weddings_date_idx on public.weddings (wedding_date);

create table public.budget_items (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  category    text not null check (char_length(category) between 1 and 60),
  concept     text not null check (char_length(concept) between 1 and 200),
  vendor      text not null default '' check (char_length(vendor) <= 200),
  estimated   numeric(12, 2) not null default 0 check (estimated >= 0),
  actual      numeric(12, 2) check (actual >= 0),
  paid        numeric(12, 2) not null default 0 check (paid >= 0),
  due_date    date,
  notes       text not null default '' check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index budget_items_wedding_idx on public.budget_items (wedding_id);

-- Notas internas del equipo sobre cada boda: la pareja no las ve.
create table public.wedding_notes (
  wedding_id  uuid primary key references public.weddings (id) on delete cascade,
  notes       text not null default '' check (char_length(notes) <= 10000),
  updated_at  timestamptz not null default now()
);

-- ---------- Funciones auxiliares ----------
create function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'superadmin'
  );
$$;

create function public.can_access_wedding(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.weddings w
    where w.id = wid and (w.owner_id = (select auth.uid()) or public.is_superadmin())
  );
$$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger budget_items_touch before update on public.budget_items
  for each row execute function public.touch_updated_at();
create trigger wedding_notes_touch before update on public.wedding_notes
  for each row execute function public.touch_updated_at();

-- La pareja no puede cambiar el estado de su boda ni su propietario.
create function public.weddings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_superadmin() then
    if tg_op = 'INSERT' then
      new.status := 'consulta';
    else
      new.status := old.status;
      new.owner_id := old.owner_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger weddings_guard before insert or update on public.weddings
  for each row execute function public.weddings_guard();

-- Alta de usuario: crea su perfil (siempre "pareja") y su boda con los datos del registro.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wdate date;
begin
  begin
    wdate := nullif(meta ->> 'weddingDate', '')::date;
  exception when others then
    wdate := null; -- fecha inválida: se ignora, no bloquea el registro
  end;

  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), left(trim(coalesce(meta ->> 'name', '')), 120));

  insert into public.weddings (owner_id, partner1_name, partner2_name, wedding_date)
  values (
    new.id,
    left(trim(coalesce(meta ->> 'name', '')), 120),
    left(trim(coalesce(meta ->> 'partner', '')), 120),
    wdate
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------- RPC solo para superadmin ----------
create function public.set_user_role(target uuid, new_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'No tienes permisos para esta acción.';
  end if;
  if target = (select auth.uid()) then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;
  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;
end;
$$;

create function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'No tienes permisos para esta acción.';
  end if;
  if target = (select auth.uid()) then
    raise exception 'No puedes eliminar tu propia cuenta.';
  end if;
  delete from auth.users where id = target; -- en cascada: perfil, boda, presupuesto y notas
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;
end;
$$;

-- ---------- Vista resumen (respeta RLS de quien consulta) ----------
create view public.wedding_overview with (security_invoker = true) as
select
  w.id,
  w.owner_id,
  p.email,
  p.full_name,
  p.role        as owner_role,
  w.partner1_name,
  w.partner2_name,
  w.wedding_date,
  w.venue,
  w.city,
  w.guests_estimated,
  w.budget_total,
  w.status,
  w.created_at,
  w.updated_at,
  coalesce(b.item_count, 0)      as item_count,
  coalesce(b.estimated_total, 0) as estimated_total,
  coalesce(b.actual_total, 0)    as actual_total,
  coalesce(b.paid_total, 0)      as paid_total
from public.weddings w
join public.profiles p on p.id = w.owner_id
left join (
  select
    wedding_id,
    count(*)                         as item_count,
    sum(estimated)                   as estimated_total,
    sum(coalesce(actual, estimated)) as actual_total,
    sum(paid)                        as paid_total
  from public.budget_items
  group by wedding_id
) b on b.wedding_id = w.id;

-- ---------- RLS ----------
alter table public.profiles      enable row level security;
alter table public.weddings      enable row level security;
alter table public.budget_items  enable row level security;
alter table public.wedding_notes enable row level security;

create policy "perfil propio o superadmin (leer)" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_superadmin());
create policy "perfil propio o superadmin (editar)" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_superadmin())
  with check (id = (select auth.uid()) or public.is_superadmin());

create policy "boda propia o superadmin (leer)" on public.weddings
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_superadmin());
create policy "boda propia o superadmin (crear)" on public.weddings
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_superadmin());
create policy "boda propia o superadmin (editar)" on public.weddings
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_superadmin())
  with check (owner_id = (select auth.uid()) or public.is_superadmin());
create policy "solo superadmin borra bodas" on public.weddings
  for delete to authenticated
  using (public.is_superadmin());

create policy "partidas de mi boda o superadmin" on public.budget_items
  for all to authenticated
  using (public.can_access_wedding(wedding_id))
  with check (public.can_access_wedding(wedding_id));

create policy "notas internas solo superadmin" on public.wedding_notes
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ---------- Permisos ----------
revoke all on public.profiles, public.weddings, public.budget_items, public.wedding_notes, public.wedding_overview from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
-- La pareja (y el superadmin) solo pueden editar estas columnas del perfil; el rol va por set_user_role().
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.weddings, public.budget_items, public.wedding_notes to authenticated;
grant select on public.wedding_overview to authenticated;

revoke execute on function
  public.is_superadmin(), public.can_access_wedding(uuid),
  public.set_user_role(uuid, public.app_role), public.admin_delete_user(uuid),
  public.handle_new_user(), public.handle_user_email_change(),
  public.weddings_guard(), public.touch_updated_at()
from public, anon;
grant execute on function
  public.is_superadmin(), public.can_access_wedding(uuid),
  public.set_user_role(uuid, public.app_role), public.admin_delete_user(uuid)
to authenticated;
