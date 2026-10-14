import { useState } from "react";
import { supabase, Tecnico } from "../supabaseClient";
import { AREA_COLORS } from "../planUtils";

interface EquipoModalProps {
  tecnicos: Tecnico[];
  onClose: () => void;
}

// Quién atiende tickets. No se borran técnicos (los tickets viejos conservan
// quién los atendió): se desactivan y dejan de salir como columna y en "Asignar".
export function EquipoModal({ tecnicos, onClose }: EquipoModalProps) {
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);

  async function update(id: number, changes: Partial<Tecnico>) {
    const { error } = await supabase.from("tecnicos").update(changes).eq("id", id);
    if (error) alert(`No se pudo guardar: ${error.message}`);
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setSaving(true);
    const color = AREA_COLORS[tecnicos.length % AREA_COLORS.length];
    const { error } = await supabase.from("tecnicos").insert({ nombre, color });
    setSaving(false);
    if (error) alert(`No se pudo agregar: ${error.message}`);
    else setNuevo("");
  }

  function siguienteColor(actual: string | null) {
    const i = AREA_COLORS.indexOf(actual ?? "");
    return AREA_COLORS[(i + 1) % AREA_COLORS.length];
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Equipo de TI</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="doc-hint">Cada persona activa aparece como columna en la pantalla y en “Asignar”.</p>

        <ul className="equipo-list">
          {tecnicos.map((t) => (
            <li key={t.id} className={t.activo ? "" : "inactivo"}>
              <button
                className="area-color"
                style={{ background: t.color || "#22d3ee" }}
                onClick={() => update(t.id, { color: siguienteColor(t.color) })}
                title="Cambiar color"
                aria-label="Cambiar color"
              />
              <input
                type="text"
                defaultValue={t.nombre}
                onBlur={(e) => {
                  const nombre = e.target.value.trim();
                  if (nombre && nombre !== t.nombre) update(t.id, { nombre });
                }}
              />
              <label className="equipo-activo">
                <input type="checkbox" checked={t.activo} onChange={(e) => update(t.id, { activo: e.target.checked })} />
                Activo
              </label>
            </li>
          ))}
        </ul>

        <div className="equipo-add">
          <input
            type="text"
            value={nuevo}
            placeholder="Nombre de la persona"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
          />
          <button className="action-button action-button-primary" onClick={agregar} disabled={saving || !nuevo.trim()}>
            + Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
