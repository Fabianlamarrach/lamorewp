-- Grupo / familia de cada invitado («Familia Sosa», «Amigos de Clara»…).
-- El plan de mesas agrupa y colorea a los invitados por este campo; vacío = se agrupan por lado de la pareja.

alter table public.wedding_guests
  add column group_name text not null default '' check (char_length(group_name) <= 60);
