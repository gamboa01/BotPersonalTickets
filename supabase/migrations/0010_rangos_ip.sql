-- Rangos de IP de la red de Textyler y su política en el firewall.
-- Lo consulta el bot con /ip <dirección>; el dashboard solo lee.
--
-- Se guardan como inicio/fin (no cidr) porque los rangos del firewall no
-- siempre coinciden con bloques CIDR (p. ej. 192.168.10.2 – 192.168.10.199).

create table rangos_ip (
  id serial primary key,
  desde inet not null,
  hasta inet not null,
  politica text not null,
  descripcion text,
  created_at timestamptz not null default now(),
  check (desde <= hasta)
);

alter table rangos_ip enable row level security;
create policy "lectura solo admin rangos_ip" on rangos_ip
  for select using (auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

-- Devuelve los rangos que contienen la IP, del más angosto al más amplio,
-- por si alguna vez se registran rangos anidados.
create or replace function buscar_rango_ip(ip inet)
returns setof rangos_ip
language sql stable
as $$
  select * from rangos_ip where ip between desde and hasta order by hasta - desde;
$$;

-- Solo la Edge Function (service_role) la llama.
revoke execute on function buscar_rango_ip(inet) from public, anon, authenticated;

insert into rangos_ip (desde, hasta, politica) values
  ('192.168.10.2',   '192.168.10.199', 'Estricta'),
  ('192.168.10.200', '192.168.10.254', 'Flexible'),
  ('192.168.20.2',   '192.168.20.100', 'Flexible'),
  ('192.168.20.101', '192.168.20.254', 'LAN to LAN (sin salida a WAN)'),
  ('192.168.68.0',   '192.168.68.255', 'LAN to LAN (sin salida a WAN)');
