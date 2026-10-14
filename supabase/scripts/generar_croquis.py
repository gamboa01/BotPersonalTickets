"""Genera la migración con el croquis de Textyler a partir de la lista del usuario.

Cuadrícula 120 x 60 (y = 0 es el fondo, y = 60 el frente/entrada de referencia).
Lado izquierdo x 0..28, lado derecho x 92..120. Por lado, filas fijas:
  fondo 0-10 | G3 10-12 | seg2 12-28 | G2 28-30 | seg1 30-44 | G1 44-46 | seg0 46-60
Las gradas quedan a la misma altura en ambas plantas.
"""

import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations", "0023_croquis_textyler.sql")

LADO_X = {"izq": (0, 28), "der": (92, 28)}
SEGMENTOS = {"seg0": (46, 14), "seg1": (30, 14), "seg2": (12, 16)}
GRADAS = [(44, 2), (28, 2), (10, 2)]  # G1, G2, G3
FONDO = (0, 10)

BANOS = "BANOS"
ENTRADA = "ENTRADA"

# Por planta y lado: segmentos de frente a fondo (seg0 junto a la entrada de
# referencia) y la franja del fondo. Cada segmento lista sus áreas de frente a fondo.
PLANTA = {
    (2, "der"): {  # Planta alta derecha, orden normal
        "seg0": ["Sala de documentación", "Oficinas de corte"],
        "seg1": ["CAD", BANOS, "Gerencia de producción", "Soporte técnico IT"],
        "seg2": ["Gerencia General", "Oficina de RRHH", BANOS],
        "fondo": ["Comedor"],
    },
    (1, "der"): {  # Planta baja derecha, orden inverso (aquí ya de frente a fondo)
        "seg0": ["Oficina temporal", "Oficina temporal", "Sala de patrones"],
        "seg1": [BANOS, "Bodega de accesorios", "Oficina de producción"],
        "seg2": [ENTRADA, "Enfermería", "Oficina de control de metales y suministros", "Oficina de Calidad", BANOS],
        "fondo": ["Área de cajas empacadas"],
    },
    (1, "izq"): {  # Planta baja izquierda, orden normal
        "seg0": ["Área de limpieza", "Laboratorio", "Oficina temporal", "Oficina temporal"],
        "seg1": [BANOS, "Área de taller", "Oficina temporal"],
        "seg2": ["Enfermería 2", "Oficina temporal", "Oficina temporal", "Oficina temporal", BANOS],
        "fondo": ["Oficina temporal", "Auditoría", "Auditoría 2", "Oficina temporal", "Oficina temporal"],
    },
    (2, "izq"): {  # Planta alta izquierda, orden inverso (aquí ya de frente a fondo)
        "seg0": ["Oficina temporal", "Oficina temporal", "Oficina temporal", "Oficina temporal"],
        "seg1": [BANOS, "Oficina temporal"],
        "seg2": ["Cocina", "Sala de reuniones", BANOS],
        "fondo": ["Sala QA", "Oficina temporal", "Oficina temporal", "Oficina temporal", "Oficina de empaque"],
    },
}

CODIGO = {(1, "izq"): "BI", (1, "der"): "BD", (2, "izq"): "AI", (2, "der"): "AD"}
LADO_TXT = {"izq": "lado izquierdo", "der": "lado derecho"}
NIVEL_TXT = {1: "Planta baja", 2: "Planta alta"}


def repartir(total, n):
    """Reparte `total` filas en `n` partes enteras lo más parejas posible."""
    base, resto = divmod(total, n)
    return [base + (1 if i < resto else 0) for i in range(n)]


def sql_str(v):
    return "null" if v is None else "'" + v.replace("'", "''") + "'"


filas = []  # (nombre, nivel, tipo, x, y, w, h, ubicacion)

for (nivel, lado), segs in PLANTA.items():
    x0, ancho = LADO_X[lado]
    codigo = CODIGO[(nivel, lado)]
    donde = f"{NIVEL_TXT[nivel]}, {LADO_TXT[lado]}"

    # Gradas (alineadas en ambas plantas).
    for i, (gy, gh) in enumerate(GRADAS, start=1):
        filas.append(("Gradas", nivel, "referencia", x0, gy, ancho, gh, f"{donde}, gradas {i} desde la entrada"))

    def colocar(nombre, y, h, x, w):
        tipo = "area"
        ubic = donde
        if nombre == BANOS:
            # H M M H uno junto al otro en la misma franja.
            anchos = repartir(w, 4)
            xx = x
            for etiqueta, aw in zip(["Baños H", "Baños M", "Baños M", "Baños H"], anchos):
                filas.append((etiqueta, nivel, "referencia", xx, y, aw, h, ubic))
                xx += aw
            return
        if nombre == ENTRADA:
            filas.append(("Entrada principal", nivel, "referencia", x, y, w, h, f"{donde}, entre Enfermería y las gradas"))
            return
        if nombre == "Oficina temporal":
            tipo = "referencia"
        filas.append((nombre, nivel, tipo, x, y, w, h, ubic))

    for seg, (sy, sh) in SEGMENTOS.items():
        items = segs[seg]
        # Entrada (2 filas) y baños (3 filas) son franjas fijas y angostas; el
        # resto del segmento se reparte parejo entre los departamentos.
        FIJO = {ENTRADA: 2, BANOS: 3}
        fijos = sum(FIJO.get(it, 0) for it in items)
        normales = [it for it in items if it not in FIJO]
        alturas = iter(repartir(sh - fijos, len(normales)))
        # De frente a fondo: el primero ocupa las filas más cercanas al frente (y alto).
        y_frente = sy + sh
        for it in items:
            h = FIJO[it] if it in FIJO else next(alturas)
            y_frente -= h
            colocar(it, y_frente, h, x0, ancho)

    # Franja del fondo: un área ocupa todo; varias se reparten a lo ancho.
    fy, fh = FONDO
    items = segs["fondo"]
    xx = x0
    for it, aw in zip(items, repartir(ancho, len(items))):
        colocar(it, fy, fh, xx, aw)
        xx += aw

# Numera las oficinas temporales por planta y lado (BI-1, BI-2…), de frente a fondo.
contadores = {}
temporales = sorted(
    [f for f in filas if f[0] == "Oficina temporal"],
    key=lambda f: (f[1], f[3] >= 60, -f[4], f[3]),
)
renombre = {}
for f in temporales:
    nivel, x = f[1], f[3]
    cod = CODIGO[(nivel, "izq" if x < 60 else "der")]
    contadores[cod] = contadores.get(cod, 0) + 1
    renombre[id(f)] = f"Oficina temporal {cod}-{contadores[cod]}"
filas = [(renombre.get(id(f), f[0]),) + f[1:] for f in filas]

# Validaciones: dentro de la cuadrícula y sin encimarse en la misma planta.
for nombre, nivel, tipo, x, y, w, h, _ in filas:
    assert 0 <= x and x + w <= 120 and 0 <= y and y + h <= 60 and w > 0 and h > 0, (nombre, x, y, w, h)
for i, a in enumerate(filas):
    for b in filas[i + 1:]:
        if a[1] != b[1]:
            continue
        ax, ay, aw, ah = a[3:7]
        bx, by, bw, bh = b[3:7]
        assert ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay, ("encimadas", a[0], b[0])

values = ",\n".join(
    f"  ({sql_str(n)}, {nv}, '{t}', {x}, {y}, {w}, {h}, {sql_str(u)})" for n, nv, t, x, y, w, h, u in filas
)

sql = f"""-- Croquis de la planta de Textyler a partir de la distribución real (lado
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
{values};

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
"""

open(OUT, "w", encoding="utf-8", newline="\n").write(sql)
print(f"{len(filas)} áreas")
for nivel in (1, 2):
    for lado in ("izq", "der"):
        n = [f for f in filas if f[1] == nivel and (f[3] < 60) == (lado == "izq")]
        print(NIVEL_TXT[nivel], lado, len(n), "| áreas:", sum(1 for f in n if f[2] == "area"))
