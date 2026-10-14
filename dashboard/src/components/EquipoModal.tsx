import { useEffect, useState } from "react";
import { Ausencia, supabase, Tecnico } from "../supabaseClient";
import { AREA_COLORS } from "../planUtils";
import { X } from "lucide-react";

interface EquipoModalProps {
  tecnicos: Tecnico[];
  hoy: string;
  onClose: () => void;
}

function formatFecha(fecha: string, hoy: string) {
  if (fecha === hoy) return "Hoy";
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-GT", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Quién atiende tickets. No se borran técnicos (los tickets viejos conservan
// quién los atendió): se desactivan y dejan de salir como columna y en "Asignar".
export function EquipoModal({ tecnicos, hoy, onClose }: EquipoModalProps) {
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [ausencia, setAusencia] = useState({ tecnico_id: 0, fecha: hoy, desde: "", cubre_id: 0, nota: "" });

  async function loadAusencias() {
    const { data } = await supabase.from("ausencias").select("*").gte("fecha", hoy).order("fecha");
    setAusencias((data ?? []) as Ausencia[]);
  }

  useEffect(() => {
    loadAusencias();
  }, [hoy]);

  async function marcarAusencia() {
    if (!ausencia.tecnico_id) return alert("Elige quién se ausenta.");
    const { error } = await supabase.from("ausencias").upsert(
      {
        tecnico_id: ausencia.tecnico_id,
        fecha: ausencia.fecha || hoy,
        desde: ausencia.desde || null,
        cubre_id: ausencia.cubre_id || null,
        nota: ausencia.nota.trim() || null,
      },
      { onConflict: "tecnico_id,fecha" }
    );
    if (error) return alert(`No se pudo guardar la ausencia: ${error.message}`);
    setAusencia({ tecnico_id: 0, fecha: hoy, desde: "", cubre_id: 0, nota: "" });
    loadAusencias();
  }

  async function quitarAusencia(id: number) {
    const { error } = await supabase.from("ausencias").delete().eq("id", id);
    if (error) return alert(`No se pudo quitar: ${error.message}`);
    loadAusencias();
  }

  const nombre = (id: number | null) => tecnicos.find((t) => t.id === id)?.nombre ?? "—";

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
            <X size={18} />
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

        <section className="ausencias">
          <h3 className="area-subtitle">Ausencias</h3>
          <p className="doc-hint">
            Las rutinas de quien se ausenta (desde la hora indicada, o todo el día) pasan a quien cubre. Si no eliges a
            nadie, las toma otra persona activa del equipo.
          </p>
          <div className="ausencia-form">
            <select
              value={ausencia.tecnico_id}
              onChange={(e) => setAusencia((a) => ({ ...a, tecnico_id: Number(e.target.value) }))}
            >
              <option value={0}>¿Quién se ausenta?</option>
              {tecnicos
                .filter((t) => t.activo)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
            </select>
            <input
              type="date"
              value={ausencia.fecha}
              min={hoy}
              onChange={(e) => setAusencia((a) => ({ ...a, fecha: e.target.value }))}
            />
            <label className="jornada-salida">
              Desde
              <input
                type="time"
                value={ausencia.desde}
                onChange={(e) => setAusencia((a) => ({ ...a, desde: e.target.value }))}
                title="Vacío = todo el día"
              />
            </label>
            <select
              value={ausencia.cubre_id}
              onChange={(e) => setAusencia((a) => ({ ...a, cubre_id: Number(e.target.value) }))}
            >
              <option value={0}>Cubre: automático</option>
              {tecnicos
                .filter((t) => t.activo && t.id !== ausencia.tecnico_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    Cubre: {t.nombre}
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="Nota (opcional)"
              value={ausencia.nota}
              onChange={(e) => setAusencia((a) => ({ ...a, nota: e.target.value }))}
            />
            <button className="action-button action-button-primary" onClick={marcarAusencia}>
              Marcar ausente
            </button>
          </div>

          {ausencias.length > 0 && (
            <ul className="excepciones-list">
              {ausencias.map((a) => (
                <li key={a.id}>
                  <span className="badge badge-en_progreso">{formatFecha(a.fecha, hoy)}</span>
                  <span className="excepciones-fecha">
                    {nombre(a.tecnico_id)} {a.desde ? `desde las ${a.desde}` : "todo el día"}
                    <small>
                      {[a.cubre_id ? `Cubre ${nombre(a.cubre_id)}` : "Cubre: automático", a.nota].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <button className="modal-close" aria-label="Quitar" onClick={() => quitarAusencia(a.id)}>
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
