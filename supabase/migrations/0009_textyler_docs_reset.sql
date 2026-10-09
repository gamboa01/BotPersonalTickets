-- Vacía la Documentación (bitácora) heredada de Alatina. Va aparte de 0008
-- para poder aplicarla haya corrido esa o no. Las imágenes del bucket
-- "doc-imagenes" se borran desde el panel (Storage), no por SQL.

truncate table docs;
