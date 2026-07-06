-- Fotos adjuntas a tickets, guardadas en Supabase Storage

create table adjuntos (
  id serial primary key,
  ticket_id int not null references tickets(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

alter table adjuntos enable row level security;
create policy "lectura publica adjuntos" on adjuntos for select using (true);
-- Sin política de escritura: solo la Edge Function (service_role) puede insertar.

-- Bucket público: coherente con el resto de la app (tickets/categorias/comentarios
-- también son de lectura pública vía anon key). Límite de 5MB como salvaguarda
-- extra, aunque las fotos ya se redimensionan/comprimen antes de subirlas.
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', true, 5242880)
on conflict (id) do nothing;
