-- Croquis de la planta: áreas dibujadas como rectángulos sobre una cuadrícula
-- (60 x 30 celdas, con la entrada principal abajo), en planta baja (1) o alta (2).
--
-- Igual que `docs`, es contenido que se edita desde el dashboard, así que el
-- admin tiene escritura completa. El bot solo lee (service_role) para /areas
-- y para preguntar el área en /nuevo.

create table areas (
  id serial primary key,
  nombre text not null,
  nivel smallint not null check (nivel in (1, 2)),
  -- area: departamento que reporta tickets; produccion: piso de producción
  -- (se ve "a doble altura" desde la planta alta); referencia: gradas,
  -- entrada, baños... solo para orientarse, no se ofrece en /nuevo.
  tipo text not null default 'area' check (tipo in ('area', 'produccion', 'referencia')),
  x int not null check (x >= 0),
  y int not null check (y >= 0),
  w int not null check (w > 0),
  h int not null check (h > 0),
  color text,
  ubicacion text,
  encargado text,
  extension text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_areas_updated_at
before update on areas
for each row execute function set_updated_at();

alter table areas enable row level security;

create policy "acceso total admin areas" on areas
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

-- Área desde donde se reporta el ticket (opcional: tickets viejos y "No sé").
alter table tickets add column area_id int references areas(id) on delete set null;

alter publication supabase_realtime add table public.areas;

-- Punto de partida: el piso de costura al centro. Los costados se dibujan
-- desde el dashboard (pestaña Planta > Editar plano).
insert into areas (nombre, nivel, tipo, x, y, w, h, ubicacion) values
  ('Área de costura', 1, 'produccion', 16, 2, 28, 26, 'Centro de la planta baja');
