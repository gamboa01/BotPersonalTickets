import { Area } from "../supabaseClient";
import { GRID_H, GRID_W, areaColor } from "../planUtils";

// Proyección isométrica simple (sin librerías 3D): x hacia abajo-derecha,
// y hacia abajo-izquierda, z hacia arriba. La entrada (y = GRID_H) queda al frente.
const S = 5.5;
const COS30 = Math.cos(Math.PI / 6);
const LEVEL_H = 10; // altura de cada planta, en celdas
const PAD = 30;

function iso(x: number, y: number, z: number): [number, number] {
  return [(x - y) * COS30 * S, (x + y) * 0.5 * S - z * S];
}

function poly(points: [number, number, number][]) {
  return points.map(([x, y, z]) => iso(x, y, z).join(",")).join(" ");
}

// Caras sólidas (no translúcidas) para que los bloques de una planta tapen a
// los de atrás como en 3D real: el color del área mezclado con el fondo oscuro.
function shade(hex: string, amount: number) {
  const base = [7, 10, 19];
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${rgb.map((c, i) => Math.round(base[i] + (c - base[i]) * amount)).join(",")})`;
}

// Altura del bloque según el tipo: departamentos como cuartos, el piso de
// producción casi plano (es espacio abierto) y las referencias bajitas.
function boxHeight(area: Area) {
  if (area.tipo === "produccion") return 1.2;
  if (area.tipo === "referencia") return 3;
  return LEVEL_H - 2.4;
}

type Box = { area: Area; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

// ¿Hay que dibujar `a` antes que `b`? El observador mira desde +x, +y, +z, así
// que va primero el bloque que queda detrás en el primer eje donde se separan.
// Un simple orden por x+y falla con bloques apilados de distinto tamaño.
function isBehind(a: Box, b: Box) {
  if (a.x1 <= b.x0) return true;
  if (b.x1 <= a.x0) return false;
  if (a.y1 <= b.y0) return true;
  if (b.y1 <= a.y0) return false;
  return a.z1 <= b.z0;
}

// Orden del pintor como ordenamiento topológico; si hubiera un ciclo (bloques
// encimados mal dibujados), los que queden se agregan por cercanía.
function paintOrder(areas: Area[]) {
  const boxes: Box[] = areas.map((area) => {
    const z0 = (area.nivel - 1) * LEVEL_H;
    return { area, x0: area.x, x1: area.x + area.w, y0: area.y, y1: area.y + area.h, z0, z1: z0 + boxHeight(area) };
  });
  const pending = new Set(boxes);
  const result: Area[] = [];
  while (pending.size) {
    const list = [...pending];
    const next =
      list.find((b) => !list.some((other) => other !== b && isBehind(other, b))) ??
      list.sort((a, b) => a.x0 + a.y0 + a.z0 - (b.x0 + b.y0 + b.z0))[0];
    pending.delete(next);
    result.push(next.area);
  }
  return result;
}

export type Focus3D = "ambas" | 1 | 2;

interface Plant3DProps {
  areas: Area[];
  focus: Focus3D;
  selectedId: number | null;
  matchIds: Set<number> | null;
  openCounts: Map<number, number>;
  onSelect: (id: number | null) => void;
}

export function Plant3D({ areas, focus, selectedId, matchIds, openCounts, onSelect }: Plant3DProps) {
  const corners: [number, number][] = [
    iso(0, 0, LEVEL_H * 2),
    iso(GRID_W, 0, 0),
    iso(0, GRID_H, 0),
    iso(GRID_W, GRID_H, 0),
  ];
  const minX = Math.min(...corners.map((c) => c[0])) - PAD;
  const maxX = Math.max(...corners.map((c) => c[0])) + PAD;
  const minY = Math.min(...corners.map((c) => c[1])) - PAD;
  const maxY = Math.max(...corners.map((c) => c[1])) + PAD;

  const sorted = paintOrder(areas);

  function opacityFor(area: Area) {
    if (matchIds !== null && !matchIds.has(area.id)) return 0.15;
    if (focus === 1 && area.nivel === 2) return 0.08;
    if (focus === 2 && area.nivel === 1 && area.tipo !== "produccion") return 0.3;
    return 1;
  }

  return (
    <svg
      className="plant-3d"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      onClick={(e) => e.target === e.currentTarget && onSelect(null)}
      role="img"
      aria-label="Vista 3D de la planta"
    >
      <polygon
        points={poly([
          [0, 0, 0],
          [GRID_W, 0, 0],
          [GRID_W, GRID_H, 0],
          [0, GRID_H, 0],
        ])}
        className="iso-ground"
        onClick={() => onSelect(null)}
      />
      <polygon
        points={poly([
          [0, 0, LEVEL_H],
          [GRID_W, 0, LEVEL_H],
          [GRID_W, GRID_H, LEVEL_H],
          [0, GRID_H, LEVEL_H],
        ])}
        className="iso-level-outline"
        pointerEvents="none"
      />

      {sorted.map((area) => {
        const { x, y, w, h } = area;
        const z0 = (area.nivel - 1) * LEVEL_H;
        const zt = z0 + boxHeight(area);
        const color = areaColor(area);
        const selected = area.id === selectedId;
        const [lx, ly] = iso(x + w / 2, y + h / 2, zt);
        const abiertos = openCounts.get(area.id) ?? 0;

        return (
          <g
            key={area.id}
            className={`iso-box${selected ? " selected" : ""}`}
            style={{ opacity: opacityFor(area) }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(area.id);
            }}
          >
            <title>{area.nombre}</title>
            <polygon
              points={poly([
                [x + w, y, z0],
                [x + w, y + h, z0],
                [x + w, y + h, zt],
                [x + w, y, zt],
              ])}
              style={{ fill: shade(color, 0.3), stroke: color }}
              className="iso-face"
            />
            <polygon
              points={poly([
                [x, y + h, z0],
                [x + w, y + h, z0],
                [x + w, y + h, zt],
                [x, y + h, zt],
              ])}
              style={{ fill: shade(color, 0.2), stroke: color }}
              className="iso-face"
            />
            <polygon
              points={poly([
                [x, y, zt],
                [x + w, y, zt],
                [x + w, y + h, zt],
                [x, y + h, zt],
              ])}
              style={{ fill: shade(color, selected ? 0.6 : 0.42), stroke: selected ? "#fff" : color }}
              className="iso-face iso-face-top"
            />
            {(area.tipo !== "referencia" || selected) && (
              <text x={lx} y={ly} className="iso-label">
                {area.nombre}
              </text>
            )}
            {abiertos > 0 && (
              <g className="plan-badge" pointerEvents="none">
                <circle cx={lx} cy={ly - 16} r={8} />
                <text x={lx} y={ly - 16}>
                  {abiertos}
                </text>
              </g>
            )}
          </g>
        );
      })}

      <text x={iso(GRID_W / 2, GRID_H, 0)[0]} y={iso(GRID_W / 2, GRID_H, 0)[1] + 22} className="plan-entrance">
        ▲ Entrada principal
      </text>
    </svg>
  );
}
