-- Horario de almuerzo por persona (antes era 12:00–12:45 para todos). Se
-- edita en Hoy → Equipo. almuerzo_hora null = sin almuerzo automático (la
-- persona lo marca a mano con el botón "Almuerzo").
alter table tecnicos
  add column almuerzo_hora text default '12:00' check (almuerzo_hora ~ '^\d{2}:\d{2}$'),
  add column almuerzo_min int not null default 45 check (almuerzo_min between 10 and 120);
