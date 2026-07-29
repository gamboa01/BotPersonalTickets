import { useEffect, useState } from "react";
import { DocEntry } from "../supabaseClient";

export interface DocDraft {
  title: string;
  category: string;
  tags: string[];
  username: string;
  url: string;
  cred_ref: string;
  body: string;
}

interface DocEditorModalProps {
  entry: DocEntry | null;
  categories: string[];
  saving: boolean;
  onSave: (draft: DocDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function DocEditorModal({ entry, categories, saving, onSave, onDelete, onClose }: DocEditorModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [credRef, setCredRef] = useState("");
  const [body, setBody] = useState("");
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    setTitle(entry?.title ?? "");
    setCategory(entry?.category ?? "");
    setTagsInput((entry?.tags ?? []).join(", "));
    setUsername(entry?.username ?? "");
    setUrl(entry?.url ?? "");
    setCredRef(entry?.cred_ref ?? "");
    setBody(entry?.body ?? "");
    setTitleError(false);
  }, [entry]);

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(true);
      return;
    }
    onSave({
      title: trimmedTitle,
      category: category.trim() || "Otros",
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      username: username.trim(),
      url: url.trim(),
      cred_ref: credRef.trim(),
      body,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2>{entry ? "Editar entrada" : "Nueva entrada"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="doc-field">
          <label htmlFor="docTitle">Título</label>
          <input
            id="docTitle"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(false);
            }}
            placeholder="Ej: Restablecer contraseña de alumno en Chamilo"
            autoFocus
          />
          {titleError && <span className="doc-field-error">Ponle un título a la entrada.</span>}
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="docCat">Categoría</label>
            <input
              id="docCat"
              type="text"
              list="docCatList"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Plataformas"
            />
            <datalist id="docCatList">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="doc-field">
            <label htmlFor="docTags">Etiquetas (separadas por coma)</label>
            <input
              id="docTags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="chamilo, alumnos, contraseñas"
            />
          </div>
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="docUser">Usuario / cuenta (opcional)</label>
            <input
              id="docUser"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@alatina.online"
            />
          </div>
          <div className="doc-field">
            <label htmlFor="docUrl">URL / acceso (opcional)</label>
            <input
              id="docUrl"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://campus.alatina.online"
            />
          </div>
        </div>

        <div className="doc-field">
          <label htmlFor="docRef">Referencia de credencial (opcional)</label>
          <input
            id="docRef"
            type="text"
            value={credRef}
            onChange={(e) => setCredRef(e.target.value)}
            placeholder="Ej: KeePass > Google Workspace admin"
          />
          <div className="doc-cred-note">
            ⚠️ Aquí va <b>dónde encontrar</b> la contraseña (el nombre de la entrada en tu gestor), no la contraseña
            en sí.
          </div>
        </div>

        <div className="doc-field">
          <label htmlFor="docBody">Contenido / procedimiento</label>
          <textarea
            id="docBody"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Pasos, notas, comandos, enlaces... Se respetan los saltos de línea."
          />
          <span className="doc-hint">
            Consejo: numera los pasos. Los enlaces http(s) se vuelven clicables al ver la entrada.
          </span>
        </div>

        <div className="doc-modal-footer">
          {entry ? (
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
