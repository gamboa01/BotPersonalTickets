-- Almuerzo automático a las 12:00: el dashboard lo marca solo para quien no
-- esté ausente. Quien sigue trabajando lo pospone ("Sigo trabajando") y marca
-- su almuerzo a mano al salir.
alter table almuerzos add column automatico boolean not null default false;
-- Pospuesto: el automático se canceló porque la persona siguió trabajando;
-- su almuerzo sigue pendiente hasta que lo marque a mano.
alter table almuerzos add column pospuesto boolean not null default false;
