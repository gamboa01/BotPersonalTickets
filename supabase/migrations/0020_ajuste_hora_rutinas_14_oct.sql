-- Rutinas del 14 de octubre de 2026: las que se marcaron a mano tarde (a las
-- 10:18) y las automáticas que quedaron con la hora exacta pasan a su hora +
-- 15 min, el mismo criterio que usa ahora el dashboard en ambos casos.
with limites as (
  select rr.id,
         rr.automatica,
         rr.completada_at,
         (rr.fecha::text || ' ' || coalesce(r.hora, j.hora_salida) || ':00-06')::timestamptz as hora_rutina
  from rutina_registros rr
  join rutinas r on r.id = rr.rutina_id
  left join jornada_semana j on j.dia = extract(dow from rr.fecha)
  where rr.fecha = '2026-10-14'
    and coalesce(r.hora, j.hora_salida) is not null
)
update rutina_registros rr
set completada_at = l.hora_rutina + interval '15 minutes'
from limites l
where rr.id = l.id
  and (
    (not l.automatica and l.completada_at > l.hora_rutina + interval '15 minutes')
    or (l.automatica and l.completada_at = l.hora_rutina)
  );
