import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Area } from "../supabaseClient";
import { GRID_H, GRID_W, areaColor, clampRect } from "../planUtils";

const CELL = 20;
const PAD = 24;
const FOOT = 30; // espacio bajo el plano para la etiqueta de la entrada
const VB_W = GRID_W * CELL + PAD * 2;
const VB_H = GRID_H * CELL + PAD * 2 + FOOT;

export type Rect = { x: number; y: number; w: number; h: number };

type Drag =
  | { mode: "draw"; start: { x: number; y: number }; rect: Rect }
  | { mode: "move"; id: number; dx: number; dy: number; rect: Rect; moved: boolean }
  | { mode: "resize"; id: number; rect: Rect };

interface FloorPlanProps {
  areas: Area[];
  nivel: 1 | 2;
  selectedId: number | null;
  matchIds: Set<number> | null;
  openCounts: Map<number, number>;
  editing: boolean;
  onSelect: (id: number | null) => void;
  onCreate: (rect: Rect) => void;
  onChangeRect: (id: number, rect: Rect) => void;
  onEdit: (area: Area) => void;
}

// Parte el nombre en líneas que quepan en el ancho del rectángulo.
function wrapLabel(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(1, maxChars - 1)) + "…";
    return kept;
  }
  return lines.map((l) => (l.length > maxChars + 2 ? l.slice(0, maxChars + 1) + "…" : l));
}

export function FloorPlan({
  areas,
  nivel,
  selectedId,
  matchIds,
  openCounts,
  editing,
  onSelect,
  onCreate,
  onChangeRect,
  onEdit,
}: FloorPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const delNivel = areas.filter((a) => a.nivel === nivel);
  // Desde la planta alta se ve el piso de producción de abajo (doble altura).
  const dobleAltura = nivel === 2 ? areas.filter((a) => a.nivel === 1 && a.tipo === "produccion") : [];

  function toCell(e: ReactPointerEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: (p.x - PAD) / CELL, y: (p.y - PAD) / CELL };
  }

  function capture(e: ReactPointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function handleBackgroundDown(e: ReactPointerEvent) {
    if (!editing) return;
    const c = toCell(e);
    if (c.x < 0 || c.y < 0 || c.x >= GRID_W || c.y >= GRID_H) return;
    const start = { x: Math.floor(c.x), y: Math.floor(c.y) };
    capture(e);
    setDrag({ mode: "draw", start, rect: { ...start, w: 1, h: 1 } });
  }

  function handleAreaDown(e: ReactPointerEvent, area: Area) {
    if (!editing) return;
    e.stopPropagation();
    const c = toCell(e);
    capture(e);
    setDrag({ mode: "move", id: area.id, dx: c.x - area.x, dy: c.y - area.y, rect: { ...area }, moved: false });
  }

  function handleResizeDown(e: ReactPointerEvent, area: Area) {
    e.stopPropagation();
    capture(e);
    setDrag({ mode: "resize", id: area.id, rect: { x: area.x, y: area.y, w: area.w, h: area.h } });
  }

  function handleMove(e: ReactPointerEvent) {
    if (!drag) return;
    const c = toCell(e);
    if (drag.mode === "draw") {
      const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(c.x)));
      const cy = Math.max(0, Math.min(GRID_H - 1, Math.floor(c.y)));
      setDrag({
        ...drag,
        rect: {
          x: Math.min(drag.start.x, cx),
          y: Math.min(drag.start.y, cy),
          w: Math.abs(cx - drag.start.x) + 1,
          h: Math.abs(cy - drag.start.y) + 1,
        },
      });
    } else if (drag.mode === "move") {
      const rect = clampRect({ ...drag.rect, x: Math.round(c.x - drag.dx), y: Math.round(c.y - drag.dy) });
      const original = areas.find((a) => a.id === drag.id);
      const moved = drag.moved || (!!original && (rect.x !== original.x || rect.y !== original.y));
      setDrag({ ...drag, rect, moved });
    } else {
      const w = Math.max(1, Math.ceil(c.x) - drag.rect.x);
      const h = Math.max(1, Math.ceil(c.y) - drag.rect.y);
      setDrag({ ...drag, rect: clampRect({ ...drag.rect, w, h }) });
    }
  }

  function handleUp() {
    if (!drag) return;
    if (drag.mode === "draw") {
      // Un clic suelto (1x1) solo deselecciona; arrastrar dibuja un área nueva.
      if (drag.rect.w * drag.rect.h > 1) onCreate(drag.rect);
      else onSelect(null);
    } else if (drag.mode === "move") {
      if (drag.moved) onChangeRect(drag.id, drag.rect);
      else {
        const area = areas.find((a) => a.id === drag.id);
        if (area) onEdit(area);
      }
    } else {
      onChangeRect(drag.id, drag.rect);
    }
    setDrag(null);
  }

  function rectOf(area: Area): Rect {
    if (drag && drag.mode !== "draw" && drag.id === area.id) return drag.rect;
    return area;
  }

  return (
    <svg
      ref={svgRef}
      className={`floor-plan${editing ? " editing" : ""}`}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onClick={(e) => {
        if (!editing && e.target === e.currentTarget) onSelect(null);
      }}
      role="img"
      aria-label={`Croquis de la ${nivel === 1 ? "planta baja" : "planta alta"}`}
    >
      <defs>
        <pattern id="plan-grid" x={PAD} y={PAD} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} className="plan-grid-line" />
        </pattern>
        <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" className="plan-hatch-line" />
        </pattern>
        <filter id="plan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x={PAD}
        y={PAD}
        width={GRID_W * CELL}
        height={GRID_H * CELL}
        rx={6}
        className="plan-building"
        onClick={() => !editing && onSelect(null)}
      />
      <rect
        x={PAD}
        y={PAD}
        width={GRID_W * CELL}
        height={GRID_H * CELL}
        fill="url(#plan-grid)"
        className="plan-grid"
        pointerEvents="none"
      />

      {dobleAltura.map((a) => (
        <g key={`ghost-${a.id}`} pointerEvents="none">
          <rect
            x={PAD + a.x * CELL}
            y={PAD + a.y * CELL}
            width={a.w * CELL}
            height={a.h * CELL}
            rx={4}
            fill="url(#plan-hatch)"
            className="plan-ghost"
          />
          <text x={PAD + (a.x + a.w / 2) * CELL} y={PAD + (a.y + a.h / 2) * CELL} className="plan-ghost-label">
            <tspan x={PAD + (a.x + a.w / 2) * CELL} dy="-0.4em">
              Doble altura
            </tspan>
            <tspan x={PAD + (a.x + a.w / 2) * CELL} dy="1.3em">
              (vista a {a.nombre})
            </tspan>
          </text>
        </g>
      ))}

      {delNivel.map((area) => {
        const r = rectOf(area);
        const color = areaColor(area);
        const selected = area.id === selectedId;
        const dimmed = matchIds !== null && !matchIds.has(area.id);
        const px = PAD + r.x * CELL;
        const py = PAD + r.y * CELL;
        const pw = r.w * CELL;
        const ph = r.h * CELL;
        const fontSize = r.w <= 4 || r.h <= 2 ? 15 : area.tipo === "produccion" ? 30 : 21;
        const maxChars = Math.max(3, Math.floor(pw / (fontSize * 0.58)) - 1);
        const maxLines = Math.max(1, Math.floor((ph - 6) / (fontSize * 1.2)));
        const lines = wrapLabel(area.nombre, maxChars, maxLines);
        const abiertos = openCounts.get(area.id) ?? 0;

        return (
          <g
            key={area.id}
            className={`plan-area plan-area-${area.tipo}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
            onPointerDown={(e) => handleAreaDown(e, area)}
            onClick={(e) => {
              e.stopPropagation();
              if (!editing) onSelect(area.id);
            }}
          >
            <title>{area.nombre}</title>
            <rect
              x={px + 1.5}
              y={py + 1.5}
              width={pw - 3}
              height={ph - 3}
              rx={5}
              style={{ fill: color, stroke: color }}
              className="plan-area-rect"
              filter={selected ? "url(#plan-glow)" : undefined}
            />
            <text x={px + pw / 2} y={py + ph / 2} className="plan-area-label" style={{ fontSize }}>
              {lines.map((line, i) => (
                <tspan key={i} x={px + pw / 2} dy={i === 0 ? `${-((lines.length - 1) * 0.6) + 0.35}em` : "1.2em"}>
                  {line}
                </tspan>
              ))}
            </text>
            {abiertos > 0 && (
              <g className="plan-badge" pointerEvents="none">
                <circle cx={px + pw - 16} cy={py + 16} r={12} />
                <text x={px + pw - 16} y={py + 16}>
                  {abiertos}
                </text>
              </g>
            )}
            {editing && (
              <rect
                x={px + pw - 16}
                y={py + ph - 16}
                width={14}
                height={14}
                rx={2}
                className="plan-resize-handle"
                onPointerDown={(e) => handleResizeDown(e, area)}
              />
            )}
          </g>
        );
      })}

      {drag?.mode === "draw" && (
        <rect
          x={PAD + drag.rect.x * CELL}
          y={PAD + drag.rect.y * CELL}
          width={drag.rect.w * CELL}
          height={drag.rect.h * CELL}
          rx={5}
          className="plan-draft"
          pointerEvents="none"
        />
      )}

      <text x={VB_W / 2} y={VB_H - 10} className="plan-entrance">
        ▲ Frente · entrada principal
      </text>
    </svg>
  );
}
