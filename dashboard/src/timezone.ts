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
