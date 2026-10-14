export const GT_TIMEZONE = "America/Guatemala";

// Clave YYYY-MM-DD del día calendario en Guatemala para un timestamp dado,
// sin importar la zona horaria de quien esté viendo el dashboard.
export function gtDayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: GT_TIMEZONE });
}

export function formatGt(iso: string) {
  return new Date(iso).toLocaleString("es-GT", {
    timeZone: GT_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

// "1:20 p. m." (sin cero adelante en la hora).
export function formatGtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-GT", { timeZone: GT_TIMEZONE, hour: "numeric", minute: "2-digit" });
}

// "a la 1:20 p. m." / "a las 12:45 p. m.": en español la una va en singular.
export function aLaHora(iso: string) {
  const hora = new Date(iso).toLocaleTimeString("en-US", { timeZone: GT_TIMEZONE, hour: "numeric", hour12: true });
  return `${hora.startsWith("1 ") ? "a la" : "a las"} ${formatGtTime(iso)}`;
}

// Día de la semana en Guatemala (0 = domingo), mismo criterio que extract(dow).
export function gtWeekday(date: Date) {
  const name = date.toLocaleDateString("en-US", { timeZone: GT_TIMEZONE, weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

// "hace 5 min", "hace 2 h", "hace 3 d": para ver de un vistazo cuánto lleva esperando un ticket.
export function timeAgo(iso: string, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
