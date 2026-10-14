-- Almuerzo del equipo de TI, para que la pantalla avise quién está y quién no
-- ("Guillermo en almuerzo, Luis puede atenderte" / "Regresamos a las 13:00").
-- Se marca a mano desde Hoy (no todos almuerzan a la misma hora). Al pasar
-- `fin` sin haber marcado el regreso, el dashboard lo da por de vuelta.
create table almuerzos (
  id serial primary key,
  tecnico_id int not null references tecnicos(id) on delete cascade,
  fecha date not null,
  inicio timestamptz not null default now(),
  fin timestamptz not null,
  regreso timestamptz,
  unique (tecnico_id, fecha)
);

alter table almuerzos enable row level security;
create policy "acceso total admin almuerzos" on almuerzos
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.almuerzos;
