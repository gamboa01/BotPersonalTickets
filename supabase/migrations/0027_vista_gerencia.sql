-- Vista de Gerencia: una cuenta de solo lectura que ve el resumen del
-- departamento en porcentajes (atenciones resueltas, rutinas cumplidas y
-- categorías más solicitadas), sin detalle de tickets.

-- Quién tiene acceso además del admin. Se administra por SQL:
--   insert into accesos (email, rol) values ('alguien@empresa.com', 'gerencia');
create table accesos (
  email text primary key,
  rol text not null check (rol in ('gerencia'))
);
alter table accesos enable row level security;
-- Sin políticas: solo se lee a través de las funciones de abajo.

insert into accesos (email, rol) values ('gerencia@textyler.com', 'gerencia');

create or replace function es_gerencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from accesos
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and rol = 'gerencia'
  );
$$;

-- Rol de la sesión actual, para que el dashboard sepa qué vista mostrar.
create or replace function mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.jwt() ->> 'email', '') = 'gamboaguillermo12@gmail.com' then 'admin'
    when es_gerencia() then 'gerencia'
    else null
  end;
$$;

revoke execute on function es_gerencia() from public, anon;
grant execute on function es_gerencia() to authenticated;
revoke execute on function mi_rol() from public, anon;
grant execute on function mi_rol() to authenticated;

-- Tickets: Gerencia no los lee directamente (tienen descripciones y nombres).
-- Esta función le entrega solo los totales: recibidos y resueltos de hoy, la
-- semana (desde el lunes) y el mes, en días de Guatemala, más el total global
-- por categoría. Los anulados no cuentan.
create or replace function resumen_gerencia()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Guatemala')::date;
  lunes date := date_trunc('week', hoy)::date;
  inicio_mes date := date_trunc('month', hoy)::date;
begin
  if not (es_gerencia() or coalesce(auth.jwt() ->> 'email', '') = 'gamboaguillermo12@gmail.com') then
    raise exception 'No autorizado';
  end if;

  return (
    with vigentes as (
      select (created_at at time zone 'America/Guatemala')::date as dia, estado, categoria_id
      from tickets
      where estado <> 'anulado'
    ),
    periodo as (
      select nombre, desde from (values ('dia', hoy), ('semana', lunes), ('mes', inicio_mes)) as p(nombre, desde)
    )
    select json_build_object(
      'periodos', (
        select json_object_agg(p.nombre, json_build_object(
          'recibidos', (select count(*) from vigentes v where v.dia between p.desde and hoy),
          'resueltos', (select count(*) from vigentes v where v.dia between p.desde and hoy and v.estado in ('resuelto', 'cerrado'))
        ))
        from periodo p
      ),
      'categorias', coalesce((
        select json_agg(json_build_object('nombre', c.nombre, 'total', x.total) order by x.total desc)
        from (select categoria_id, count(*) as total from vigentes where categoria_id is not null group by categoria_id) x
        join categorias c on c.id = x.categoria_id
      ), '[]'::json)
    )
  );
end;
$$;

revoke execute on function resumen_gerencia() from public, anon;
grant execute on function resumen_gerencia() to authenticated;

-- Rutinas y calendario: no tienen datos sensibles; Gerencia los lee para
-- calcular el porcentaje de rutinas cumplidas (con la misma lógica de Hoy).
create policy "lectura gerencia rutinas" on rutinas for select using (es_gerencia());
create policy "lectura gerencia rutina_registros" on rutina_registros for select using (es_gerencia());
create policy "lectura gerencia jornada_semana" on jornada_semana for select using (es_gerencia());
create policy "lectura gerencia calendario_excepciones" on calendario_excepciones for select using (es_gerencia());
