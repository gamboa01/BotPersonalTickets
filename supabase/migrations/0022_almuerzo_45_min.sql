-- El almuerzo automático pasó de 60 a 45 minutos (12:00–12:45). Los que se
-- crearon con la versión anterior quedaron hasta las 13:00: se ajustan.
update almuerzos
set fin = inicio + interval '45 minutes'
where automatico
  and regreso is null
  and fin - inicio = interval '60 minutes';
