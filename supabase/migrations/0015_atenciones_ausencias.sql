-- Registrar atenciones desde el dashboard (lo que piden en persona, sin bot)
-- y ausencias del equipo para pasar sus rutinas a otra persona.

-- Los tickets siguen sin escritura directa desde el dashboard: igual que
-- asignar_ticket(), esta función valida el email admin y deja historial.
-- reportado_por = 0 marca tickets que no vienen de un usuario de Telegram.
create or replace function registrar_atencion(
  p_descripcion text,
  p_area_id int,
  p_categoria_id int,
  p_prioridad prioridad_enum,
  p_reportado_por_nombre text,
  p_tecnico_id int,
  p_creado timestamptz,
  p_resuelto boolean,
  p_resuelto_at timestamptz,
  p_resolucion text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id int;
  v_creado timestamptz := coalesce(p_creado, now());
  v_resuelto_at timestamptz := greatest(coalesce(p_resuelto_at, now()), coalesce(p_creado, now()));
  v_tecnico text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Falta la descripción';
  end if;

  select nombre into v_tecnico from tecnicos where id = p_tecnico_id;

  insert into tickets (
    descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
    asignado_id, asignado_at, created_at, resolved_at
  ) values (
    trim(p_descripcion), p_area_id, p_categoria_id, coalesce(p_prioridad, 'media'),
    case when p_resuelto then 'resuelto'::estado_enum else 'abierto'::estado_enum end,
    0, nullif(trim(p_reportado_por_nombre), ''),
    p_tecnico_id, case when p_tecnico_id is null then null else v_creado end,
    v_creado, case when p_resuelto then v_resuelto_at end
  )
  returning id into v_id;

  insert into comentarios (ticket_id, autor, texto, created_at)
  values (v_id, 'Dashboard', 'Registrado desde el dashboard', v_creado);

  if p_resuelto then
    insert into comentarios (ticket_id, autor, texto, created_at)
    values (v_id, coalesce(v_tecnico, 'Dashboard'), 'Resuelto: ' || coalesce(nullif(trim(p_resolucion), ''), 'Atendido'), v_resuelto_at);
  end if;

  return v_id;
end;
$$;

revoke execute on function registrar_atencion(text, int, int, prioridad_enum, text, int, timestamptz, boolean, timestamptz, text)
  from public, anon;
grant execute on function registrar_atencion(text, int, int, prioridad_enum, text, int, timestamptz, boolean, timestamptz, text)
  to authenticated;

-- Resolver desde el dashboard (además del /resolver del bot). No avisa por
-- Telegram a quien reportó: para eso sigue el botón que abre el bot.
create or replace function resolver_ticket(p_ticket_id int, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;

  update tickets
  set estado = 'resuelto', resolved_at = now()
  where id = p_ticket_id and estado in ('abierto', 'en_progreso');
  if not found then
    raise exception 'El ticket % no está pendiente', p_ticket_id;
  end if;

  select tc.nombre into v_autor from tickets t join tecnicos tc on tc.id = t.asignado_id where t.id = p_ticket_id;
  insert into comentarios (ticket_id, autor, texto)
  values (p_ticket_id, coalesce(v_autor, 'Dashboard'), 'Resuelto: ' || coalesce(nullif(trim(p_nota), ''), 'Atendido'));
end;
$$;

revoke execute on function resolver_ticket(int, text) from public, anon;
grant execute on function resolver_ticket(int, text) to authenticated;

-- Ausencia de un técnico en una fecha: todo el día (desde = null) o a partir
-- de una hora. Sus rutinas de ese rango pasan a `cubre_id` o, si es null, a
-- otra persona activa del equipo (lo resuelve el dashboard).
create table ausencias (
  id serial primary key,
  tecnico_id int not null references tecnicos(id) on delete cascade,
  fecha date not null,
  desde text check (desde is null or desde ~ '^\d{2}:\d{2}$'),
  cubre_id int references tecnicos(id) on delete set null,
  nota text,
  created_at timestamptz not null default now(),
  unique (tecnico_id, fecha)
);

alter table ausencias enable row level security;
create policy "acceso total admin ausencias" on ausencias
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.ausencias;
