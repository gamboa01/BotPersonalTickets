import { useState } from "react";
import { ExcepcionDia, JornadaDia, Rutina, supabase, Tecnico } from "../supabaseClient";
import { DIAS_CORTOS, DIAS_LARGOS, SEMANA, describirDias, describirHora, responsableDelDia } from "../rutinasUtils";
import { CalendarDays, ClipboardList, Repeat, Trash2, X } from "lucide-react";

interface RutinasModalProps {
  rutinas: Rutina[];
  tecnicos: Tecnico[];
  jornada: JornadaDia[];
  excepciones: ExcepcionDia[];
  hoy: string;
  onClose: () => void;
}

interface RutinaDraft {
  nombre: string;
  descripcion: string;
  tecnico_id: number | null;
  rotacion: number[];
  referencia: "fija" | "salida";
  hora: string;
  minutos_salida: number;
  dias: number[];
  activo: boolean;
}

const NUEVA: RutinaDraft = {
  nombre: "",
  descripcion: "",
  tecnico_id: null,
  rotacion: [],
  referencia: "fija",
  hora: "08:00",
  minutos_salida: 0,
  dias: [1, 2, 3, 4, 5],
  activo: true,
};

function formatFecha(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  const texto = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-GT", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function diaDeFecha(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

async function guardar(promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) alert(`No se pudo guardar: ${error.message}`);
  return !error;
}

export function RutinasModal({ rutinas, tecnicos, jornada, excepciones, hoy, onClose }: RutinasModalProps) {
  const [tab, setTab] = useState<"rutinas" | "calendario">("rutinas");
  const [editando, setEditando] = useState<{ id: number | null; draft: RutinaDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excepcion, setExcepcion] = useState({ fecha: "", laboral: false, hora_salida: "", como_dia: 2, nota: "" });

  const tecnicoById = new Map(tecnicos.map((t) => [t.id, t]));
  const ordenadas = [...rutinas].sort(
    (a, b) =>
      Number(a.referencia === "salida") - Number(b.referencia === "salida") ||
      (a.hora ?? "").localeCompare(b.hora ?? "") ||
      a.minutos_salida - b.minutos_salida ||
      a.orden - b.orden
  );
  const proximas = excepciones.filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));

  function editar(r: Rutina) {
    setError(null);
    setRotativoUI((r.rotacion ?? []).length > 0);
    setEditando({
      id: r.id,
      draft: {
        nombre: r.nombre,
        descripcion: r.descripcion ?? "",
        tecnico_id: r.tecnico_id,
        rotacion: r.rotacion ?? [],
        referencia: r.referencia,
        hora: r.hora ?? "08:00",
        minutos_salida: r.minutos_salida,
        dias: r.dias,
        activo: r.activo,
      },
    });
  }

  function setDraft<K extends keyof RutinaDraft>(key: K, value: RutinaDraft[K]) {
    setEditando((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e));
  }

  // "Rotativo" se elige en el mismo selector de responsable; se distingue por tener rotación.
  const [rotativoUI, setRotativoUI] = useState(false);
  const rotativo = rotativoUI || (editando?.draft.rotacion.length ?? 0) > 0;

  async function guardarRutina() {
    if (!editando) return;
    const d = editando.draft;
    if (!d.nombre.trim()) return setError("Ponle un nombre a la rutina.");
    if (!d.dias.length) return setError("Elige al menos un día.");
    if (d.referencia === "fija" && !d.hora) return setError("Indica la hora.");
    if (rotativo && d.rotacion.length < 2) return setError("Elige al menos dos personas para turnarse.");
    const row = {
      nombre: d.nombre.trim(),
      descripcion: d.descripcion.trim() || null,
      tecnico_id: rotativo ? null : d.tecnico_id,
      rotacion: rotativo ? d.rotacion : [],
      referencia: d.referencia,
      hora: d.referencia === "fija" ? d.hora : null,
      minutos_salida: d.referencia === "salida" ? d.minutos_salida : 0,
      dias: [...d.dias].sort(),
      activo: d.activo,
    };
    const ok = await guardar(
      editando.id === null
        ? supabase.from("rutinas").insert({ ...row, orden: rutinas.length + 1 })
        : supabase.from("rutinas").update(row).eq("id", editando.id)
    );
    if (ok) setEditando(null);
  }

  async function eliminarRutina() {
    if (!editando || editando.id === null) return;
    if (!confirm("¿Eliminar esta rutina y su historial? Si solo quieres dejar de verla, desactívala.")) return;
    if (await guardar(supabase.from("rutinas").delete().eq("id", editando.id))) setEditando(null);
  }

  async function agregarExcepcion() {
    if (!excepcion.fecha) return alert("Elige la fecha.");
    await guardar(
      supabase.from("calendario_excepciones").upsert(
        {
          fecha: excepcion.fecha,
          laboral: excepcion.laboral,
          hora_salida: excepcion.laboral && excepcion.hora_salida ? excepcion.hora_salida : null,
          como_dia: excepcion.laboral ? excepcion.como_dia : null,
          nota: excepcion.nota.trim() || null,
        },
        { onConflict: "fecha" }
      )
    );
    setExcepcion((e) => ({ ...e, fecha: "", nota: "", hora_salida: "" }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal doc-modal rutinas-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rutinas</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="segmented rutinas-tabs">
          <button className={tab === "rutinas" ? "active" : ""} onClick={() => setTab("rutinas")}>
            <ClipboardList size={15} /> Rutinas
          </button>
          <button className={tab === "calendario" ? "active" : ""} onClick={() => setTab("calendario")}>
            <CalendarDays size={15} /> Calendario
          </button>
        </div>

        {tab === "rutinas" && editando && (
          <div className="rutina-form">
            <div className="doc-field">
              <label htmlFor="rutNombre">Nombre</label>
              <input
                id="rutNombre"
                type="text"
                value={editando.draft.nombre}
                onChange={(e) => setDraft("nombre", e.target.value)}
                autoFocus
              />
            </div>
            <div className="doc-field">
              <label htmlFor="rutDesc">Qué hay que hacer (opcional)</label>
              <input
                id="rutDesc"
                type="text"
                value={editando.draft.descripcion}
                onChange={(e) => setDraft("descripcion", e.target.value)}
              />
            </div>
            <div className="doc-field">
              <label htmlFor="rutTec">Responsable</label>
              <select
                id="rutTec"
                value={rotativo ? "rotativo" : editando.draft.tecnico_id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "rotativo") {
                    setRotativoUI(true);
                    setDraft("rotacion", tecnicos.filter((t) => t.activo).map((t) => t.id));
                  } else {
                    setRotativoUI(false);
                    setDraft("rotacion", []);
                    setDraft("tecnico_id", v ? Number(v) : null);
                  }
                }}
              >
                <option value="">Cualquiera</option>
                <option value="rotativo">Rotativo (se turnan cada día)</option>
                {tecnicos
                  .filter((t) => t.activo || t.id === editando.draft.tecnico_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
              </select>
              {rotativo && (
                <div className="rotacion-picker">
                  {tecnicos
                    .filter((t) => t.activo || editando.draft.rotacion.includes(t.id))
                    .map((t) => {
                      const dentro = editando.draft.rotacion.includes(t.id);
                      return (
                        <label key={t.id} className="equipo-activo">
                          <input
                            type="checkbox"
                            checked={dentro}
                            onChange={() =>
                              setDraft(
                                "rotacion",
                                dentro
                                  ? editando.draft.rotacion.filter((x) => x !== t.id)
                                  : [...editando.draft.rotacion, t.id].sort((a, b) => a - b)
                              )
                            }
                          />
                          {t.nombre}
                        </label>
                      );
                    })}
                </div>
              )}
              {rotativo && editando.draft.rotacion.length >= 2 && (
                <span className="doc-hint">
                  Hoy le toca a{" "}
                  <b>
                    {tecnicoById.get(
                      responsableDelDia({ rotacion: editando.draft.rotacion, tecnico_id: null } as Rutina, hoy) ?? -1
                    )?.nombre ?? "—"}
                  </b>
                  ; mañana al siguiente, y así.
                </span>
              )}
            </div>

            <div className="doc-field">
              <label>Hora</label>
              <div className="rutina-hora">
                <label className="rutina-radio">
                  <input
                    type="radio"
                    checked={editando.draft.referencia === "fija"}
                    onChange={() => setDraft("referencia", "fija")}
                  />
                  Hora fija
                  <input
                    type="time"
                    value={editando.draft.hora}
                    disabled={editando.draft.referencia !== "fija"}
                    onChange={(e) => setDraft("hora", e.target.value)}
                  />
                </label>
                <label className="rutina-radio">
                  <input
                    type="radio"
                    checked={editando.draft.referencia === "salida"}
                    onChange={() => setDraft("referencia", "salida")}
                  />
                  Según la hora de salida
                  <input
                    type="number"
                    step={5}
                    value={editando.draft.minutos_salida}
                    disabled={editando.draft.referencia !== "salida"}
                    onChange={(e) => setDraft("minutos_salida", Number(e.target.value))}
                  />
                  min
                </label>
              </div>
              <span className="doc-hint">
                Con “según la salida”, 0 es justo a la hora de salida, −15 es 15 minutos antes. Se ajusta sola si un día
                se sale a otra hora.
              </span>
            </div>

            <div className="doc-field">
              <label>Días</label>
              <div className="dias-picker">
                {SEMANA.map((d) => {
                  const activo = editando.draft.dias.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={activo ? "active" : ""}
                      title={DIAS_LARGOS[d]}
                      onClick={() =>
                        setDraft("dias", activo ? editando.draft.dias.filter((x) => x !== d) : [...editando.draft.dias, d])
                      }
                    >
                      {DIAS_CORTOS[d]}
                    </button>
                  );
                })}
              </div>
              <span className="doc-hint">
                En días de descanso no aparece ninguna rutina, aunque el día esté marcado aquí.
              </span>
            </div>

            <label className="equipo-activo">
              <input
                type="checkbox"
                checked={editando.draft.activo}
                onChange={(e) => setDraft("activo", e.target.checked)}
              />
              Activa
            </label>

            {error && <p className="doc-field-error">{error}</p>}

            <div className="doc-modal-footer">
              {editando.id !== null ? (
                <button className="action-button doc-danger" onClick={eliminarRutina}>
                  <Trash2 size={15} /> Eliminar
                </button>
              ) : (
                <span />
              )}
              <div className="doc-modal-footer-right">
                <button className="action-button" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button className="action-button action-button-primary" onClick={guardarRutina}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "rutinas" && !editando && (
          <>
            <ul className="rutinas-admin">
              {ordenadas.map((r) => {
                const tecnico = r.tecnico_id ? tecnicoById.get(r.tecnico_id) : undefined;
                const turno = (r.rotacion ?? []).map((id) => tecnicoById.get(id)?.nombre ?? "?");
                return (
                  <li key={r.id} className={r.activo ? "" : "inactiva"} onClick={() => editar(r)}>
                    <span className="rutinas-admin-hora">{describirHora(r)}</span>
                    <span className="rutinas-admin-nombre">
                      {r.nombre}
                      <small>{describirDias(r.dias)}</small>
                    </span>
                    <span className="rutinas-admin-tec" style={{ color: turno.length ? undefined : tecnico?.color ?? undefined }}>
                      {turno.length ? <><Repeat size={12} className="inline-icon" /> {turno.join(" / ")}</> : tecnico?.nombre ?? "Cualquiera"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              className="action-button action-button-primary"
              onClick={() => {
                setError(null);
                setRotativoUI(false);
                setEditando({ id: null, draft: NUEVA });
              }}
            >
              + Nueva rutina
            </button>
          </>
        )}

        {tab === "calendario" && (
          <>
            <h3 className="area-subtitle">Horario base</h3>
            <table className="jornada-table">
              <tbody>
                {SEMANA.map((d) => {
                  const j = jornada.find((x) => x.dia === d);
                  return (
                    <tr key={d}>
                      <td>{DIAS_LARGOS[d]}</td>
                      <td>
                        <label className="equipo-activo">
                          <input
                            type="checkbox"
                            checked={j?.laboral ?? false}
                            onChange={(e) =>
                              guardar(
                                supabase
                                  .from("jornada_semana")
                                  .upsert({ dia: d, laboral: e.target.checked, hora_salida: j?.hora_salida ?? "17:00" })
                              )
                            }
                          />
                          Se trabaja
                        </label>
                      </td>
                      <td>
                        <label className="jornada-salida">
                          Salida
                          <input
                            type="time"
                            value={j?.hora_salida ?? ""}
                            disabled={!j?.laboral}
                            onChange={(e) =>
                              e.target.value &&
                              guardar(
                                supabase
                                  .from("jornada_semana")
                                  .upsert({ dia: d, laboral: true, hora_salida: e.target.value })
                              )
                            }
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 className="area-subtitle">Días especiales</h3>
            <div className="excepcion-form">
              <input
                type="date"
                value={excepcion.fecha}
                min={hoy}
                onChange={(e) => {
                  const fecha = e.target.value;
                  const dow = fecha ? diaDeFecha(fecha) : 2;
                  const baseLaboral = jornada.find((j) => j.dia === dow)?.laboral ?? false;
                  // Lo normal es marcar lo contrario del horario base: descanso en día laboral, reposición en día libre.
                  setExcepcion((x) => ({ ...x, fecha, laboral: !baseLaboral, como_dia: baseLaboral ? dow : 2 }));
                }}
              />
              <select
                value={excepcion.laboral ? "si" : "no"}
                onChange={(e) => setExcepcion((x) => ({ ...x, laboral: e.target.value === "si" }))}
              >
                <option value="no">Descanso</option>
                <option value="si">Se trabaja</option>
              </select>
              {excepcion.laboral && (
                <>
                  <label className="jornada-salida">
                    Salida
                    <input
                      type="time"
                      value={excepcion.hora_salida}
                      onChange={(e) => setExcepcion((x) => ({ ...x, hora_salida: e.target.value }))}
                    />
                  </label>
                  <label className="jornada-salida">
                    Rutinas de un
                    <select
                      value={excepcion.como_dia}
                      onChange={(e) => setExcepcion((x) => ({ ...x, como_dia: Number(e.target.value) }))}
                    >
                      {SEMANA.map((d) => (
                        <option key={d} value={d}>
                          {DIAS_LARGOS[d].toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <input
                type="text"
                placeholder="Nota (ej. Reposición, Feriado)"
                value={excepcion.nota}
                onChange={(e) => setExcepcion((x) => ({ ...x, nota: e.target.value }))}
              />
              <button className="action-button action-button-primary" onClick={agregarExcepcion}>
                + Agregar
              </button>
            </div>
            <span className="doc-hint">
              Si no pones hora de salida en un día que se trabaja, se usa la del día elegido en “Rutinas de un”.
            </span>

            {proximas.length === 0 ? (
              <p className="empty-state">No hay días especiales próximos.</p>
            ) : (
              <ul className="excepciones-list">
                {proximas.map((e) => (
                  <li key={e.fecha}>
                    <span className={`badge ${e.laboral ? "badge-resuelto" : "badge-cerrado"}`}>
                      {e.laboral ? "Se trabaja" : "Descanso"}
                    </span>
                    <span className="excepciones-fecha">
                      {formatFecha(e.fecha)}
                      <small>
                        {[
                          e.laboral && e.hora_salida && `salida ${e.hora_salida}`,
                          e.laboral && e.como_dia !== null && `rutinas de ${DIAS_LARGOS[e.como_dia].toLowerCase()}`,
                          e.nota,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <button
                      className="modal-close"
                      aria-label="Quitar"
                      onClick={() => guardar(supabase.from("calendario_excepciones").delete().eq("fecha", e.fecha))}
                    >
                      <X size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
