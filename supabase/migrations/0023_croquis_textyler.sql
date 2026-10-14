-- Croquis de la planta de Textyler a partir de la distribución real (lado
-- derecho e izquierdo, planta baja y alta). Generado con un script: la
-- cuadrícula pasa de 60 x 30 a 120 x 60 celdas para que quepan todas las áreas.
--
-- Se borran las áreas dibujadas a mano (menos las de producción, que se
-- reescalan) y los tickets que apuntaban a ellas se vuelven a enlazar por nombre.
-- Pendiente: sótano.

-- 1. Guardar a qué área (por nombre) apunta cada ticket antes de borrar.
create temp table tickets_area_anterior on commit drop as
select t.id as ticket_id, lower(translate(a.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) as nombre
from tickets t
join areas a on a.id = t.area_id
where a.tipo <> 'produccion';

-- 2. Borrar las áreas dibujadas a mano y reescalar las de producción a la nueva cuadrícula.
delete from areas where tipo <> 'produccion';
update areas set x = x * 2, y = y * 2, w = w * 2, h = h * 2;

-- 3. Áreas nuevas.
insert into areas (nombre, nivel, tipo, x, y, w, h, ubicacion) values
  ('Gradas', 2, 'referencia', 92, 44, 28, 2, 'Planta alta, lado derecho, gradas 1 desde la entrada'),
  ('Gradas', 2, 'referencia', 92, 28, 28, 2, 'Planta alta, lado derecho, gradas 2 desde la entrada'),
  ('Gradas', 2, 'referencia', 92, 10, 28, 2, 'Planta alta, lado derecho, gradas 3 desde la entrada'),
  ('Sala de documentación', 2, 'area', 92, 53, 28, 7, 'Planta alta, lado derecho'),
  ('Oficinas de corte', 2, 'area', 92, 46, 28, 7, 'Planta alta, lado derecho'),
  ('CAD', 2, 'area', 92, 40, 28, 4, 'Planta alta, lado derecho'),
  ('Baños H', 2, 'referencia', 92, 37, 7, 3, 'Planta alta, lado derecho'),
  ('Baños M', 2, 'referencia', 99, 37, 7, 3, 'Planta alta, lado derecho'),
  ('Baños M', 2, 'referencia', 106, 37, 7, 3, 'Planta alta, lado derecho'),
  ('Baños H', 2, 'referencia', 113, 37, 7, 3, 'Planta alta, lado derecho'),
  ('Gerencia de producción', 2, 'area', 92, 33, 28, 4, 'Planta alta, lado derecho'),
  ('Soporte técnico IT', 2, 'area', 92, 30, 28, 3, 'Planta alta, lado derecho'),
  ('Gerencia General', 2, 'area', 92, 21, 28, 7, 'Planta alta, lado derecho'),
  ('Oficina de RRHH', 2, 'area', 92, 15, 28, 6, 'Planta alta, lado derecho'),
  ('Baños H', 2, 'referencia', 92, 12, 7, 3, 'Planta alta, lado derecho'),
  ('Baños M', 2, 'referencia', 99, 12, 7, 3, 'Planta alta, lado derecho'),
  ('Baños M', 2, 'referencia', 106, 12, 7, 3, 'Planta alta, lado derecho'),
  ('Baños H', 2, 'referencia', 113, 12, 7, 3, 'Planta alta, lado derecho'),
  ('Comedor', 2, 'area', 92, 0, 28, 10, 'Planta alta, lado derecho'),
  ('Gradas', 1, 'referencia', 92, 44, 28, 2, 'Planta baja, lado derecho, gradas 1 desde la entrada'),
  ('Gradas', 1, 'referencia', 92, 28, 28, 2, 'Planta baja, lado derecho, gradas 2 desde la entrada'),
  ('Gradas', 1, 'referencia', 92, 10, 28, 2, 'Planta baja, lado derecho, gradas 3 desde la entrada'),
  ('Oficina temporal BD-1', 1, 'referencia', 92, 55, 28, 5, 'Planta baja, lado derecho'),
  ('Oficina temporal BD-2', 1, 'referencia', 92, 50, 28, 5, 'Planta baja, lado derecho'),
  ('Sala de patrones', 1, 'area', 92, 46, 28, 4, 'Planta baja, lado derecho'),
  ('Baños H', 1, 'referencia', 92, 41, 7, 3, 'Planta baja, lado derecho'),
  ('Baños M', 1, 'referencia', 99, 41, 7, 3, 'Planta baja, lado derecho'),
  ('Baños M', 1, 'referencia', 106, 41, 7, 3, 'Planta baja, lado derecho'),
  ('Baños H', 1, 'referencia', 113, 41, 7, 3, 'Planta baja, lado derecho'),
  ('Bodega de accesorios', 1, 'area', 92, 35, 28, 6, 'Planta baja, lado derecho'),
  ('Oficina de producción', 1, 'area', 92, 30, 28, 5, 'Planta baja, lado derecho'),
  ('Entrada principal', 1, 'referencia', 92, 26, 28, 2, 'Planta baja, lado derecho, entre Enfermería y las gradas'),
  ('Enfermería', 1, 'area', 92, 22, 28, 4, 'Planta baja, lado derecho'),
  ('Oficina de control de metales y suministros', 1, 'area', 92, 18, 28, 4, 'Planta baja, lado derecho'),
  ('Oficina de Calidad', 1, 'area', 92, 15, 28, 3, 'Planta baja, lado derecho'),
  ('Baños H', 1, 'referencia', 92, 12, 7, 3, 'Planta baja, lado derecho'),
  ('Baños M', 1, 'referencia', 99, 12, 7, 3, 'Planta baja, lado derecho'),
  ('Baños M', 1, 'referencia', 106, 12, 7, 3, 'Planta baja, lado derecho'),
  ('Baños H', 1, 'referencia', 113, 12, 7, 3, 'Planta baja, lado derecho'),
  ('Área de cajas empacadas', 1, 'area', 92, 0, 28, 10, 'Planta baja, lado derecho'),
  ('Gradas', 1, 'referencia', 0, 44, 28, 2, 'Planta baja, lado izquierdo, gradas 1 desde la entrada'),
  ('Gradas', 1, 'referencia', 0, 28, 28, 2, 'Planta baja, lado izquierdo, gradas 2 desde la entrada'),
  ('Gradas', 1, 'referencia', 0, 10, 28, 2, 'Planta baja, lado izquierdo, gradas 3 desde la entrada'),
  ('Área de limpieza', 1, 'area', 0, 56, 28, 4, 'Planta baja, lado izquierdo'),
  ('Laboratorio', 1, 'area', 0, 52, 28, 4, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-1', 1, 'referencia', 0, 49, 28, 3, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-2', 1, 'referencia', 0, 46, 28, 3, 'Planta baja, lado izquierdo'),
  ('Baños H', 1, 'referencia', 0, 41, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños M', 1, 'referencia', 7, 41, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños M', 1, 'referencia', 14, 41, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños H', 1, 'referencia', 21, 41, 7, 3, 'Planta baja, lado izquierdo'),
  ('Área de taller', 1, 'area', 0, 35, 28, 6, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-3', 1, 'referencia', 0, 30, 28, 5, 'Planta baja, lado izquierdo'),
  ('Enfermería 2', 1, 'area', 0, 24, 28, 4, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-4', 1, 'referencia', 0, 21, 28, 3, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-5', 1, 'referencia', 0, 18, 28, 3, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-6', 1, 'referencia', 0, 15, 28, 3, 'Planta baja, lado izquierdo'),
  ('Baños H', 1, 'referencia', 0, 12, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños M', 1, 'referencia', 7, 12, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños M', 1, 'referencia', 14, 12, 7, 3, 'Planta baja, lado izquierdo'),
  ('Baños H', 1, 'referencia', 21, 12, 7, 3, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-7', 1, 'referencia', 0, 0, 6, 10, 'Planta baja, lado izquierdo'),
  ('Auditoría', 1, 'area', 6, 0, 6, 10, 'Planta baja, lado izquierdo'),
  ('Auditoría 2', 1, 'area', 12, 0, 6, 10, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-8', 1, 'referencia', 18, 0, 5, 10, 'Planta baja, lado izquierdo'),
  ('Oficina temporal BI-9', 1, 'referencia', 23, 0, 5, 10, 'Planta baja, lado izquierdo'),
  ('Gradas', 2, 'referencia', 0, 44, 28, 2, 'Planta alta, lado izquierdo, gradas 1 desde la entrada'),
  ('Gradas', 2, 'referencia', 0, 28, 28, 2, 'Planta alta, lado izquierdo, gradas 2 desde la entrada'),
  ('Gradas', 2, 'referencia', 0, 10, 28, 2, 'Planta alta, lado izquierdo, gradas 3 desde la entrada'),
  ('Oficina temporal AI-1', 2, 'referencia', 0, 56, 28, 4, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-2', 2, 'referencia', 0, 52, 28, 4, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-3', 2, 'referencia', 0, 49, 28, 3, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-4', 2, 'referencia', 0, 46, 28, 3, 'Planta alta, lado izquierdo'),
  ('Baños H', 2, 'referencia', 0, 41, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños M', 2, 'referencia', 7, 41, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños M', 2, 'referencia', 14, 41, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños H', 2, 'referencia', 21, 41, 7, 3, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-5', 2, 'referencia', 0, 30, 28, 11, 'Planta alta, lado izquierdo'),
  ('Cocina', 2, 'area', 0, 21, 28, 7, 'Planta alta, lado izquierdo'),
  ('Sala de reuniones', 2, 'area', 0, 15, 28, 6, 'Planta alta, lado izquierdo'),
  ('Baños H', 2, 'referencia', 0, 12, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños M', 2, 'referencia', 7, 12, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños M', 2, 'referencia', 14, 12, 7, 3, 'Planta alta, lado izquierdo'),
  ('Baños H', 2, 'referencia', 21, 12, 7, 3, 'Planta alta, lado izquierdo'),
  ('Sala QA', 2, 'area', 0, 0, 6, 10, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-6', 2, 'referencia', 6, 0, 6, 10, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-7', 2, 'referencia', 12, 0, 6, 10, 'Planta alta, lado izquierdo'),
  ('Oficina temporal AI-8', 2, 'referencia', 18, 0, 5, 10, 'Planta alta, lado izquierdo'),
  ('Oficina de empaque', 2, 'area', 23, 0, 5, 10, 'Planta alta, lado izquierdo');

-- 4. Volver a enlazar los tickets con el área equivalente.
update tickets t
set area_id = n.id
from tickets_area_anterior ant
join areas n on n.tipo <> 'referencia' and n.nombre = case
  when ant.nombre in ('recursos humanos', 'rrhh', 'talento humano', 'oficina de rrhh') then 'Oficina de RRHH'
  when ant.nombre in ('corte', 'area de corte', 'departamento de corte', 'oficinas de corte', 'oficina de corte') then 'Oficinas de corte'
  when ant.nombre in ('gerencia', 'gerencia general') then 'Gerencia General'
  when ant.nombre in ('ti', 'it', 'sala ti', 'oficina ti', 'sistemas', 'informatica', 'tecnologia', 'soporte ti', 'soporte tecnico it') then 'Soporte técnico IT'
  else (select a2.nombre from areas a2 where lower(translate(a2.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = ant.nombre limit 1)
end
where t.id = ant.ticket_id;
