-- Límite de frecuencia por usuario de Telegram (anti-spam)

create table rate_limits (
  telegram_id bigint primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table rate_limits enable row level security;
-- Sin políticas: solo la Edge Function (service_role) puede leer/escribir esta tabla.
