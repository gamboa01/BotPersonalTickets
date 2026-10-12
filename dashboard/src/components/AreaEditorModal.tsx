import { useState } from "react";
import { AreaTipo } from "../supabaseClient";
import { AREA_COLORS, GRID_H, GRID_W, NIVEL_LABEL, TIPO_LABEL, clampRect } from "../planUtils";

export interface AreaDraft {
  nombre: string;
  nivel: 1 | 2;
  tipo: AreaTipo;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string | null;
  ubicacion: string;
  encargado: string;
  extension: string;
  notas: string;
}

interface AreaEditorModalProps {
  initial: AreaDraft;
  isNew: boolean;
  saving: boolean;
  onSave: (draft: AreaDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function AreaEditorModal({ initial, isNew, saving, onSave, onDelete, onClose }: AreaEditorModalProps) {
  const [draft, setDraft] = useState<AreaDraft>(initial);
  const [nombreError, setNombreError] = useState(false);

  function set<K extends keyof AreaDraft>(key: K, value: AreaDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    const nombre = draft.nombre.trim();
    if (!nombre) {
      setNombreError(true);
      return;
    }
    onSave({
      ...draft,
      ...clampRect(draft),
      nombre,
      ubicacion: draft.ubicacion.trim(),
      encargado: draft.encargado.trim(),
      extension: draft.extension.trim(),
      notas: draft.notas.trim(),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? "Nueva área" : "Editar área"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="doc-field">
          <label htmlFor="areaNombre">Nombre</label>
          <input
            id="areaNombre"
            type="text"
            value={draft.nombre}
            onChange={(e) => {
              set("nombre", e.target.value);
              setNombreError(false);
            }}
            placeholder="Ej: Contabilidad"
            autoFocus
          />
          {nombreError && <span className="doc-field-error">Ponle un nombre al área.</span>}
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="areaNivel">Planta</label>
            <select id="areaNivel" value={draft.nivel} onChange={(e) => set("nivel", Number(e.target.value) as 1 | 2)}>
              <option value={1}>{NIVEL_LABEL[1]}</option>
              <option value={2}>{NIVEL_LABEL[2]}</option>
            </select>
          </div>
          <div className="doc-field">
            <label htmlFor="areaTipo">Tipo</label>
            <select id="areaTipo" value={draft.tipo} onChange={(e) => set("tipo", e.target.value as AreaTipo)}>
              {(Object.keys(TIPO_LABEL) as AreaTipo[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="doc-field">
          <label>Color</label>
          <div className="area-colors">
            <button
              type="button"
              className={`area-color-auto${draft.color === null ? " active" : ""}`}
              onClick={() => set("color", null)}
            >
              Según tipo
            </button>
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`area-color${draft.color === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => set("color", c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="doc-field">
          <label htmlFor="areaUbicacion">Cómo llegar</label>
          <input
            id="areaUbicacion"
            type="text"
            value={draft.ubicacion}
            onChange={(e) => set("ubicacion", e.target.value)}
            placeholder="Ej: Subiendo las gradas del lado izquierdo, segunda puerta"
          />
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="areaEncargado">Encargado (opcional)</label>
            <input
              id="areaEncargado"
              type="text"
              value={draft.encargado}
              onChange={(e) => set("encargado", e.target.value)}
            />
          </div>
          <div className="doc-field">
            <label htmlFor="areaExt">Extensión (opcional)</label>
            <input id="areaExt" type="text" value={draft.extension} onChange={(e) => set("extension", e.target.value)} />
          </div>
        </div>

        <div className="doc-field">
          <label htmlFor="areaNotas">Notas (opcional)</label>
          <textarea
            id="areaNotas"
            className="area-notas"
            value={draft.notas}
            onChange={(e) => set("notas", e.target.value)}
            placeholder="Equipos, impresoras, red, referencias..."
          />
        </div>

        <div className="doc-field">
          <label>Posición en el plano (celdas, de {GRID_W} × {GRID_H})</label>
          <div className="area-rect-fields">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <label key={k}>
                <span>{{ x: "Columna", y: "Fila", w: "Ancho", h: "Alto" }[k]}</span>
                <input type="number" min={k === "w" || k === "h" ? 1 : 0} value={draft[k]} onChange={(e) => set(k, Number(e.target.value))} />
              </label>
            ))}
          </div>
          <span className="doc-hint">También puedes moverla arrastrándola en el plano, o cambiar su tamaño desde la esquina.</span>
        </div>

        <div className="doc-modal-footer">
          {!isNew ? (
            <button className="action-button doc-danger" onClick={onDelete}>
              🗑 Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="doc-modal-footer-right">
            <button className="action-button" onClick={onClose}>
              Cancelar
            </button>
            <button className="action-button action-button-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
