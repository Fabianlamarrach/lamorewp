-- Bodas creadas por el equipo desde el panel de superadmin.
--
--   * Una boda puede existir sin cuenta de pareja (owner_id null). Lleva un correo de contacto;
--     cuando la pareja se registra con ese correo y lo confirma, la boda se vincula a su cuenta
--     (no se crea otra vacía).
--   * Más datos de la celebración: tipo y hora de ceremonia, lugar del banquete, contacto,
--     planner asignado y quién la creó.
--   * Checklist de tareas por boda (wedding_tasks), con las mismas reglas de acceso que el presupuesto.

-- ---------- Bodas ----------
alter table public.weddings alter column owner_id drop not null;
alter table public.weddings
  add column contact_email   text not null default '' check (char_length(contact_email) <= 254),
  add column contact_phone   text not null default '' check (char_length(contact_phone) <= 40),
  add column ceremony_type   text not null default '' check (ceremony_type in ('', 'civil', 'religiosa', 'simbolica')),
  add column ceremony_time   time,
  add column reception_venue text not null default '' check (char_length(reception_venue) <= 200),
  add column planner_id      uuid references public.profiles (id) on delete set null,
  add column created_by      uuid references public.profiles (id) on delete set null;

update public.weddings w set contact_email = p.email from public.profiles p where p.id = w.owner_id;

-- Como mucho una boda pendiente de vincular por correo.
create unique index weddings_pending_email_idx on public.weddings (lower(contact_email))
  where owner_id is null and contact_email <> '';
create index weddings_planner_idx on public.weddings (planner_id);

-- La pareja no puede cambiar estado, propietario, planner ni autor. El superadmin queda como autor.
create or replace function public.weddings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if public.is_superadmin() then
      if tg_op = 'INSERT' then
        new.created_by := (select auth.uid());
      else
        new.created_by := old.created_by;
      end if;
    elsif tg_op = 'INSERT' then
      new.status := 'consulta';
      new.planner_id := null;
      new.created_by := null;
    else
      new.status := old.status;
      new.owner_id := old.owner_id;
      new.planner_id := old.planner_id;
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Vinculación automática al registrarse ----------
create function public.link_pending_wedding(uid uuid, mail text) returns void
language sql security definer set search_path = '' as $$
  update public.weddings set owner_id = uid
  where id = (
      select id from public.weddings
      where owner_id is null and contact_email <> '' and lower(contact_email) = lower(mail)
      limit 1
    )
    and not exists (select 1 from public.weddings where owner_id = uid);
$$;

-- Alta: si el equipo ya creó la boda con ese correo no se crea otra. Se vincula en cuanto el
-- correo esté confirmado (así nadie se apropia de una boda registrándose con un correo ajeno).
create or replace function public.handle_new_user() returns trigger
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

  if exists (
    select 1 from public.weddings
    where owner_id is null and contact_email <> '' and lower(contact_email) = lower(new.email)
  ) then
    if new.email_confirmed_at is not null then
      perform public.link_pending_wedding(new.id, new.email);
    end if;
  else
    insert into public.weddings (owner_id, partner1_name, partner2_name, wedding_date, contact_email)
    values (
      new.id,
      left(trim(coalesce(meta ->> 'name', '')), 120),
      left(trim(coalesce(meta ->> 'partner', '')), 120),
      wdate,
      lower(new.email)
    );
  end if;
  return new;
end;
$$;

create function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.link_pending_wedding(new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- ---------- Tareas ----------
create table public.wedding_tasks (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  due_date    date,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index wedding_tasks_wedding_idx on public.wedding_tasks (wedding_id);
create index wedding_tasks_pending_idx on public.wedding_tasks (due_date) where not done;

create trigger wedding_tasks_touch before update on public.wedding_tasks
  for each row execute function public.touch_updated_at();

alter table public.wedding_tasks enable row level security;
create policy "tareas de mi boda o superadmin" on public.wedding_tasks
  for all to authenticated
  using (public.can_access_wedding(wedding_id))
  with check (public.can_access_wedding(wedding_id));

revoke all on public.wedding_tasks from anon;
grant select, insert, update, delete on public.wedding_tasks to authenticated;

-- ---------- Vista resumen (ahora incluye bodas sin cuenta, planner y tareas) ----------
drop view public.wedding_overview;
create view public.wedding_overview with (security_invoker = true) as
select
  w.id,
  w.owner_id,
  coalesce(nullif(p.email, ''), w.contact_email) as email,
  coalesce(p.full_name, '')  as full_name,
  p.role                     as owner_role,
  w.contact_email,
  w.contact_phone,
  w.partner1_name,
  w.partner2_name,
  w.wedding_date,
  w.ceremony_type,
  w.ceremony_time,
  w.venue,
  w.reception_venue,
  w.city,
  w.guests_estimated,
  w.budget_total,
  w.status,
  w.planner_id,
  pl.full_name               as planner_name,
  pl.email                   as planner_email,
  w.created_at,
  w.updated_at,
  coalesce(b.item_count, 0)      as item_count,
  coalesce(b.estimated_total, 0) as estimated_total,
  coalesce(b.actual_total, 0)    as actual_total,
  coalesce(b.paid_total, 0)      as paid_total,
  coalesce(t.task_count, 0)      as task_count,
  coalesce(t.task_done, 0)       as task_done,
  coalesce(t.task_overdue, 0)    as task_overdue
from public.weddings w
left join public.profiles p  on p.id = w.owner_id
left join public.profiles pl on pl.id = w.planner_id
left join (
  select
    wedding_id,
    count(*)                         as item_count,
    sum(estimated)                   as estimated_total,
    sum(coalesce(actual, estimated)) as actual_total,
    sum(paid)                        as paid_total
  from public.budget_items
  group by wedding_id
) b on b.wedding_id = w.id
left join (
  select
    wedding_id,
    count(*)                                                  as task_count,
    count(*) filter (where done)                              as task_done,
    count(*) filter (where not done and due_date < current_date) as task_overdue
  from public.wedding_tasks
  group by wedding_id
) t on t.wedding_id = w.id;

revoke all on public.wedding_overview from anon;
grant select on public.wedding_overview to authenticated;

-- ---------- Permisos de funciones ----------
revoke execute on function
  public.link_pending_wedding(uuid, text), public.handle_user_confirmed()
from public, anon, authenticated;
