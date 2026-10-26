-- La cuenta de solo lectura de Gerencia es vistacompartida@gmail.com (la de
-- 0027 era solo un ejemplo y no se creó).
insert into accesos (email, rol) values ('vistacompartida@gmail.com', 'gerencia')
on conflict (email) do update set rol = excluded.rol;

delete from accesos where email = 'gerencia@textyler.com';
