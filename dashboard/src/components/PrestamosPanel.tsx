import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CornerDownLeft, History, Plus, X } from "lucide-react";
import { Area, Prestamo, supabase, Tecnico } from "../supabaseClient";
import { NIVEL_LABEL, normalizar } from "../planUtils";
import { formatGt, timeAgo } from "../timezone";

interface PrestamosPanelProps {
  areas: Area[];
  tecnicos: Tecnico[];
  now: number;
}

const TECNICO_KEY = "atencion-tecnico";

function tecnicoGuardado() {
  try {
    return Number(localStorage.getItem(TECNICO_KEY)) || null;
  } catch {
    return null;
  }
}

// Préstamos de equipo: solo en la PC (no en #pantalla), sin fecha de devolución.
export function PrestamosPanel({ areas, tecnicos, now }: PrestamosPanelProps) {
  const [activos, setActivos] = useState<Prestamo[]>([]);
  const [showNuevo, setShowNuevo] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("prestamos")
      .select("*")
      .is("devuelto_at", null)
      .order("prestado_at", { ascending: false });
    setActivos((data ?? []) as Prestamo[]);
  }

  useEffect(() => {
    load();
    const refresco = setInterval(load, 60_000);
    const channel = supabase
      .channel("prestamos-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "prestamos" }, load)
      .subscribe();
    return () => {
      clearInterval(refresco);
      supabase.removeChannel(channel);
    };
  }, []);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const tecnicoById = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos]);

  async function devolver(prestamo: Prestamo) {
    const { error } = await supabase
      .from("prestamos")
      .update({ devuelto_at: new Date().toISOString() })
      .eq("id", prestamo.id);
    if (error) alert(`No se pudo marcar como devuelto: ${error.message}`);
    else load();
  }

  return (
    <section className="prestamos">
      <div className="prestamos-head">
        <h3>
          <ArrowLeftRight size={15} /> Préstamos activos
          <span className="hoy-col-count">{activos.length}</span>
        </h3>
        <div className="prestamos-actions">
          <button className="action-button" onClick={() => setShowHistorial(true)}>
            <History size={15} /> Historial
          </button>
          <button className="action-button action-button-primary" onClick={() => setShowNuevo(true)}>
            <Plus size={15} /> Prestar equipo
          </button>
        </div>
      </div>

      {activos.length === 0 ? (
        <p className="hoy-empty">No hay equipo prestado.</p>
      ) : (
        <ul className="prestamos-list">
          {activos.map((p) => {
            const area = p.area_id ? areaById.get(p.area_id) : undefined;
            return (
              <li key={p.id}>
                <div className="prestamo-info">
                  <b>{p.equipo}</b>
                  <span>
                    {p.prestado_a}
                    {area && ` · ${area.nombre}`}
                  </span>
                  <small>
                    {timeAgo(p.prestado_at, now)}
                    {p.tecnico_id && ` · prestó ${tecnicoById.get(p.tecnico_id)?.nombre ?? "—"}`}
                    {p.nota && ` · ${p.nota}`}
                  </small>
                </div>
                <button className="action-button" onClick={() => devolver(p)}>
                  <CornerDownLeft size={15} /> Devuelto
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showNuevo && (
        <NuevoPrestamoModal areas={areas} tecnicos={tecnicos} onClose={() => setShowNuevo(false)} onSaved={load} />
      )}
      {showHistorial && (
        <HistorialModal areaById={areaById} tecnicoById={tecnicoById} onClose={() => setShowHistorial(false)} />
      )}
    </section>
  );
}

function NuevoPrestamoModal({
  areas,
  tecnicos,
  onClose,
  onSaved,
}: {
  areas: Area[];
  tecnicos: Tecnico[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const activos = tecnicos.filter((t) => t.activo);
  const guardado = tecnicoGuardado();
  const [equipo, setEquipo] = useState("");
  const [prestadoA, setPrestadoA] = useState("");
  const [areaId, setAreaId] = useState<number | null>(null);
  const [tecnicoId, setTecnicoId] = useState<number | null>(
    activos.some((t) => t.id === guardado) ? guardado : activos[0]?.id ?? null
  );
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const areasElegibles = areas.filter((a) => a.tipo !== "referencia").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  async function guardar() {
    if (!equipo.trim()) return setError("Escribe qué se presta.");
    if (!prestadoA.trim()) return setError("Escribe a quién se le presta.");
    setSaving(true);
    const { error } = await supabase.from("prestamos").insert({
      equipo: equipo.trim(),
      prestado_a: prestadoA.trim(),
      area_id: areaId,
      tecnico_id: tecnicoId,
      nota: nota.trim() || null,
    });
    setSaving(false);
    if (error) return setError(`No se pudo registrar: ${error.message}`);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Prestar equipo</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="doc-field">
          <label htmlFor="prEquipo">Qué se presta</label>
          <input
            id="prEquipo"
            type="text"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            placeholder="Ej: Cable HDMI 3 m"
            autoFocus
          />
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="prA">A quién</label>
            <input id="prA" type="text" value={prestadoA} onChange={(e) => setPrestadoA(e.target.value)} />
          </div>
          <div className="doc-field">
            <label htmlFor="prArea">Área (opcional)</label>
            <select id="prArea" value={areaId ?? ""} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}>
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
        </div>

        <div className="doc-grid2">
          <div className="doc-field">
            <label htmlFor="prTec">Prestó</label>
            <select id="prTec" value={tecnicoId ?? ""} onChange={(e) => setTecnicoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {activos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="doc-field">
            <label htmlFor="prNota">Nota (opcional)</label>
            <input id="prNota" type="text" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        {error && <p className="doc-field-error">{error}</p>}

        <div className="doc-modal-footer">
          <span />
          <div className="doc-modal-footer-right">
            <button className="action-button" onClick={onClose}>
              Cancelar
            </button>
            <button className="action-button action-button-primary" onClick={guardar} disabled={saving}>
              {saving ? "Guardando..." : "Registrar préstamo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistorialModal({
  areaById,
  tecnicoById,
  onClose,
}: {
  areaById: Map<number, Area>;
  tecnicoById: Map<number, Tecnico>;
  onClose: () => void;
}) {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase
      .from("prestamos")
      .select("*")
      .order("prestado_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setPrestamos((data ?? []) as Prestamo[]));
  }, []);

  const filtrados = prestamos.filter((p) => {
    const q = normalizar(query);
    if (!q) return true;
    const area = p.area_id ? areaById.get(p.area_id)?.nombre : "";
    return [p.equipo, p.prestado_a, area, p.nota].some((v) => v && normalizar(v).includes(q));
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Historial de préstamos</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          className="docs-search prestamos-buscar"
          placeholder="Buscar equipo, persona o área…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {filtrados.length === 0 ? (
          <p className="empty-state">Sin préstamos que coincidan.</p>
        ) : (
          <ul className="prestamos-list historial">
            {filtrados.map((p) => (
              <li key={p.id}>
                <div className="prestamo-info">
                  <b>{p.equipo}</b>
                  <span>
                    {p.prestado_a}
                    {p.area_id && ` · ${areaById.get(p.area_id)?.nombre ?? ""}`}
                  </span>
                  <small>
                    Prestado {formatGt(p.prestado_at)}
                    {p.tecnico_id && ` por ${tecnicoById.get(p.tecnico_id)?.nombre ?? "—"}`}
                    {p.nota && ` · ${p.nota}`}
                  </small>
                </div>
                <span className={`badge ${p.devuelto_at ? "badge-resuelto" : "badge-en_progreso"}`}>
                  {p.devuelto_at ? `Devuelto ${formatGt(p.devuelto_at)}` : "Prestado"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
