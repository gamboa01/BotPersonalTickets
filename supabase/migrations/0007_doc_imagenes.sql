-- Bucket para imágenes insertadas dentro del contenido de la Documentación.
-- Aparte del bucket "adjuntos" (fotos de tickets, subidas por el bot con
-- service_role), este lo sube directo el dashboard con tu sesión de Auth,
-- así que necesita sus propias políticas de escritura sobre storage.objects.

insert into storage.buckets (id, name, public, file_size_limit)
values ('doc-imagenes', 'doc-imagenes', true, 5242880)
on conflict (id) do nothing;

create policy "admin sube imagenes de docs" on storage.objects
  for insert
  with check (bucket_id = 'doc-imagenes' and auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create policy "admin borra imagenes de docs" on storage.objects
  for delete
  using (bucket_id = 'doc-imagenes' and auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');
