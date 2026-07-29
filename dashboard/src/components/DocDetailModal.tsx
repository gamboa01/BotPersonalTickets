import { useState } from "react";
import { DocEntry } from "../supabaseClient";
import { formatDocDate, linkifySegments } from "../docsUtils";

interface DocDetailModalProps {
  entry: DocEntry;
  onEdit: () => void;
  onClose: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin acceso al portapapeles (permiso denegado): no hacemos nada más.
    }
  }

  return (
    <button className="doc-copy-btn" onClick={handleCopy} title="Copiar" type="button">
      {copied ? "✓" : "⧉"}
    </button>
  );
}

export function DocDetailModal({ entry, onEdit, onClose }: DocDetailModalProps) {
  const urlHref = entry.url && !/^https?:\/\//.test(entry.url) ? `https://${entry.url}` : entry.url;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{entry.title}</h2>
          <div className="doc-detail-actions">
            <button className="action-button" onClick={onEdit}>
              ✏️ Editar
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
        </div>

        <div className="doc-kv-row">
          <span className="doc-kv">
            <span className="doc-kv-key">Categoría</span>
            <span className="doc-kv-value">{entry.category || "Otros"}</span>
          </span>
          {entry.username && (
            <span className="doc-kv">
              <span className="doc-kv-key">Usuario</span>
              <span className="doc-kv-value mono">{entry.username}</span>
              <CopyButton value={entry.username} />
            </span>
          )}
          {entry.url && (
            <span className="doc-kv">
              <span className="doc-kv-key">URL</span>
              <a className="doc-kv-value mono" href={urlHref ?? undefined} target="_blank" rel="noreferrer">
                {entry.url}
              </a>
              <CopyButton value={entry.url} />
            </span>
          )}
          {entry.cred_ref && (
            <span className="doc-kv doc-kv-amber">
              <span className="doc-kv-key">Credencial en</span>
              <span className="doc-kv-value mono">{entry.cred_ref}</span>
            </span>
          )}
          <span className="doc-kv">
            <span className="doc-kv-key">Actualizado</span>
            <span className="doc-kv-value">{formatDocDate(entry.updated_at)}</span>
          </span>
        </div>

        {entry.tags.length > 0 && (
          <div className="doc-tags">
            {entry.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="doc-detail-body">
          {entry.body ? (
            linkifySegments(entry.body).map((seg, i) =>
              seg.isLink ? (
                <a key={i} href={seg.text} target="_blank" rel="noreferrer">
                  {seg.text}
                </a>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )
          ) : (
            <span className="empty-state">(sin contenido)</span>
          )}
        </div>
      </div>
    </div>
  );
}
