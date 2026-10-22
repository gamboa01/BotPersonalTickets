import { useMemo } from "react";
import { Tecnico, Ticket } from "../supabaseClient";
import { gtDayKey, gtWeekday } from "../timezone";

interface ResueltosPorEquipoProps {
  tickets: Ticket[];
  tecnicos: Tecnico[];
}

// Día de Guatemala `dias` días antes de `key` (YYYY-MM-DD).
function restarDias(key: string, dias: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - dias * 86_400_000).toISOString().slice(0, 10);
}

// Tickets resueltos por cada integrante (quien estaba asignado al resolverse),
// en días de Guatemala: hoy, semana (desde el lunes), mes y total. También sus
// pendientes, para ver la carga actual de cada uno.
export function ResueltosPorEquipo({ tickets, tecnicos }: ResueltosPorEquipoProps) {
  const filas = useMemo(() => {
    const hoy = gtDayKey(new Date().toISOString());
    const dow = gtWeekday(new Date());
    const lunes = restarDias(hoy, (dow + 6) % 7);
    const inicioMes = `${hoy.slice(0, 7)}-01`;

    const porPersona = new Map<number | null, { hoy: number; semana: number; mes: number; total: number; pendientes: number }>();
    const fila = (id: number | null) => {
      if (!porPersona.has(id)) porPersona.set(id, { hoy: 0, semana: 0, mes: 0, total: 0, pendientes: 0 });
      return porPersona.get(id)!;
    };
    tecnicos.filter((t) => t.activo).forEach((t) => fila(t.id));

    for (const t of tickets) {
      const f = fila(t.asignado_id);
      if (t.estado === "abierto" || t.estado === "en_progreso") {
        f.pendientes++;
        continue;
      }
      if ((t.estado !== "resuelto" && t.estado !== "cerrado") || !t.resolved_at) continue;
      const dia = gtDayKey(t.resolved_at);
      f.total++;
      if (dia >= inicioMes) f.mes++;
      if (dia >= lunes) f.semana++;
      if (dia === hoy) f.hoy++;
    }

    const nombre = (id: number | null) =>
      id === null ? "Sin asignar" : tecnicos.find((t) => t.id === id)?.nombre ?? `#${id}`;
    return Array.from(porPersona.entries())
      .map(([id, datos]) => ({
        id,
        nombre: nombre(id),
        color: tecnicos.find((t) => t.id === id)?.color ?? null,
        ...datos,
      }))
      .filter((f) => f.id !== null || f.total + f.pendientes > 0)
      .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.mes - a.mes || b.total - a.total));
  }, [tickets, tecnicos]);

  return (
    <div className="table-wrapper">
      <table className="resueltos-equipo">
        <thead>
          <tr>
            <th>Integrante</th>
            <th>Hoy</th>
            <th>Esta semana</th>
            <th>Este mes</th>
            <th>Total</th>
            <th>Pendientes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id ?? "sin"}>
              <td>
                <span className="area-card-dot" style={{ background: f.color ?? "var(--text-muted)" }} />
                {f.nombre}
              </td>
              <td>{f.hoy}</td>
              <td>{f.semana}</td>
              <td>{f.mes}</td>
              <td>
                <b>{f.total}</b>
              </td>
              <td>{f.pendientes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
