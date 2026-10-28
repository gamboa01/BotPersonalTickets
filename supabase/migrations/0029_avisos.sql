-- Avisos que el bot (/aviso) manda a la pantalla de TI (#pantalla): se
-- muestran unos segundos a pantalla completa con un sonido. No llegan a la
-- vista de Gerencia (solo el admin puede leerlos).
create table avisos (
  id serial primary key,
  mensaje text not null,
  segundos int not null default 8 check (segundos between 3 and 30),
  enviado_por text,
  created_at timestamptz not null default now()
);

alter table avisos enable row level security;
create policy "acceso total admin avisos" on avisos
  for all
  using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

alter publication supabase_realtime add table public.avisos;
