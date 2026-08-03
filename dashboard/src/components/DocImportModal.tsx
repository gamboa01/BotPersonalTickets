import { useRef, useState } from "react";

interface DocImportModalProps {
  onImport: (jsonText: string) => Promise<void>;
  onClose: () => void;
}

export function DocImportModal({ onImport, onClose }: DocImportModalProps) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText((reader.result as string) ?? "");
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setImporting(true);
    await onImport(text);
    setImporting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Importar respaldo</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="doc-field">
          <label htmlFor="docImportText">Pega el JSON exportado, o elige un archivo</label>
          <textarea
            id="docImportText"
            className="doc-import-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{"entries": [ { "title": "...", ... } ]}'
            autoFocus
          />
        </div>

        <div className="doc-modal-footer">
          <button className="action-button" onClick={() => fileInputRef.current?.click()}>
            📁 Elegir archivo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="doc-modal-footer-right">
            <button className="action-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="action-button action-button-primary"
              onClick={handleImport}
              disabled={importing || !text.trim()}
            >
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
