import { Ticket } from "../supabaseClient";

interface TicketsTableProps {
  tickets: Ticket[];
}

const ESTADO_LABEL: Record<Ticket["estado"], string> = {
  abierto: "Abierto",
  en_progreso: "En progreso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

export function TicketsTable({ tickets }: TicketsTableProps) {
  if (tickets.length === 0) {
    return <p className="empty-state">No hay tickets que coincidan con el filtro.</p>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Prioridad</th>
            <th>Estado</th>
            <th>Reportado por</th>
            <th>Creado</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td className="descripcion-cell">{t.descripcion}</td>
              <td>{t.categorias?.nombre ?? "-"}</td>
              <td>
                <span className={`badge badge-${t.prioridad}`}>{t.prioridad}</span>
              </td>
              <td>
                <span className={`badge badge-${t.estado}`}>{ESTADO_LABEL[t.estado]}</span>
              </td>
              <td>{t.reportado_por_nombre ?? t.reportado_por}</td>
              <td>{new Date(t.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
