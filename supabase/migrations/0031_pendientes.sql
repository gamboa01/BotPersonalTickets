-- Pizarra de pendientes del departamento: cosas por hacer que no son tickets
-- (proyectos, compras, configuraciones…). Se ven en Hoy, también en la
-- pantalla de TI. Se agregan desde el dashboard o con /pendiente en el bot;
-- al marcarlos hechos se quedan tachados el resto del día y luego se ocultan.
create table pendientes (
  id serial primary key,
  texto text not null,
  tecnico_id int references tecnicos(id) on delete set null,
  creado_at timestamptz not null default now(),
  hecho_at timestamptz
);

create index pendientes_abiertos_idx on pendientes (creado_at) where hecho_at is null;

alter table pendientes enable row level security;
create policy "acceso total admin pendientes" on pendientes
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.pendientes;
