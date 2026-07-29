-- Bitácora / base de conocimiento interna. Tabla aislada de tickets: sin
-- relación (FK) con esas tablas, es contenido redactado, no transaccional.
--
-- A diferencia de tickets/categorias/comentarios/adjuntos (solo lectura desde
-- el dashboard), aquí el dashboard SÍ escribe directo: es contenido que tú
-- mismo redactas y editas, no eventos que deba generar el bot.

create table docs (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  category text,
  tags text[] not null default '{}',
  username text,
  url text,
  cred_ref text,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index docs_category_idx on docs (category);
create index docs_updated_at_idx on docs (updated_at desc);

alter table docs enable row level security;

-- Una sola política para todo (select/insert/update/delete): ambas cláusulas
-- exigen que sea tu correo, igual que en las políticas de tickets.
create policy "acceso total admin docs" on docs
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');
