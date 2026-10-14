-- Pantalla "Hoy": quién atiende cada ticket y rutinas diarias del equipo de TI.

-- Equipo de TI que atiende tickets (se edita desde el dashboard: Hoy > Equipo).
create table tecnicos (
  id serial primary key,
  nombre text not null,
  color text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table tecnicos enable row level security;
create policy "acceso total admin tecnicos" on tecnicos
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

insert into tecnicos (nombre, color) values ('Luis', '#c084fc');

-- `asignado_a` (texto) queda sin uso; la asignación real es por técnico.
alter table tickets add column asignado_id int references tecnicos(id) on delete set null;
alter table tickets add column asignado_at timestamptz;

-- Los tickets siguen siendo de solo lectura para el dashboard: asignar pasa
-- por esta función, que solo cambia la asignación y deja rastro en el historial.
create or replace function asignar_ticket(p_ticket_id int, p_tecnico_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;

  if p_tecnico_id is not null then
    select nombre into v_nombre from tecnicos where id = p_tecnico_id;
    if v_nombre is null then
      raise exception 'Técnico % no existe', p_tecnico_id;
    end if;
  end if;

  update tickets
  set asignado_id = p_tecnico_id,
      asignado_at = case when p_tecnico_id is null then null else now() end
  where id = p_ticket_id;

  insert into comentarios (ticket_id, autor, texto)
  values (p_ticket_id, 'Dashboard', coalesce('Asignado a ' || v_nombre, 'Sin asignar'));
end;
$$;

revoke execute on function asignar_ticket(int, int) from public, anon;
grant execute on function asignar_ticket(int, int) to authenticated;

-- Rutinas diarias (base; la edición desde el dashboard se agrega después).
-- `dias` usa extract(dow): 0 = domingo … 6 = sábado.
create table rutinas (
  id serial primary key,
  nombre text not null,
  descripcion text,
  hora text check (hora is null or hora ~ '^\d{2}:\d{2}$'),
  dias smallint[] not null default '{1,2,3,4,5,6}',
  tecnico_id int references tecnicos(id) on delete set null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

-- Una fila por rutina completada en un día (fecha de Guatemala).
create table rutina_registros (
  id serial primary key,
  rutina_id int not null references rutinas(id) on delete cascade,
  fecha date not null,
  tecnico_id int references tecnicos(id) on delete set null,
  completada_at timestamptz not null default now(),
  unique (rutina_id, fecha)
);

alter table rutinas enable row level security;
alter table rutina_registros enable row level security;

create policy "acceso total admin rutinas" on rutinas
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "acceso total admin rutina_registros" on rutina_registros
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.tecnicos;
alter publication supabase_realtime add table public.rutinas;
alter publication supabase_realtime add table public.rutina_registros;
