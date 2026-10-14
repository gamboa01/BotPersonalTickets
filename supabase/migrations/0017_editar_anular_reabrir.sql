-- Editar, anular y reabrir tickets desde el dashboard. Como asignar_ticket()
-- y registrar_atencion(), son funciones security definer que validan el email
-- admin y dejan cada cambio en el historial (comentarios).

-- Anulado: creado por error o duplicado. No se borra, pero no cuenta en las
-- estadísticas ni aparece en Hoy.
alter type estado_enum add value if not exists 'anulado';

create or replace function editar_ticket(
  p_ticket_id int,
  p_descripcion text,
  p_area_id int,
  p_categoria_id int,
  p_prioridad prioridad_enum,
  p_reportado_por_nombre text,
  p_creado timestamptz,
  p_resuelto_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t tickets%rowtype;
  cambios text[] := '{}';
  v_resuelto_at timestamptz;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Falta la descripción';
  end if;

  select * into t from tickets where id = p_ticket_id;
  if not found then
    raise exception 'El ticket % no existe', p_ticket_id;
  end if;

  -- La fecha de resolución solo aplica a tickets cerrados y nunca antes de la de creación.
  v_resuelto_at := case
    when t.resolved_at is null then null
    else greatest(coalesce(p_resuelto_at, t.resolved_at), coalesce(p_creado, t.created_at))
  end;

  if trim(p_descripcion) is distinct from t.descripcion then
    cambios := cambios || 'descripción';
  end if;
  if p_area_id is distinct from t.area_id then
    cambios := cambios || format('área %s → %s',
      coalesce((select nombre from areas where id = t.area_id), 'sin área'),
      coalesce((select nombre from areas where id = p_area_id), 'sin área'));
  end if;
  if p_categoria_id is distinct from t.categoria_id then
    cambios := cambios || format('categoría %s → %s',
      coalesce((select nombre from categorias where id = t.categoria_id), 'sin categoría'),
      coalesce((select nombre from categorias where id = p_categoria_id), 'sin categoría'));
  end if;
  if p_prioridad is distinct from t.prioridad then
    cambios := cambios || format('prioridad %s → %s', t.prioridad, p_prioridad);
  end if;
  if nullif(trim(p_reportado_por_nombre), '') is distinct from t.reportado_por_nombre then
    cambios := cambios || format('pidió %s → %s', coalesce(t.reportado_por_nombre, '—'),
      coalesce(nullif(trim(p_reportado_por_nombre), ''), '—'));
  end if;
  if p_creado is not null and p_creado is distinct from t.created_at then
    cambios := cambios || format('hora de solicitud %s → %s',
      to_char(t.created_at at time zone 'America/Guatemala', 'DD/MM HH24:MI'),
      to_char(p_creado at time zone 'America/Guatemala', 'DD/MM HH24:MI'));
  end if;
  if v_resuelto_at is distinct from t.resolved_at then
    cambios := cambios || format('hora de resolución %s → %s',
      to_char(t.resolved_at at time zone 'America/Guatemala', 'DD/MM HH24:MI'),
      to_char(v_resuelto_at at time zone 'America/Guatemala', 'DD/MM HH24:MI'));
  end if;

  if array_length(cambios, 1) is null then
    return;
  end if;

  update tickets
  set descripcion = trim(p_descripcion),
      area_id = p_area_id,
      categoria_id = p_categoria_id,
      prioridad = p_prioridad,
      reportado_por_nombre = nullif(trim(p_reportado_por_nombre), ''),
      created_at = coalesce(p_creado, t.created_at),
      resolved_at = v_resuelto_at
  where id = p_ticket_id;

  insert into comentarios (ticket_id, autor, texto)
  values (p_ticket_id, 'Dashboard', 'Editado: ' || array_to_string(cambios, '; '));
end;
$$;

create or replace function anular_ticket(p_ticket_id int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;

  update tickets set estado = 'anulado' where id = p_ticket_id and estado <> 'anulado';
  if not found then
    raise exception 'El ticket % no existe o ya está anulado', p_ticket_id;
  end if;

  insert into comentarios (ticket_id, autor, texto)
  values (p_ticket_id, 'Dashboard', 'Anulado: ' || coalesce(nullif(trim(p_motivo), ''), 'Sin motivo'));
end;
$$;

-- Reabre un ticket resuelto, cerrado o anulado. Vuelve a "abierto" sin perder
-- a quién estaba asignado.
create or replace function reabrir_ticket(p_ticket_id int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;

  update tickets
  set estado = 'abierto', resolved_at = null
  where id = p_ticket_id and estado in ('resuelto', 'cerrado', 'anulado');
  if not found then
    raise exception 'El ticket % no está cerrado', p_ticket_id;
  end if;

  insert into comentarios (ticket_id, autor, texto)
  values (p_ticket_id, 'Dashboard', 'Reabierto: ' || coalesce(nullif(trim(p_motivo), ''), 'Sin motivo'));
end;
$$;

revoke execute on function editar_ticket(int, text, int, int, prioridad_enum, text, timestamptz, timestamptz) from public, anon;
grant execute on function editar_ticket(int, text, int, int, prioridad_enum, text, timestamptz, timestamptz) to authenticated;
revoke execute on function anular_ticket(int, text) from public, anon;
grant execute on function anular_ticket(int, text) to authenticated;
revoke execute on function reabrir_ticket(int, text) from public, anon;
grant execute on function reabrir_ticket(int, text) to authenticated;
