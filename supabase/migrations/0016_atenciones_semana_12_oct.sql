-- Carga de las atenciones del lunes 12 al miércoles 14 de octubre de 2026,
-- registradas antes de usar el sistema. Todas las atendió Guillermo. Las
-- horas sin dato son aproximadas. Las áreas se buscan por nombre en el
-- croquis; si un nombre no existe, el ticket queda "Sin área".

-- Busca un área por nombre exacto (sin mayúsculas ni tildes) entre varias opciones.
create function pg_temp.area_por_nombre(nombres text[])
returns int
language sql
as $$
  select a.id
  from areas a
  join unnest(nombres) with ordinality as n(nombre, prioridad)
    on lower(translate(a.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = n.nombre
  where a.tipo <> 'referencia'
  order by n.prioridad, a.id
  limit 1
$$;

create function pg_temp.categoria(nombre_cat text)
returns int
language sql
as $$
  select id from categorias where nombre = nombre_cat
$$;

do $$
declare
  v_guillermo int := (select id from tecnicos where lower(nombre) = 'guillermo' order by id limit 1);
  v_luis int := (select id from tecnicos where lower(nombre) = 'luis' order by id limit 1);
  v_rrhh int := pg_temp.area_por_nombre(array['recursos humanos', 'rrhh', 'talento humano']);
  v_ti int := pg_temp.area_por_nombre(array['ti', 'it', 'sala ti', 'oficina ti', 'sistemas', 'informatica', 'tecnologia', 'soporte ti']);
  v_corte int := pg_temp.area_por_nombre(array['corte', 'area de corte', 'departamento de corte']);
  v_gerencia int := pg_temp.area_por_nombre(array['gerencia', 'gerencia general']);
  v_bodega int := pg_temp.area_por_nombre(array['bodega de productos', 'bodega de producto', 'bodega de producto terminado', 'bodega']);
  v_id int;
begin
  -- Lunes 12 ------------------------------------------------------------
  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('El escáner no enviaba los escaneos (protocolo SMTP).', v_rrhh, pg_temp.categoria('Impresoras y etiquetas'),
          'media', 'resuelto', 0, 'RRHH', v_guillermo, '2026-10-12 09:00-06', '2026-10-12 09:00-06', '2026-10-13 15:00-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Seguimiento: Se solicitó apoyo al SOC de Tigo Business.', '2026-10-12 09:30-06'),
    (v_id, 'Guillermo', 'Resuelto: En reunión con el SOC de Tigo Business se probó y el escáner funcionó nuevamente.', '2026-10-13 15:00-06');

  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Recepción de tablets enviadas.', v_ti, pg_temp.categoria('Otros'),
          'baja', 'resuelto', 0, 'IT', v_guillermo, '2026-10-12 10:00-06', '2026-10-12 10:00-06', '2026-10-12 10:30-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Tablets recibidas.', '2026-10-12 10:30-06');

  -- Martes 13 -----------------------------------------------------------
  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Instalar AnyDesk.', v_rrhh, pg_temp.categoria('Computadoras'),
          'media', 'resuelto', 0, 'Yamilet (RRHH)', v_guillermo, '2026-10-13 08:30-06', '2026-10-13 08:30-06', '2026-10-13 09:00-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se instaló, probó y configuró AnyDesk.', '2026-10-13 09:00-06');

  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Revisar la impresora.', v_corte, pg_temp.categoria('Impresoras y etiquetas'),
          'media', 'resuelto', 0, 'Corte', v_guillermo, '2026-10-13 10:00-06', '2026-10-13 10:00-06', '2026-10-13 10:45-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se usó el ajustador de EPSON para reiniciar el contador de almohadillas (ink pad counter).', '2026-10-13 10:45-06');

  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Revisar la contraseña de una computadora.', v_corte, pg_temp.categoria('Accesos y contraseñas'),
          'baja', 'resuelto', 0, 'Corte', v_guillermo, '2026-10-13 11:30-06', '2026-10-13 11:30-06', '2026-10-13 11:40-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se verificó el acceso; solo estaba activado Bloq Mayús.', '2026-10-13 11:40-06');

  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Las TV''s no mostraban datos.', v_gerencia, pg_temp.categoria('Otros'),
          'media', 'resuelto', 0, 'Gerencia', v_guillermo, '2026-10-13 13:00-06', '2026-10-13 13:00-06', '2026-10-13 13:30-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se revisaron las TV''s.', '2026-10-13 13:30-06');

  -- Miércoles 14 --------------------------------------------------------
  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('Urgencia: el servidor no respondía por la mañana.', v_ti, pg_temp.categoria('Sistemas / ERP'),
          'critica', 'resuelto', 0, 'IT', v_guillermo, '2026-10-14 07:15-06', '2026-10-14 07:15-06', '2026-10-14 07:30-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se reinició el servicio.', '2026-10-14 07:30-06');

  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at, resolved_at)
  values ('La impresora imprimía con líneas.', v_bodega, pg_temp.categoria('Impresoras y etiquetas'),
          'media', 'resuelto', 0, 'Bodega de productos', v_guillermo, '2026-10-14 10:00-06', '2026-10-14 10:00-06', '2026-10-14 10:30-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Resuelto: Se hizo limpieza de cabezales.', '2026-10-14 10:30-06');

  -- Sigue abierto: la reunión era para resolverlo, no hay confirmación de cierre.
  insert into tickets (descripcion, area_id, categoria_id, prioridad, estado, reportado_por, reportado_por_nombre,
                       asignado_id, asignado_at, created_at)
  values ('Las llamadas de WhatsApp no funcionan por el firewall instalado la semana pasada.', v_ti, pg_temp.categoria('Red e Internet'),
          'alta', 'en_progreso', 0, 'IT', v_guillermo, '2026-10-14 09:00-06', '2026-10-14 09:00-06')
  returning id into v_id;
  insert into comentarios (ticket_id, autor, texto, created_at) values
    (v_id, 'Guillermo', 'Seguimiento: Reunión a las 9:00 a.m. con el SOC de Tigo Business para resolverlo.', '2026-10-14 09:00-06');

  -- Rutinas del lunes 12 y martes 13 ---------------------------------------
  -- Martes 13: Luis se ausentó desde las 14:30 y Guillermo cubrió lo de la salida.
  insert into ausencias (tecnico_id, fecha, desde, cubre_id, nota)
  select v_luis, '2026-10-13', '14:30', v_guillermo, 'Se retiró a las 2:30 p.m.'
  where v_luis is not null;

  insert into rutina_registros (rutina_id, fecha, tecnico_id, completada_at)
  select r.id, d.fecha,
         case when d.fecha = '2026-10-13' and r.referencia = 'salida' and r.tecnico_id = v_luis
              then v_guillermo else r.tecnico_id end,
         (d.fecha::text || ' ' || coalesce(r.hora, d.salida) || ':00-06')::timestamptz
  from rutinas r
  cross join (values ('2026-10-12'::date, '16:00'), ('2026-10-13'::date, '17:00')) as d(fecha, salida)
  where r.activo and extract(dow from d.fecha)::smallint = any(r.dias)
  on conflict (rutina_id, fecha) do nothing;
end;
$$;
