import { useState } from "react";
import { Adjunto, Comentario, Tecnico, Ticket } from "../supabaseClient";
import { formatGt } from "../timezone";
import { botDeepLink } from "../telegram";

interface TicketDetailModalProps {
  ticket: Ticket;
  tecnicos: Tecnico[];
  onAssign: (ticketId: number, tecnicoId: number | null) => void;
  onResolve: (ticketId: number, nota: string) => Promise<boolean>;
  comentarios: Comentario[];
  adjuntos: Adjunto[];
  loadingComentarios: boolean;
  onClose: () => void;
}

export function TicketDetailModal({
  ticket,
  tecnicos,
  onAssign,
  onResolve,
  comentarios,
  adjuntos,
  loadingComentarios,
  onClose,
}: TicketDetailModalProps) {
  const [resolviendo, setResolviendo] = useState(false);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function resolver() {
    setGuardando(true);
    const ok = await onResolve(ticket.id, nota);
    setGuardando(false);
    if (ok) {
      setResolviendo(false);
      setNota("");
    }
  }

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
          <dt>Área</dt>
          <dd>{ticket.areas?.nombre ?? "-"}</dd>
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
          <dt>Atiende</dt>
          <dd>
            <select
              className="modal-assign"
              value={ticket.asignado_id ?? ""}
              onChange={(e) => onAssign(ticket.id, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin asignar</option>
              {tecnicos
                .filter((t) => t.activo || t.id === ticket.asignado_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
            </select>
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

        <div className="modal-actions">
          {(ticket.estado === "abierto" || ticket.estado === "en_progreso") && (
            <>
              <a className="action-button" href={botDeepLink("seguimiento", ticket.id)} target="_blank" rel="noreferrer">
                🔧 Dar seguimiento
              </a>
              <button className="action-button action-button-primary" onClick={() => setResolviendo(true)}>
                ✅ Resolver
              </button>
              {/* Por el bot se avisa por Telegram a quien lo reportó; desde aquí no. */}
              {ticket.reportado_por !== 0 && (
                <a className="action-button" href={botDeepLink("resolver", ticket.id)} target="_blank" rel="noreferrer">
                  ✅ Resolver por Telegram
                </a>
              )}
            </>
          )}
          {(ticket.estado === "resuelto" || ticket.estado === "cerrado") && (
            <a className="action-button" href={botDeepLink("reabrir", ticket.id)} target="_blank" rel="noreferrer">
              🔁 Reabrir
            </a>
          )}
          <a className="action-button" href={botDeepLink("foto", ticket.id)} target="_blank" rel="noreferrer">
            📎 Adjuntar foto
          </a>
        </div>

        {resolviendo && (
          <div className="resolver-inline">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resolver()}
              placeholder="Qué se hizo (opcional)"
              autoFocus
            />
            <button className="action-button action-button-primary" onClick={resolver} disabled={guardando}>
              {guardando ? "Guardando..." : "Marcar resuelto"}
            </button>
            <button className="action-button" onClick={() => setResolviendo(false)}>
              Cancelar
            </button>
          </div>
        )}

        <h3>Descripción</h3>
        <p className="modal-descripcion">{ticket.descripcion}</p>

        {adjuntos.length > 0 && (
          <>
            <h3>Fotos</h3>
            <div className="modal-fotos">
              {adjuntos.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={`Adjunto del ticket #${ticket.id}`} loading="lazy" />
                </a>
              ))}
            </div>
          </>
        )}

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
