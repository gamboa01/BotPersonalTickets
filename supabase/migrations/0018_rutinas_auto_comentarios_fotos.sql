-- Rutinas marcadas solas a los 15 min de su hora, y comentarios/fotos de
-- tickets desde el dashboard.

-- automatica: la marcó el dashboard al pasar la hora + 15 min sin que nadie lo
-- hiciera. omitida: se revisó y NO se hizo (no cuenta como cumplida).
alter table rutina_registros add column automatica boolean not null default false;
alter table rutina_registros add column omitida boolean not null default false;

-- Comentario o seguimiento desde el dashboard. El seguimiento pasa el ticket a
-- "en progreso" si estaba abierto, igual que /seguimiento en el bot.
create or replace function comentar_ticket(p_ticket_id int, p_texto text, p_seguimiento boolean, p_autor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'El comentario está vacío';
  end if;
  if not exists (select 1 from tickets where id = p_ticket_id) then
    raise exception 'El ticket % no existe', p_ticket_id;
  end if;

  insert into comentarios (ticket_id, autor, texto)
  values (
    p_ticket_id,
    coalesce(nullif(trim(p_autor), ''), 'Dashboard'),
    case when p_seguimiento then 'Seguimiento: ' else 'Comentario: ' end || trim(p_texto)
  );

  if p_seguimiento then
    update tickets set estado = 'en_progreso' where id = p_ticket_id and estado = 'abierto';
  end if;
end;
$$;

revoke execute on function comentar_ticket(int, text, boolean, text) from public, anon;
grant execute on function comentar_ticket(int, text, boolean, text) to authenticated;

-- Fotos: el dashboard sube el archivo al bucket "adjuntos" (mismo que usa el
-- bot) dentro de la carpeta del ticket, y registra la URL con esta función,
-- que respeta el mismo tope de 4 fotos por ticket que el bot.
create policy "admin sube fotos de tickets" on storage.objects
  for insert
  with check (bucket_id = 'adjuntos' and auth.jwt() ->> 'email' = 'gamboaguillermo12@gmail.com');

create or replace function agregar_adjunto(p_ticket_id int, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'gamboaguillermo12@gmail.com' then
    raise exception 'No autorizado';
  end if;
  if (select count(*) from adjuntos where ticket_id = p_ticket_id) >= 4 then
    raise exception 'El ticket % ya tiene el máximo de 4 fotos', p_ticket_id;
  end if;

  insert into adjuntos (ticket_id, url) values (p_ticket_id, p_url);
  insert into comentarios (ticket_id, autor, texto) values (p_ticket_id, 'Dashboard', 'Foto adjuntada');
end;
$$;

revoke execute on function agregar_adjunto(int, text) from public, anon;
grant execute on function agregar_adjunto(int, text) to authenticated;
