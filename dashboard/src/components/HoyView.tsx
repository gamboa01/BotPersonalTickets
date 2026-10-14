import { useEffect, useMemo, useRef, useState } from "react";
import { Area, Rutina, RutinaRegistro, supabase, Tecnico, Ticket } from "../supabaseClient";
import { NIVEL_LABEL, ladoArea } from "../planUtils";
import { formatGtTime, GT_TIMEZONE, gtDayKey, gtWeekday, timeAgo } from "../timezone";
import { EquipoModal } from "./EquipoModal";

interface HoyViewProps {
  tickets: Ticket[];
  tecnicos: Tecnico[];
  // Modo pantalla (TV de TI): solo lectura, letra grande, sin controles de asignación.
  kiosk: boolean;
  onOpenTicket: (ticket: Ticket) => void;
}

const PRIORIDAD_ORDEN: Record<Ticket["prioridad"], number> = { critica: 0, alta: 1, media: 2, baja: 3 };
const PRIORIDAD_LABEL: Record<Ticket["prioridad"], string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const SIN_ASIGNAR_COLOR = "#fb7185";
const NUEVO_MS = 90_000;
const SOUND_KEY = "hoy-sonido";

function isActive(t: Ticket) {
  return t.estado === "abierto" || t.estado === "en_progreso";
}

function byPriorityThenAge(a: Ticket, b: Ticket) {
  return PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad] || a.created_at.localeCompare(b.created_at);
}

// Dos tonos cortos con WebAudio: avisa en la pantalla cuando entra un ticket.
// El navegador solo deja sonar después de que alguien hizo clic en la página.
function beep() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch {
    // Sin audio disponible: la tarjeta igual parpadea.
  }
}

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function HoyView({ tickets, tecnicos, kiosk, onOpenTicket }: HoyViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const [areas, setAreas] = useState<Area[]>([]);
  const [rutinas, setRutinas] = useState<Rutina[]>([]);
  const [registros, setRegistros] = useState<RutinaRegistro[]>([]);
  const [recientes, setRecientes] = useState<Map<number, number>>(new Map());
  const [sonido, setSonido] = useState(readSoundPref);
  const [showEquipo, setShowEquipo] = useState(false);
  const [asignando, setAsignando] = useState<number | null>(null);
  const knownIds = useRef<Set<number> | null>(null);

  const hoy = gtDayKey(new Date(now).toISOString());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadAreas() {
      const { data } = await supabase.from("areas").select("*");
      setAreas((data ?? []) as Area[]);
    }
    async function loadRutinas() {
      const { data } = await supabase.from("rutinas").select("*").eq("activo", true).order("orden");
      setRutinas((data ?? []) as Rutina[]);
    }
    loadAreas();
    loadRutinas();

    const channel = supabase
      .channel("hoy-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "areas" }, loadAreas)
      .on("postgres_changes", { event: "*", schema: "public", table: "rutinas" }, loadRutinas)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Los registros dependen del día: al pasar la medianoche se recargan solos.
  useEffect(() => {
    async function loadRegistros() {
      const { data } = await supabase.from("rutina_registros").select("*").eq("fecha", hoy);
      setRegistros((data ?? []) as RutinaRegistro[]);
    }
    loadRegistros();
    const channel = supabase
      .channel(`registros-${hoy}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rutina_registros" }, loadRegistros)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hoy]);

  // Detecta tickets que llegan por realtime (no los que ya estaban al abrir la pantalla).
  useEffect(() => {
    if (knownIds.current === null) {
      knownIds.current = new Set(tickets.map((t) => t.id));
      return;
    }
    const nuevos = tickets.filter((t) => !knownIds.current!.has(t.id));
    if (!nuevos.length) return;
    nuevos.forEach((t) => knownIds.current!.add(t.id));
    setRecientes((prev) => {
      const next = new Map(prev);
      nuevos.forEach((t) => next.set(t.id, Date.now()));
      return next;
    });
    if (sonido) beep();
  }, [tickets, sonido]);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  const activos = useMemo(() => tickets.filter(isActive).sort(byPriorityThenAge), [tickets]);
  const resueltosHoy = useMemo(
    () =>
      tickets
        .filter((t) => !isActive(t) && t.resolved_at && gtDayKey(t.resolved_at) === hoy)
        .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "")),
    [tickets, hoy]
  );
  const entraronHoy = tickets.filter((t) => gtDayKey(t.created_at) === hoy).length;

  // Columnas: sin asignar, una por técnico activo (o con tickets aún asignados) y resueltos hoy.
  const columnas = useMemo(() => {
    const visibles = tecnicos.filter((tec) => tec.activo || activos.some((t) => t.asignado_id === tec.id));
    return [
      {
        key: "sin",
        titulo: "Sin asignar",
        color: SIN_ASIGNAR_COLOR,
        tickets: activos.filter((t) => !t.asignado_id || !visibles.some((tec) => tec.id === t.asignado_id)),
      },
      ...visibles.map((tec) => ({
        key: `tec-${tec.id}`,
        titulo: tec.nombre,
        color: tec.color || "#22d3ee",
        tickets: activos.filter((t) => t.asignado_id === tec.id),
      })),
    ];
  }, [tecnicos, activos]);

  const rutinasHoy = useMemo(() => {
    const dow = gtWeekday(new Date(now));
    return rutinas
      .filter((r) => r.dias.includes(dow))
      .sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.orden - b.orden);
  }, [rutinas, now]);
  const registroByRutina = new Map(registros.map((r) => [r.rutina_id, r]));
  const tecnicoById = new Map(tecnicos.map((t) => [t.id, t]));

  async function asignar(ticket: Ticket, tecnicoId: number | null) {
    setAsignando(ticket.id);
    const { error } = await supabase.rpc("asignar_ticket", { p_ticket_id: ticket.id, p_tecnico_id: tecnicoId });
    setAsignando(null);
    if (error) alert(`No se pudo asignar el ticket: ${error.message}`);
  }

  async function toggleRutina(rutina: Rutina) {
    if (kiosk) return;
    const registro = registroByRutina.get(rutina.id);
    const { error } = registro
      ? await supabase.from("rutina_registros").delete().eq("id", registro.id)
      : await supabase.from("rutina_registros").insert({ rutina_id: rutina.id, fecha: hoy, tecnico_id: rutina.tecnico_id });
    if (error) alert(`No se pudo actualizar la rutina: ${error.message}`);
  }

  function toggleSonido() {
    const next = !sonido;
    setSonido(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      // Sin almacenamiento: la preferencia dura solo esta sesión.
    }
    if (next) beep();
  }

  function pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  const fechaLarga = new Date(now).toLocaleDateString("es-GT", {
    timeZone: GT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const fecha = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);
  const hora = new Date(now).toLocaleTimeString("es-GT", { timeZone: GT_TIMEZONE, hour: "2-digit", minute: "2-digit" });

  function renderCard(t: Ticket) {
    const area = t.area_id ? areaById.get(t.area_id) : undefined;
    const llegada = recientes.get(t.id);
    const esNuevo = llegada !== undefined && now - llegada < NUEVO_MS;
    return (
      <article
        key={t.id}
        className={`hoy-card hoy-prio-${t.prioridad}${esNuevo ? " hoy-card-new" : ""}`}
        onClick={() => !kiosk && onOpenTicket(t)}
      >
        <div className="hoy-card-top">
          <span className="hoy-card-id">#{t.id}</span>
          <span className={`badge badge-${t.prioridad}`}>{PRIORIDAD_LABEL[t.prioridad]}</span>
          {t.estado === "en_progreso" && <span className="badge badge-en_progreso">En progreso</span>}
          <span className="hoy-card-age">{timeAgo(t.created_at, now)}</span>
        </div>
        <div className="hoy-card-area">
          📍 {area ? area.nombre : t.areas?.nombre ?? "Área no indicada"}
          {area && (
            <span className="hoy-card-where">
              {NIVEL_LABEL[area.nivel]} · {ladoArea(area)}
            </span>
          )}
        </div>
        <p className="hoy-card-desc">{t.descripcion}</p>
        <div className="hoy-card-foot">
          <span>{t.categorias?.nombre ?? "Sin categoría"}</span>
          <span>· {t.reportado_por_nombre ?? "—"}</span>
        </div>
        {!kiosk && (
          <select
            className="hoy-assign"
            value={t.asignado_id ?? ""}
            disabled={asignando === t.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => asignar(t, e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin asignar</option>
            {tecnicos
              .filter((tec) => tec.activo || tec.id === t.asignado_id)
              .map((tec) => (
                <option key={tec.id} value={tec.id}>
                  Atiende: {tec.nombre}
                </option>
              ))}
          </select>
        )}
      </article>
    );
  }

  return (
    <div className={`hoy${kiosk ? " hoy-kiosk" : ""}`}>
      <header className="hoy-header">
        <div>
          <h2 className="hoy-title">Atenciones de hoy</h2>
          <p className="hoy-date">{fecha}</p>
        </div>
        <div className="hoy-stats">
          <div>
            <b>{entraronHoy}</b>
            <span>Entraron hoy</span>
          </div>
          <div>
            <b>{activos.length}</b>
            <span>Pendientes</span>
          </div>
          <div>
            <b>{resueltosHoy.length}</b>
            <span>Resueltos hoy</span>
          </div>
        </div>
        <div className="hoy-clock">{hora}</div>
        <div className="hoy-actions">
          <button className="action-button" onClick={toggleSonido} title="Sonido al entrar un ticket">
            {sonido ? "🔔" : "🔕"}
          </button>
          {kiosk ? (
            <button className="action-button" onClick={pantallaCompleta}>
              ⛶ Pantalla completa
            </button>
          ) : (
            <>
              <button className="action-button" onClick={() => setShowEquipo(true)}>
                👥 Equipo
              </button>
              <a className="action-button" href="#pantalla" target="_blank" rel="noreferrer">
                📺 Abrir en pantalla
              </a>
            </>
          )}
        </div>
      </header>

      <div className="hoy-board" style={{ gridTemplateColumns: `repeat(${columnas.length + 1}, minmax(240px, 1fr))` }}>
        {columnas.map((col) => (
          <section key={col.key} className="hoy-col">
            <h3 className="hoy-col-title" style={{ borderColor: col.color, color: col.color }}>
              {col.titulo}
              <span className="hoy-col-count">{col.tickets.length}</span>
            </h3>
            <div className="hoy-col-body">
              {col.tickets.length === 0 ? (
                <p className="hoy-empty">{col.key === "sin" ? "Nada por asignar 🎉" : "Sin pendientes"}</p>
              ) : (
                col.tickets.map(renderCard)
              )}
            </div>
          </section>
        ))}

        <section className="hoy-col">
          <h3 className="hoy-col-title" style={{ borderColor: "#4ade80", color: "#4ade80" }}>
            Resueltos hoy
            <span className="hoy-col-count">{resueltosHoy.length}</span>
          </h3>
          <div className="hoy-col-body">
            {resueltosHoy.length === 0 ? (
              <p className="hoy-empty">Todavía nada resuelto hoy</p>
            ) : (
              resueltosHoy.map((t) => (
                <article key={t.id} className="hoy-done" onClick={() => !kiosk && onOpenTicket(t)}>
                  <span className="hoy-card-id">#{t.id}</span>
                  <span className="hoy-done-area">{t.areas?.nombre ?? "Sin área"}</span>
                  <span className="hoy-done-meta">
                    {t.tecnicos?.nombre ?? "Sin asignar"} · {formatGtTime(t.resolved_at!)}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="hoy-rutinas">
        <h3>Rutinas de hoy</h3>
        {rutinasHoy.length === 0 ? (
          <p className="hoy-empty">Sin rutinas configuradas todavía.</p>
        ) : (
          <div className="hoy-rutinas-list">
            {rutinasHoy.map((r) => {
              const registro = registroByRutina.get(r.id);
              const tecnico = r.tecnico_id ? tecnicoById.get(r.tecnico_id) : undefined;
              return (
                <button
                  key={r.id}
                  className={`hoy-rutina${registro ? " done" : ""}`}
                  onClick={() => toggleRutina(r)}
                  disabled={kiosk}
                  title={r.descripcion ?? undefined}
                >
                  <span className="hoy-rutina-check">{registro ? "✅" : "⬜"}</span>
                  {r.hora && <span className="hoy-rutina-hora">{r.hora}</span>}
                  <span className="hoy-rutina-nombre">{r.nombre}</span>
                  {tecnico && (
                    <span className="hoy-rutina-tec" style={{ color: tecnico.color || undefined }}>
                      {tecnico.nombre}
                    </span>
                  )}
                  {registro && <span className="hoy-rutina-hora">{formatGtTime(registro.completada_at)}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {showEquipo && <EquipoModal tecnicos={tecnicos} onClose={() => setShowEquipo(false)} />}
    </div>
  );
}
