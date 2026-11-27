-- Plan de mesas de cada boda: elementos del salón (mesas, pista, barra…) e invitados sentados.
--
--   wedding_tables  ──1:N──  wedding_guests (table_id + seat = silla concreta)
--
-- Coordenadas del plano: lienzo lógico de 1000 x 625; x, y es el centro del elemento.
-- Acceso: la pareja de la boda y el superadmin (igual que presupuesto y tareas).

create table public.wedding_tables (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  kind        text not null default 'redonda'
              check (kind in ('redonda', 'rectangular', 'pista', 'barra', 'escenario', 'entrada')),
  name        text not null default '' check (char_length(name) <= 60),
  seats       integer not null default 0 check (seats between 0 and 30),
  x           integer not null default 500 check (x between 0 and 1000),
  y           integer not null default 312 check (y between 0 and 625),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index wedding_tables_wedding_idx on public.wedding_tables (wedding_id);

create table public.wedding_guests (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  side        text not null default 'comun' check (side in ('p1', 'p2', 'comun')),
  rsvp        text not null default 'pendiente' check (rsvp in ('pendiente', 'confirmado', 'rechazado')),
  menu        text not null default 'normal'
              check (menu in ('normal', 'vegetariano', 'vegano', 'sin_gluten', 'infantil', 'alergias')),
  notes       text not null default '' check (char_length(notes) <= 300),
  -- Al borrar una mesa el invitado vuelve a la lista (seat queda sin efecto mientras table_id sea null).
  table_id    uuid references public.wedding_tables (id) on delete set null,
  seat        integer check (seat between 0 and 29),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index wedding_guests_wedding_idx on public.wedding_guests (wedding_id);
-- Una persona por silla.
create unique index wedding_guests_seat_idx on public.wedding_guests (table_id, seat) where table_id is not null;

create trigger wedding_tables_touch before update on public.wedding_tables
  for each row execute function public.touch_updated_at();

-- La mesa tiene que ser de la misma boda que el invitado.
create function public.wedding_guests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.table_id is not null and not exists (
    select 1 from public.wedding_tables t where t.id = new.table_id and t.wedding_id = new.wedding_id
  ) then
    raise exception 'La mesa no pertenece a esta boda.';
  end if;
  if new.table_id is null then
    new.seat := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger wedding_guests_guard before insert or update on public.wedding_guests
  for each row execute function public.wedding_guests_guard();

alter table public.wedding_tables enable row level security;
alter table public.wedding_guests enable row level security;

create policy "mesas de mi boda o superadmin" on public.wedding_tables
  for all to authenticated
  using (public.can_access_wedding(wedding_id))
  with check (public.can_access_wedding(wedding_id));

create policy "invitados de mi boda o superadmin" on public.wedding_guests
  for all to authenticated
  using (public.can_access_wedding(wedding_id))
  with check (public.can_access_wedding(wedding_id));

revoke all on public.wedding_tables, public.wedding_guests from anon;
grant select, insert, update, delete on public.wedding_tables, public.wedding_guests to authenticated;
revoke execute on function public.wedding_guests_guard() from public, anon, authenticated;
