-- Corrige editar_ticket(): `cambios || 'descripción'` hacía que Postgres leyera
-- el texto como un arreglo ("malformed array literal") al editar la descripción.
-- Se usa array_append() para agregar cada cambio.
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
    cambios := array_append(cambios, 'descripción');
  end if;
  if p_area_id is distinct from t.area_id then
    cambios := array_append(cambios, format('área %s → %s',
      coalesce((select nombre from areas where id = t.area_id), 'sin área'),
      coalesce((select nombre from areas where id = p_area_id), 'sin área')));
  end if;
  if p_categoria_id is distinct from t.categoria_id then
    cambios := array_append(cambios, format('categoría %s → %s',
      coalesce((select nombre from categorias where id = t.categoria_id), 'sin categoría'),
      coalesce((select nombre from categorias where id = p_categoria_id), 'sin categoría')));
  end if;
  if p_prioridad is distinct from t.prioridad then
    cambios := array_append(cambios, format('prioridad %s → %s', t.prioridad, p_prioridad));
  end if;
  if nullif(trim(p_reportado_por_nombre), '') is distinct from t.reportado_por_nombre then
    cambios := array_append(cambios, format('pidió %s → %s', coalesce(t.reportado_por_nombre, '—'),
      coalesce(nullif(trim(p_reportado_por_nombre), ''), '—')));
  end if;
  if p_creado is not null and p_creado is distinct from t.created_at then
    cambios := array_append(cambios, format('hora de solicitud %s → %s',
      to_char(t.created_at at time zone 'America/Guatemala', 'DD/MM HH24:MI'),
      to_char(p_creado at time zone 'America/Guatemala', 'DD/MM HH24:MI')));
  end if;
  if v_resuelto_at is distinct from t.resolved_at then
    cambios := array_append(cambios, format('hora de resolución %s → %s',
      to_char(t.resolved_at at time zone 'America/Guatemala', 'DD/MM HH24:MI'),
      to_char(v_resuelto_at at time zone 'America/Guatemala', 'DD/MM HH24:MI')));
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
