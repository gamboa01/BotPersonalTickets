-- Restringe la lectura del dashboard a un único usuario autenticado.
-- El bot sigue funcionando igual: usa la service_role key, que siempre
-- bypasea RLS, así que estas políticas no le afectan en nada.

drop policy "lectura publica tickets" on tickets;
drop policy "lectura publica categorias" on categorias;
drop policy "lectura publica comentarios" on comentarios;
drop policy "lectura publica adjuntos" on adjuntos;

create policy "lectura solo admin tickets" on tickets
  for select using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "lectura solo admin categorias" on categorias
  for select using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "lectura solo admin comentarios" on comentarios
  for select using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "lectura solo admin adjuntos" on adjuntos
  for select using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');
