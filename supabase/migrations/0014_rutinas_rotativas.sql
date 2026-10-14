-- Rutinas con responsable rotativo: si `rotacion` tiene técnicos, el
-- responsable de cada día se turna entre ellos (un día cada uno, en orden) y
-- `tecnico_id` se ignora. El turno se calcula en el dashboard (rutinasUtils.ts).
alter table rutinas add column rotacion int[] not null default '{}';

insert into rutinas (nombre, descripcion, referencia, hora, tecnico_id, dias, orden)
select 'Encender TV''s principales', 'Entrada principal', 'fija', '07:00', t.id, '{1,2,3,4,5}', 14
from (select 1) x
left join lateral (
  select id from tecnicos where lower(nombre) = 'guillermo' order by id limit 1
) t on true;
