import { useState } from "react";
import { registrarDeepLink } from "../telegram";

export function RegistrarTicket() {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const trimmed = nombre.trim();
    if (!trimmed) return;

    const link = registrarDeepLink(trimmed);
    if (!link) {
      setError("Ese nombre es muy largo, abrévialo un poco.");
      return;
    }
    setError(null);
    window.open(link, "_blank", "noopener,noreferrer");
    setNombre("");
  }

  return (
    <div className="registrar-form">
      <input
        type="text"
        placeholder="Nombre de quien reportó"
        value={nombre}
        onChange={(e) => {
          setNombre(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
      />
      <button className="action-button action-button-primary" onClick={handleClick} disabled={!nombre.trim()}>
        📋 Registrar para otro
      </button>
      {error && <span className="registrar-error">{error}</span>}
    </div>
  );
}
