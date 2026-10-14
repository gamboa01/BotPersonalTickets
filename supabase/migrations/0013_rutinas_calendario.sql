-- Rutinas con hora fija o ligada a la hora de salida del día, y un calendario
-- laboral (horario base por día de la semana + excepciones por fecha) que
-- decide qué rutinas tocan hoy: en un descanso no aparece ninguna, y en una
-- reposición (p. ej. un sábado) aparecen las de un día normal.

-- 'fija': usa `hora`. 'salida': hora de salida del día + `minutos_salida`
-- (negativo = antes de la salida).
alter table rutinas add column referencia text not null default 'fija'
  check (referencia in ('fija', 'salida'));
alter table rutinas add column minutos_salida int not null default 0;
alter table rutinas alter column dias set default '{1,2,3,4,5}';

-- Horario base: una fila por día de la semana (0 = domingo … 6 = sábado).
create table jornada_semana (
  dia smallint primary key check (dia between 0 and 6),
  laboral boolean not null,
  hora_salida text check (hora_salida is null or hora_salida ~ '^\d{2}:\d{2}$')
);

insert into jornada_semana (dia, laboral, hora_salida) values
  (0, false, null),
  (1, true, '16:00'),
  (2, true, '17:00'),
  (3, true, '17:00'),
  (4, true, '17:00'),
  (5, true, '17:00'),
  (6, false, null);

-- Excepciones a la jornada base para una fecha concreta: descansos, reposiciones
-- o un día con otra hora de salida. `como_dia` dice qué rutinas usar en una
-- reposición (p. ej. un sábado que se trabaja "como un martes").
create table calendario_excepciones (
  fecha date primary key,
  laboral boolean not null,
  hora_salida text check (hora_salida is null or hora_salida ~ '^\d{2}:\d{2}$'),
  como_dia smallint check (como_dia between 0 and 6),
  nota text,
  created_at timestamptz not null default now()
);

alter table jornada_semana enable row level security;
alter table calendario_excepciones enable row level security;

create policy "acceso total admin jornada_semana" on jornada_semana
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "acceso total admin calendario_excepciones" on calendario_excepciones
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.jornada_semana;
alter publication supabase_realtime add table public.calendario_excepciones;

-- Descanso del lunes 19 y martes 20 de octubre de 2026.
insert into calendario_excepciones (fecha, laboral, nota) values
  ('2026-10-19', false, 'Descanso'),
  ('2026-10-20', false, 'Descanso');

-- Rutinas iniciales del equipo de TI (lunes a viernes).
insert into rutinas (nombre, descripcion, referencia, hora, tecnico_id, dias, orden)
select r.nombre, r.descripcion, r.referencia, r.hora, t.id, '{1,2,3,4,5}', r.orden
from (values
  ('Encender equipos',          'Computadora y sonido',                     'fija',   '06:10', 'guillermo', 1),
  ('Tablets Línea A',           'Colocarlas en la estación de trabajo',     'fija',   '06:30', 'luis',      2),
  ('Tablets Línea B',           'Colocarlas en la estación de trabajo',     'fija',   '06:30', 'guillermo', 3),
  ('TV''s Línea A',             'Encenderlas y abrir el navegador',         'fija',   '06:30', 'luis',      4),
  ('TV''s Línea B',             'Encenderlas y abrir el navegador',         'fija',   '06:30', 'guillermo', 5),
  ('Solicitar hojas de trabajo','Ir por las hojas de trabajo',              'fija',   '06:50', 'luis',      6),
  ('Ingresar inspecciones',     'Ingresar inspecciones',                    'fija',   '06:50', 'guillermo', 7),
  ('Subir volumen comedor',     'Dejar el volumen del comedor a la mitad',  'fija',   '12:00', 'luis',      8),
  ('Bajar volumen comedor',     'Silenciar el comedor',                     'fija',   '13:00', 'guillermo', 9),
  ('Quitar tablets Línea A',    'Quitarlas de la estación de trabajo',      'salida', null,    'luis',      10),
  ('Quitar tablets Línea B',    'Quitarlas de la estación de trabajo',      'salida', null,    'guillermo', 11),
  ('Apagar TV''s Línea A',      'Apagar las TV''s de la línea',             'salida', null,    'luis',      12),
  ('Apagar TV''s Línea B',      'Apagar las TV''s de la línea',             'salida', null,    'guillermo', 13)
) as r(nombre, descripcion, referencia, hora, tecnico, orden)
left join lateral (
  select id from tecnicos where lower(nombre) = r.tecnico order by id limit 1
) t on true;
