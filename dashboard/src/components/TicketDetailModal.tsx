import { Comentario, Ticket } from "../supabaseClient";
import { formatGt } from "../timezone";

interface TicketDetailModalProps {
  ticket: Ticket;
  comentarios: Comentario[];
  loadingComentarios: boolean;
  onClose: () => void;
}

export function TicketDetailModal({ ticket, comentarios, loadingComentarios, onClose }: TicketDetailModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ticket #{ticket.id}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <dl className="modal-meta">
          <dt>Categoría</dt>
          <dd>{ticket.categorias?.nombre ?? "-"}</dd>
          <dt>Prioridad</dt>
          <dd>
            <span className={`badge badge-${ticket.prioridad}`}>{ticket.prioridad}</span>
          </dd>
          <dt>Estado</dt>
          <dd>
            <span className={`badge badge-${ticket.estado}`}>{ticket.estado}</span>
          </dd>
          <dt>Reportado por</dt>
          <dd>{ticket.reportado_por_nombre ?? ticket.reportado_por}</dd>
          <dt>Creado</dt>
          <dd>{formatGt(ticket.created_at)}</dd>
          {ticket.resolved_at && (
            <>
              <dt>Resuelto</dt>
              <dd>{formatGt(ticket.resolved_at)}</dd>
            </>
          )}
        </dl>

        <h3>Descripción</h3>
        <p className="modal-descripcion">{ticket.descripcion}</p>

        <h3>Historial</h3>
        {loadingComentarios ? (
          <p className="empty-state">Cargando historial...</p>
        ) : comentarios.length === 0 ? (
          <p className="empty-state">Sin comentarios todavía.</p>
        ) : (
          <ul className="modal-historial">
            {comentarios.map((c) => (
              <li key={c.id}>
                <span className="historial-fecha">{formatGt(c.created_at)}</span>
                <span className="historial-texto">{c.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
