import { useEffect, useState } from "react";
import { Area, Categoria, Prioridad, supabase, Tecnico } from "../supabaseClient";
import { NIVEL_LABEL } from "../planUtils";
import { GT_TIMEZONE } from "../timezone";

interface RegistrarAtencionModalProps {
  areas: Area[];
  tecnicos: Tecnico[];
  onClose: () => void;
}

const TECNICO_KEY = "atencion-tecnico";
const PRIORIDADES: { value: Prioridad; label: string }[] = [
  { value: "baja", label: "🟢 Baja" },
  { value: "media", label: "🟡 Media" },
  { value: "alta", label: "🟠 Alta" },
  { value: "critica", label: "🔴 Crítica" },
];

// Valor para <input type="datetime-local"> con la hora actual de Guatemala.
function ahoraGt() {
  return new Date().toLocaleString("sv-SE", { timeZone: GT_TIMEZONE }).replace(" ", "T").slice(0, 16);
}

// Guatemala no tiene horario de verano: siempre UTC-6.
function gtLocalToIso(value: string) {
  return new Date(`${value}:00-06:00`).toISOString();
}

function leerTecnicoGuardado() {
  try {
    return Number(localStorage.getItem(TECNICO_KEY)) || null;
  } catch {
    return null;
  }
}

export function RegistrarAtencionModal({ areas, tecnicos, onClose }: RegistrarAtencionModalProps) {
  const activos = tecnicos.filter((t) => t.activo);
  const guardado = leerTecnicoGuardado();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [pidio, setPidio] = useState("");
  const [tecnicoId, setTecnicoId] = useState<number | null>(
    activos.some((t) => t.id === guardado) ? guardado : activos[0]?.id ?? null
  );
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [creado, setCreado] = useState(ahoraGt);
  const [resuelto, setResuelto] = useState(true);
  const [resueltoAt, setResueltoAt] = useState(ahoraGt);
  const [resolucion, setResolucion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("categorias")
      .select("*")
      .order("id")
      .then(({ data }) => setCategorias((data ?? []) as Categoria[]));
  }, []);

  const areasElegibles = areas.filter((a) => a.tipo !== "referencia").sort((a, b) => a.nombre.localeCompare(b.nombre));

  async function guardar() {
    if (!descripcion.trim()) return setError("Escribe qué pasó o qué se hizo.");
    if (resuelto && resueltoAt < creado) return setError("La hora de cierre no puede ser antes de la de inicio.");
    setSaving(true);
    const { error } = await supabase.rpc("registrar_atencion", {
      p_descripcion: descripcion.trim(),
      p_area_id: areaId,
      p_categoria_id: categoriaId,
      p_prioridad: prioridad,
      p_reportado_por_nombre: pidio.trim() || null,
      p_tecnico_id: tecnicoId,
      p_creado: gtLocalToIso(creado),
      p_resuelto: resuelto,
      p_resuelto_at: resuelto ? gtLocalToIso(resueltoAt) : null,
      p_resolucion: resuelto ? resolucion.trim() || null : null,
    });
    setSaving(false);
    if (error) return setError(`No se pudo registrar: ${error.message}`);
    try {
      if (tecnicoId) localStorage.setItem(TECNICO_KEY, String(tecnicoId));
    } catch {
      // Sin almacenamiento: la próxima vez se elige de nuevo.
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Registrar atención</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="atArea">Área</label>
            <select id="atArea" value={areaId ?? ""} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin área</option>
              {([1, 2] as const).map((nivel) => (
                <optgroup key={nivel} label={NIVEL_LABEL[nivel]}>
                  {areasElegibles
                    .filter((a) => a.nivel === nivel)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="doc-field">
            <label htmlFor="atCat">Categoría</label>
            <select
              id="atCat"
              value={categoriaId ?? ""}
              onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="doc-field">
          <label htmlFor="atDesc">Qué pasó</label>
          <textarea
            id="atDesc"
            className="area-notas"
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setError(null);
            }}
            placeholder="Ej: La impresora imprime con líneas"
            autoFocus
          />
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="atPidio">Quién lo pidió (opcional)</label>
            <input id="atPidio" type="text" value={pidio} onChange={(e) => setPidio(e.target.value)} />
          </div>
          <div className="doc-field">
            <label htmlFor="atTec">Atiende</label>
            <select
              id="atTec"
              value={tecnicoId ?? ""}
              onChange={(e) => setTecnicoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin asignar</option>
              {activos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label>Prioridad</label>
            <div className="segmented">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={prioridad === p.value ? "active" : ""}
                  onClick={() => setPrioridad(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="doc-field">
            <label htmlFor="atCreado">Cuándo lo pidieron</label>
            <input id="atCreado" type="datetime-local" value={creado} onChange={(e) => setCreado(e.target.value)} />
          </div>
        </div>

        <label className="equipo-activo atencion-resuelto">
          <input type="checkbox" checked={resuelto} onChange={(e) => setResuelto(e.target.checked)} />
          Ya quedó resuelto
        </label>

        {resuelto ? (
          <div className="doc-grid2">
            <div className="doc-field">
              <label htmlFor="atRes">Qué se hizo (opcional)</label>
              <input
                id="atRes"
                type="text"
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
                placeholder="Ej: Limpieza de cabezales"
              />
            </div>
            <div className="doc-field">
              <label htmlFor="atResAt">Cuándo se resolvió</label>
              <input id="atResAt" type="datetime-local" value={resueltoAt} onChange={(e) => setResueltoAt(e.target.value)} />
            </div>
          </div>
        ) : (
          <p className="doc-hint">Quedará pendiente en Hoy, en la columna de quien atiende, hasta que se resuelva.</p>
        )}

        {error && <p className="doc-field-error">{error}</p>}

        <div className="doc-modal-footer">
          <span />
          <div className="doc-modal-footer-right">
            <button className="action-button" onClick={onClose}>
              Cancelar
            </button>
            <button className="action-button action-button-primary" onClick={guardar} disabled={saving}>
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
