-- Categorías editables desde el dashboard (Hoy > Categorías). No se borran:
-- se desactivan, para que los tickets que ya la usan la conserven.
alter table categorias add column activa boolean not null default true;

drop policy "lectura solo admin categorias" on categorias;
create policy "acceso total admin categorias" on categorias
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.categorias;

insert into categorias (nombre) values
  ('Línea de producción'),
  ('Tablets'),
  ('TV''s')
on conflict (nombre) do nothing;
