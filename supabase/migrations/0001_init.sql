-- Esquema inicial: categorias, tickets, comentarios y sesiones del bot

create type prioridad_enum as enum ('baja', 'media', 'alta', 'critica');
create type estado_enum as enum ('abierto', 'en_progreso', 'resuelto', 'cerrado');

create table categorias (
  id serial primary key,
  nombre text not null unique
);

insert into categorias (nombre) values
  ('Hardware'), ('Software'), ('Redes'), ('Accesos'), ('Otros');

create table tickets (
  id serial primary key,
  descripcion text not null,
  categoria_id int references categorias(id),
  prioridad prioridad_enum not null default 'media',
  estado estado_enum not null default 'abierto',
  reportado_por bigint not null,
  reportado_por_nombre text,
  asignado_a text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table comentarios (
  id serial primary key,
  ticket_id int not null references tickets(id) on delete cascade,
  autor text not null,
  texto text not null,
  created_at timestamptz not null default now()
);

-- Estado conversacional del bot por usuario de Telegram (no se expone al dashboard)
create table bot_sessions (
  telegram_id bigint primary key,
  step text not null,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tickets_updated_at
before update on tickets
for each row execute function set_updated_at();

-- Row Level Security: el dashboard usa la anon key y solo debe poder leer.
-- Todas las escrituras las hace la Edge Function con la service_role key (bypasea RLS).
alter table categorias enable row level security;
alter table tickets enable row level security;
alter table comentarios enable row level security;
alter table bot_sessions enable row level security;

create policy "lectura publica categorias" on categorias for select using (true);
create policy "lectura publica tickets" on tickets for select using (true);
create policy "lectura publica comentarios" on comentarios for select using (true);
-- bot_sessions no tiene políticas: anon/authenticated no pueden leer ni escribir, solo service_role.
