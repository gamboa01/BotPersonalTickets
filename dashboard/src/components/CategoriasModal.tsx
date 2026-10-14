import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Categoria, supabase } from "../supabaseClient";
import { ordenarCategorias } from "../categoriasUtils";

interface CategoriasModalProps {
  onClose: () => void;
}

// Categorías de los tickets. No se borran (los tickets viejos las conservan):
// se desactivan y dejan de ofrecerse en el bot y en "Registrar atención".
export function CategoriasModal({ onClose }: CategoriasModalProps) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nueva, setNueva] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("categorias").select("*");
    setCategorias(ordenarCategorias((data ?? []) as Categoria[]));
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: number, changes: Partial<Categoria>) {
    const { error } = await supabase.from("categorias").update(changes).eq("id", id);
    if (error) alert(`No se pudo guardar: ${error.message}`);
    load();
  }

  async function agregar() {
    const nombre = nueva.trim();
    if (!nombre) return;
    if (categorias.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert("Ya existe una categoría con ese nombre.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("categorias").insert({ nombre });
    setSaving(false);
    if (error) return alert(`No se pudo agregar: ${error.message}`);
    setNueva("");
    load();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Categorías</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="doc-hint">
          Las activas aparecen al crear un ticket (bot y “Registrar atención”). Desactivar una no la quita de los
          tickets que ya la tienen.
        </p>

        <ul className="equipo-list">
          {categorias.map((c) => (
            <li key={c.id} className={c.activa ? "" : "inactivo"}>
              <input
                type="text"
                defaultValue={c.nombre}
                onBlur={(e) => {
                  const nombre = e.target.value.trim();
                  if (nombre && nombre !== c.nombre) update(c.id, { nombre });
                }}
              />
              <label className="equipo-activo">
                <input type="checkbox" checked={c.activa} onChange={(e) => update(c.id, { activa: e.target.checked })} />
                Activa
              </label>
            </li>
          ))}
        </ul>

        <div className="equipo-add">
          <input
            type="text"
            value={nueva}
            placeholder="Nueva categoría"
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
          />
          <button className="action-button action-button-primary" onClick={agregar} disabled={saving || !nueva.trim()}>
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
