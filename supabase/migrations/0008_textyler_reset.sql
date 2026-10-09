-- Reinicio para Textyler: el proyecto Supabase se restauró desde la versión de
-- Alatina, así que se vacían los datos operativos de tickets y se reemplazan
-- las categorías por las de soporte TI de planta.
--
-- No toca `docs` (Documentación) ni los archivos de Storage: las fotos viejas
-- del bucket "adjuntos" se borran desde el panel (Storage > adjuntos), porque
-- Supabase no permite borrar storage.objects por SQL.

-- restart identity: los nuevos tickets vuelven a empezar en #1.
truncate table adjuntos, comentarios, tickets, categorias, bot_sessions, rate_limits
  restart identity;

insert into categorias (nombre) values
  ('Computadoras'), ('Impresoras y etiquetas'), ('Red e Internet'), ('Correo'),
  ('Sistemas / ERP'), ('Accesos y contraseñas'), ('Telefonía'), ('Reloj marcador'),
  ('Otros');
