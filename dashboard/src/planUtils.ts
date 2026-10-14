import { Area, AreaTipo } from "./supabaseClient";

// Cuadrícula del croquis: 120 x 60 celdas (desde 0023; antes 60 x 30), con la
// entrada de referencia abajo. Debe coincidir con PLANO_ANCHO en el bot.
export const GRID_W = 120;
export const GRID_H = 60;

export const NIVEL_LABEL: Record<1 | 2, string> = { 1: "Planta baja", 2: "Planta alta" };

export const TIPO_LABEL: Record<AreaTipo, string> = {
  area: "Departamento",
  produccion: "Producción",
  referencia: "Referencia (gradas, entrada, baños…)",
};

const TIPO_COLOR: Record<AreaTipo, string> = {
  area: "#22d3ee",
  produccion: "#fbbf24",
  referencia: "#8b93a7",
};

// Colores que se pueden elegir por área (mismos neones del resto del dashboard).
export const AREA_COLORS = ["#22d3ee", "#c084fc", "#4ade80", "#fbbf24", "#f472b6", "#fb7185", "#38bdf8", "#8b93a7"];

export function areaColor(area: Pick<Area, "tipo" | "color">) {
  return area.color || TIPO_COLOR[area.tipo];
}

// Mismo criterio que ladoArea() del bot: tercios del ancho, vistos desde la entrada.
export function ladoArea(area: Pick<Area, "x" | "w">) {
  const centro = area.x + area.w / 2;
  if (centro < GRID_W / 3) return "Lado izquierdo";
  if (centro > (GRID_W * 2) / 3) return "Lado derecho";
  return "Centro";
}

export function normalizar(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function areaMatches(area: Area, query: string) {
  const q = normalizar(query);
  if (!q) return true;
  return [area.nombre, area.encargado, area.extension, area.ubicacion].some((v) => v && normalizar(v).includes(q));
}

export function clampRect(r: { x: number; y: number; w: number; h: number }) {
  const w = Math.max(1, Math.min(r.w, GRID_W));
  const h = Math.max(1, Math.min(r.h, GRID_H));
  return {
    x: Math.max(0, Math.min(r.x, GRID_W - w)),
    y: Math.max(0, Math.min(r.y, GRID_H - h)),
    w,
    h,
  };
}
