import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Plus, RotateCcw, X } from "lucide-react";
import { Pendiente, supabase, Tecnico } from "../supabaseClient";
import { gtDayKey, timeAgo } from "../timezone";

interface PendientesColumnaProps {
  tecnicos: Tecnico[];
  hoy: string;
  now: number;
  kiosk?: boolean;
}

const COLOR = "#fbbf24";

// Pizarra de pendientes del departamento (no son tickets). Columna de Hoy,
// visible también en #pantalla (solo lectura). Los hechos hoy quedan tachados
// abajo hasta que cambia el día.
export function PendientesColumna({ tecnicos, hoy, now, kiosk }: PendientesColumnaProps) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [texto, setTexto] = useState("");
  const [tecnicoId, setTecnicoId] = useState(0);

  async function load() {
    const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data } = await supabase
      .from("pendientes")
      .select("*")
      .or(`hecho_at.is.null,hecho_at.gte.${desde}`)
      .order("creado_at");
    setPendientes((data ?? []) as Pendiente[]);
  }

  useEffect(() => {
    load();
    const refresco = setInterval(load, 60_000);
    const channel = supabase
      .channel("pendientes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pendientes" }, load)
      .subscribe();
    return () => {
      clearInterval(refresco);
      supabase.removeChannel(channel);
    };
  }, []);

  const tecnicoById = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos]);
  const abiertos = pendientes.filter((p) => !p.hecho_at);
  const hechosHoy = pendientes.filter((p) => p.hecho_at && gtDayKey(p.hecho_at) === hoy);

  async function agregar() {
    const limpio = texto.trim();
    if (!limpio) return;
    const { error } = await supabase.from("pendientes").insert({ texto: limpio, tecnico_id: tecnicoId || null });
    if (error) return alert(`No se pudo agregar: ${error.message}`);
    setTexto("");
    load();
  }

  async function marcar(p: Pendiente, hecho: boolean) {
    const { error } = await supabase
      .from("pendientes")
      .update({ hecho_at: hecho ? new Date().toISOString() : null })
      .eq("id", p.id);
    if (error) alert(`No se pudo actualizar: ${error.message}`);
    else load();
  }

  async function quitar(p: Pendiente) {
    if (!confirm(`¿Quitar "${p.texto}" de la pizarra? (si ya se hizo, mejor márcalo como hecho)`)) return;
    const { error } = await supabase.from("pendientes").delete().eq("id", p.id);
    if (error) alert(`No se pudo quitar: ${error.message}`);
    else load();
  }

  function renderPendiente(p: Pendiente) {
    const tecnico = p.tecnico_id ? tecnicoById.get(p.tecnico_id) : undefined;
    const hecho = !!p.hecho_at;
    return (
      <article key={p.id} className={hecho ? "pendiente hecho" : "pendiente"}>
        {kiosk ? (
          <span className="pendiente-check" aria-hidden>
            {hecho && <Check size={14} />}
          </span>
        ) : (
          <button
            className="pendiente-check"
            onClick={() => marcar(p, !hecho)}
            title={hecho ? "Volver a pendiente" : "Marcar como hecho"}
            aria-label={hecho ? "Volver a pendiente" : "Marcar como hecho"}
          >
            {hecho ? <RotateCcw size={13} /> : null}
          </button>
        )}
        <span className="pendiente-texto">{p.texto}</span>
        {!kiosk && !hecho && (
          <button className="pendiente-quitar" onClick={() => quitar(p)} aria-label="Quitar">
            <X size={14} />
          </button>
        )}
        <span className="pendiente-meta">
          {tecnico && (
            <>
              <i style={{ background: tecnico.color || "#22d3ee" }} />
              {tecnico.nombre} ·{" "}
            </>
          )}
          {hecho ? "Hecho" : timeAgo(p.creado_at, now)}
        </span>
      </article>
    );
  }

  return (
    <section className="hoy-col">
      <h3 className="hoy-col-title" style={{ borderColor: COLOR, color: COLOR }}>
        <span className="hoy-col-titulo-icono">
          <ClipboardList size={16} /> Pendientes
        </span>
        <span className="hoy-col-count">{abiertos.length}</span>
      </h3>
      <div className="hoy-col-body">
        {!kiosk && (
          <div className="pendiente-nuevo">
            <input
              type="text"
              value={texto}
              placeholder="Agregar pendiente…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
            />
            <select value={tecnicoId} onChange={(e) => setTecnicoId(Number(e.target.value))} title="Responsable">
              <option value={0}>Equipo</option>
              {tecnicos
                .filter((t) => t.activo)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
            </select>
            <button className="action-button action-button-primary" onClick={agregar} disabled={!texto.trim()} aria-label="Agregar">
              <Plus size={15} />
            </button>
          </div>
        )}
        {abiertos.length === 0 && hechosHoy.length === 0 ? (
          <p className="hoy-empty">Pizarra limpia</p>
        ) : (
          abiertos.map(renderPendiente)
        )}
        {hechosHoy.length > 0 && (
          <>
            <h4 className="hoy-col-sub">Hechos hoy</h4>
            {hechosHoy.map(renderPendiente)}
          </>
        )}
      </div>
    </section>
  );
}
