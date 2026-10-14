import { Ausencia, ExcepcionDia, JornadaDia, Rutina, Tecnico } from "./supabaseClient";

export const DIAS_CORTOS = ["D", "L", "M", "X", "J", "V", "S"];
export const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Orden de lunes a domingo para mostrar en pantalla.
export const SEMANA = [1, 2, 3, 4, 5, 6, 0];

export interface DiaInfo {
  fecha: string;
  laboral: boolean;
  // Día de la semana cuyas rutinas aplican (en una reposición, el "como_dia").
  diaRef: number;
  salida: string | null;
  excepcion: ExcepcionDia | null;
}

// Cómo es un día: primero la excepción de esa fecha (si hay) y si no, el horario base.
export function diaInfo(fecha: string, dow: number, jornada: JornadaDia[], excepciones: ExcepcionDia[]): DiaInfo {
  const excepcion = excepciones.find((e) => e.fecha === fecha) ?? null;
  const base = jornada.find((j) => j.dia === dow);
  const laboral = excepcion ? excepcion.laboral : base?.laboral ?? false;
  const diaRef = excepcion?.laboral && excepcion.como_dia !== null ? excepcion.como_dia : dow;
  const salida = excepcion?.hora_salida ?? jornada.find((j) => j.dia === diaRef)?.hora_salida ?? null;
  return { fecha, laboral, diaRef, salida, excepcion };
}

// Día 0 de la rotación (un lunes). Se cuentan días de calendario: con dos
// personas se alternan cada día y además el lunes cambia de semana a semana.
const ROTACION_INICIO = Date.UTC(2026, 0, 5);

export function responsableDelDia(rutina: Rutina, fecha: string) {
  const turno = rutina.rotacion ?? [];
  if (!turno.length) return rutina.tecnico_id;
  const [y, m, d] = fecha.split("-").map(Number);
  const dias = Math.round((Date.UTC(y, m - 1, d) - ROTACION_INICIO) / 86_400_000);
  return turno[((dias % turno.length) + turno.length) % turno.length];
}

function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = (((h * 60 + m + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function horaRutina(rutina: Rutina, salida: string | null) {
  if (rutina.referencia === "salida") return salida ? sumarMinutos(salida, rutina.minutos_salida) : null;
  return rutina.hora;
}

export function describirHora(rutina: Rutina) {
  if (rutina.referencia === "fija") return rutina.hora ?? "Sin hora";
  const m = rutina.minutos_salida;
  if (m === 0) return "A la salida";
  return m < 0 ? `${-m} min antes de la salida` : `${m} min después de la salida`;
}

export function describirDias(dias: number[]) {
  const set = new Set(dias);
  if (set.size === 7) return "Todos los días";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Lunes a viernes";
  if (set.size === 6 && [1, 2, 3, 4, 5, 6].every((d) => set.has(d))) return "Lunes a sábado";
  return SEMANA.filter((d) => set.has(d))
    .map((d) => DIAS_LARGOS[d].slice(0, 3))
    .join(", ");
}

// Rutinas que tocan en un día, con su hora calculada, en orden de hora. Las de
// hora fija posteriores a la salida no aplican (p. ej. una reposición que
// termina a las 12:00 no lleva "bajar volumen" de las 13:00).
export function rutinasDelDia(rutinas: Rutina[], info: DiaInfo) {
  if (!info.laboral) return [];
  return rutinas
    .filter((r) => r.activo && r.dias.includes(info.diaRef))
    .filter((r) => r.referencia !== "fija" || !info.salida || !r.hora || r.hora <= info.salida)
    .map((r) => ({ rutina: r, hora: horaRutina(r, info.salida), responsable: responsableDelDia(r, info.fecha) }))
    .sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.rutina.orden - b.rutina.orden);
}

// ¿Está ausente el técnico a esa hora? Sin hora (p. ej. salida desconocida),
// solo cuenta una ausencia de todo el día.
export function ausenteA(ausencia: Ausencia | undefined, hora: string | null) {
  if (!ausencia) return false;
  if (!ausencia.desde) return true;
  return !!hora && hora >= ausencia.desde;
}

// Si el responsable falta a la hora de la rutina, la cubre quien diga la
// ausencia o, si no dice, la primera persona activa que no esté ausente.
export function cubrirAusencia(
  responsable: number | null,
  hora: string | null,
  ausencias: Ausencia[],
  tecnicos: Tecnico[]
): { responsable: number | null; cubreA: number | null } {
  if (responsable === null) return { responsable, cubreA: null };
  const porTecnico = new Map(ausencias.map((a) => [a.tecnico_id, a]));
  const ausencia = porTecnico.get(responsable);
  if (!ausenteA(ausencia, hora)) return { responsable, cubreA: null };
  const suplente =
    (ausencia!.cubre_id !== null && !ausenteA(porTecnico.get(ausencia!.cubre_id), hora) ? ausencia!.cubre_id : null) ??
    tecnicos.find((t) => t.activo && t.id !== responsable && !ausenteA(porTecnico.get(t.id), hora))?.id ??
    null;
  return { responsable: suplente, cubreA: responsable };
}
