-- Préstamos de equipo (cables, adaptadores, laptops…). Texto libre para el
-- equipo: el inventario vive en un Excel aparte. Sin fecha de devolución: un
-- préstamo está activo hasta que se marca devuelto.
create table prestamos (
  id serial primary key,
  equipo text not null,
  prestado_a text not null,
  area_id int references areas(id) on delete set null,
  tecnico_id int references tecnicos(id) on delete set null,
  nota text,
  prestado_at timestamptz not null default now(),
  devuelto_at timestamptz
);

create index prestamos_activos_idx on prestamos (prestado_at desc) where devuelto_at is null;

-- Se registran desde el dashboard (solo la PC del admin) y desde el bot
-- (service_role, registro rápido "Préstamo").
alter table prestamos enable row level security;
create policy "acceso total admin prestamos" on prestamos
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.prestamos;
