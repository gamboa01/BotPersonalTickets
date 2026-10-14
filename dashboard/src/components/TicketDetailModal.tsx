import { useRef, useState } from "react";
import { Adjunto, Comentario, Tecnico, Ticket } from "../supabaseClient";
import { formatGt } from "../timezone";

// Mismo tope que el bot (MAX_ADJUNTOS_POR_TICKET) y que agregar_adjunto().
const MAX_FOTOS = 4;

export type TicketAccion = "resolver" | "reabrir" | "anular";

const ACCION_UI: Record<TicketAccion, { placeholder: string; boton: string }> = {
  resolver: { placeholder: "Qué se hizo (opcional)", boton: "Marcar resuelto" },
  reabrir: { placeholder: "Por qué se reabre (opcional)", boton: "Reabrir" },
  anular: { placeholder: "Motivo, p. ej. duplicado del #12 (opcional)", boton: "Anular ticket" },
};

interface TicketDetailModalProps {
  ticket: Ticket;
  tecnicos: Tecnico[];
  onAssign: (ticketId: number, tecnicoId: number | null) => void;
  onAction: (accion: TicketAccion, ticketId: number, texto: string) => Promise<boolean>;
  onEdit: () => void;
  onComment: (ticketId: number, texto: string, seguimiento: boolean) => Promise<boolean>;
  onPhoto: (ticketId: number, file: File) => Promise<boolean>;
  comentarios: Comentario[];
  adjuntos: Adjunto[];
  loadingComentarios: boolean;
  onClose: () => void;
}

export function TicketDetailModal({
  ticket,
  tecnicos,
  onAssign,
  onAction,
  onEdit,
  onComment,
  onPhoto,
  comentarios,
  adjuntos,
  loadingComentarios,
  onClose,
}: TicketDetailModalProps) {
  const [accion, setAccion] = useState<TicketAccion | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pendiente = ticket.estado === "abierto" || ticket.estado === "en_progreso";
  const [comentario, setComentario] = useState("");
  const [seguimiento, setSeguimiento] = useState(false);
  const [comentando, setComentando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const puedeFoto = adjuntos.length < MAX_FOTOS;

  async function comentar() {
    if (!comentario.trim()) return;
    setComentando(true);
    const ok = await onComment(ticket.id, comentario.trim(), seguimiento);
    setComentando(false);
    if (ok) {
      setComentario("");
      setSeguimiento(false);
    }
  }

  async function subirFoto(file: File) {
    setSubiendo(true);
    await onPhoto(ticket.id, file);
    setSubiendo(false);
  }

  function abrir(nueva: TicketAccion) {
    setAccion(nueva);
    setTexto("");
  }

  async function confirmar() {
    if (!accion) return;
    setGuardando(true);
    const ok = await onAction(accion, ticket.id, texto);
    setGuardando(false);
    if (ok) setAccion(null);
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
          {pendiente && (
            <button className="action-button action-button-primary" onClick={() => abrir("resolver")}>
              ✅ Resolver
            </button>
          )}
          {!pendiente && (
            <button className="action-button action-button-primary" onClick={() => abrir("reabrir")}>
              🔁 Reabrir
            </button>
          )}
          <button className="action-button" onClick={onEdit}>
            ✏️ Editar
          </button>
          <button
            className="action-button"
            onClick={() => fileInput.current?.click()}
            disabled={!puedeFoto || subiendo}
            title={puedeFoto ? "Adjuntar una foto" : `Máximo ${MAX_FOTOS} fotos por ticket`}
          >
            {subiendo ? "Subiendo..." : `📷 Foto (${adjuntos.length}/${MAX_FOTOS})`}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) subirFoto(file);
              e.target.value = "";
            }}
          />
          {ticket.estado !== "anulado" && (
            <button className="action-button doc-danger" onClick={() => abrir("anular")}>
              🚫 Anular
            </button>
          )}
        </div>

        {accion && (
          <div className="resolver-inline">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              placeholder={ACCION_UI[accion].placeholder}
              autoFocus
            />
            <button
              className={`action-button ${accion === "anular" ? "doc-danger" : "action-button-primary"}`}
              onClick={confirmar}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : ACCION_UI[accion].boton}
            </button>
            <button className="action-button" onClick={() => setAccion(null)}>
              Cancelar
            </button>
            {accion === "anular" && (
              <span className="doc-hint">
                El ticket no se borra: queda en el historial, pero deja de contar en estadísticas y en Hoy. Se puede
                reabrir.
              </span>
            )}
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
        <div className="comentar">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) comentar();
            }}
            placeholder="Agregar un comentario… (Ctrl+Enter para guardar)"
          />
          <div className="comentar-actions">
            {ticket.estado === "abierto" && (
              <label className="equipo-activo">
                <input type="checkbox" checked={seguimiento} onChange={(e) => setSeguimiento(e.target.checked)} />
                Es seguimiento (pasa a “en progreso”)
              </label>
            )}
            <button
              className="action-button action-button-primary"
              onClick={comentar}
              disabled={comentando || !comentario.trim()}
            >
              {comentando ? "Guardando..." : "Agregar comentario"}
            </button>
          </div>
        </div>
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
