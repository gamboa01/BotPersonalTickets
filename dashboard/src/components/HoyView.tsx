import { useEffect, useMemo, useRef, useState } from "react";
import { Area, Ausencia, ExcepcionDia, JornadaDia, Rutina, RutinaRegistro, supabase, Tecnico, Ticket } from "../supabaseClient";
import { NIVEL_LABEL, ladoArea } from "../planUtils";
import { formatGtTime, GT_TIMEZONE, gtDayKey, gtWeekday, timeAgo } from "../timezone";
import { EquipoModal } from "./EquipoModal";
import { RutinasModal } from "./RutinasModal";
import { RegistrarAtencionModal } from "./RegistrarAtencionModal";
import { MARGEN_AUTO_MIN, ausenteA, cubrirAusencia, diaInfo, rutinasDelDia, sumarMinutos } from "../rutinasUtils";

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

// "lun 12": para los pendientes que vienen de días anteriores.
function diaCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-GT", { timeZone: GT_TIMEZONE, weekday: "short", day: "numeric" });
}

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
  const [jornada, setJornada] = useState<JornadaDia[]>([]);
  const [excepciones, setExcepciones] = useState<ExcepcionDia[]>([]);
  const [showRutinas, setShowRutinas] = useState(false);
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [recientes, setRecientes] = useState<Map<number, number>>(new Map());
  const [sonido, setSonido] = useState(readSoundPref);
  const [showEquipo, setShowEquipo] = useState(false);
  const [asignando, setAsignando] = useState<number | null>(null);
  const knownIds = useRef<Set<number> | null>(null);
  const [registrosListos, setRegistrosListos] = useState<string | null>(null);
  const autoIntentadas = useRef<Set<string>>(new Set());

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
      const { data } = await supabase.from("rutinas").select("*").order("orden");
      setRutinas((data ?? []) as Rutina[]);
    }
    async function loadCalendario() {
      const [{ data: j }, { data: e }] = await Promise.all([
        supabase.from("jornada_semana").select("*"),
        supabase.from("calendario_excepciones").select("*"),
      ]);
      setJornada((j ?? []) as JornadaDia[]);
      setExcepciones((e ?? []) as ExcepcionDia[]);
    }
    loadAreas();
    loadRutinas();
    loadCalendario();

    const channel = supabase
      .channel("hoy-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "areas" }, loadAreas)
      .on("postgres_changes", { event: "*", schema: "public", table: "rutinas" }, loadRutinas)
      .on("postgres_changes", { event: "*", schema: "public", table: "jornada_semana" }, loadCalendario)
      .on("postgres_changes", { event: "*", schema: "public", table: "calendario_excepciones" }, loadCalendario)
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
      setRegistrosListos(hoy);
    }
    async function loadAusencias() {
      const { data } = await supabase.from("ausencias").select("*").eq("fecha", hoy);
      setAusencias((data ?? []) as Ausencia[]);
    }
    loadRegistros();
    loadAusencias();
    const channel = supabase
      .channel(`registros-${hoy}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rutina_registros" }, loadRegistros)
      .on("postgres_changes", { event: "*", schema: "public", table: "ausencias" }, loadAusencias)
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

  const ausenciaByTecnico = useMemo(() => new Map(ausencias.map((a) => [a.tecnico_id, a])), [ausencias]);

  // Columnas: sin asignar, una por técnico activo (o con tickets aún asignados) y resueltos hoy.
  const columnas = useMemo(() => {
    const visibles = tecnicos.filter((tec) => tec.activo || activos.some((t) => t.asignado_id === tec.id));
    return [
      {
        key: "sin",
        titulo: "Sin asignar",
        color: SIN_ASIGNAR_COLOR,
        ausente: undefined as Ausencia | undefined,
        tickets: activos.filter((t) => !t.asignado_id || !visibles.some((tec) => tec.id === t.asignado_id)),
      },
      ...visibles.map((tec) => ({
        key: `tec-${tec.id}`,
        titulo: tec.nombre,
        color: tec.color || "#22d3ee",
        tickets: activos.filter((t) => t.asignado_id === tec.id),
        ausente: ausenciaByTecnico.get(tec.id),
      })),
    ];
  }, [tecnicos, activos, ausenciaByTecnico]);

  // Descanso, reposición u hora de salida distinta: lo decide el calendario.
  const infoHoy = useMemo(
    () => diaInfo(hoy, gtWeekday(new Date(now)), jornada, excepciones),
    [hoy, now, jornada, excepciones]
  );
  // Si el responsable del día falta a esa hora, la rutina pasa a quien lo cubre.
  const rutinasHoy = useMemo(
    () =>
      rutinasDelDia(rutinas, infoHoy).map((item) => ({
        ...item,
        ...cubrirAusencia(item.responsable, item.hora, ausencias, tecnicos),
      })),
    [rutinas, infoHoy, ausencias, tecnicos]
  );
  const registroByRutina = useMemo(() => new Map(registros.map((r) => [r.rutina_id, r])), [registros]);
  const rutinaById = new Map(rutinas.map((r) => [r.id, r]));

  // "Hecho hoy": tickets resueltos y rutinas completadas en una sola línea de
  // tiempo, para que el trabajo del día se vea aunque no hayan entrado tickets.
  const hechoHoy = [
    ...resueltosHoy.map((t) => ({ tipo: "ticket" as const, at: t.resolved_at!, ticket: t })),
    ...registros
      .filter((reg) => !reg.omitida)
      .map((reg) => ({ tipo: "rutina" as const, at: reg.completada_at, registro: reg })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const tecnicoById = new Map(tecnicos.map((t) => [t.id, t]));

  async function asignar(ticket: Ticket, tecnicoId: number | null) {
    setAsignando(ticket.id);
    const { error } = await supabase.rpc("asignar_ticket", { p_ticket_id: ticket.id, p_tecnico_id: tecnicoId });
    setAsignando(null);
    if (error) alert(`No se pudo asignar el ticket: ${error.message}`);
  }

  // Clic: pendiente → hecha → no se hizo → hecha… Una "no se hizo" vuelve a
  // pendiente solo si todavía no pasó su hora + margen (si no, se remarcaría sola).
  async function toggleRutina(rutina: Rutina, responsable: number | null, hora: string | null) {
    if (kiosk) return;
    const registro = registroByRutina.get(rutina.id);
    const vencida = !!hora && sumarMinutos(hora, MARGEN_AUTO_MIN) <= hhmm;
    const { error } = !registro
      ? await supabase.from("rutina_registros").insert({ rutina_id: rutina.id, fecha: hoy, tecnico_id: responsable })
      : !registro.omitida
        ? await supabase.from("rutina_registros").update({ omitida: true }).eq("id", registro.id)
        : vencida
          ? await supabase
              .from("rutina_registros")
              .update({ omitida: false, automatica: false, completada_at: new Date().toISOString() })
              .eq("id", registro.id)
          : await supabase.from("rutina_registros").delete().eq("id", registro.id);
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
  // HH:MM de 24 h, para comparar con la hora de cada rutina y marcar las atrasadas.
  const hhmm = new Date(now).toLocaleTimeString("en-GB", { timeZone: GT_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  const nota = infoHoy.excepcion?.nota;

  // Rutinas que pasaron su hora + margen sin marcarse: se dan por hechas por su
  // responsable del día (con rotación y ausencias aplicadas), como "auto". Lo
  // hace cualquier dashboard abierto (normalmente la pantalla de TI); la
  // restricción única (rutina_id, fecha) evita duplicados entre pantallas.
  useEffect(() => {
    if (registrosListos !== hoy) return;
    const pendientes = rutinasHoy.filter(
      ({ rutina, hora }) =>
        hora &&
        !registroByRutina.has(rutina.id) &&
        sumarMinutos(hora, MARGEN_AUTO_MIN) <= hhmm &&
        !autoIntentadas.current.has(`${hoy}-${rutina.id}`)
    );
    if (!pendientes.length) return;
    pendientes.forEach(({ rutina }) => autoIntentadas.current.add(`${hoy}-${rutina.id}`));
    supabase
      .from("rutina_registros")
      .upsert(
        pendientes.map(({ rutina, hora, responsable }) => ({
          rutina_id: rutina.id,
          fecha: hoy,
          tecnico_id: responsable,
          automatica: true,
          completada_at: new Date(`${hoy}T${hora}:00-06:00`).toISOString(),
        })),
        { onConflict: "rutina_id,fecha", ignoreDuplicates: true }
      )
      .then(({ error }) => {
        if (error) console.error("No se pudieron marcar rutinas automáticas:", error.message);
      });
  }, [registrosListos, hoy, hhmm, rutinasHoy, registroByRutina]);
  const jornadaTexto = infoHoy.laboral
    ? [infoHoy.salida && `Salida ${infoHoy.salida}`, nota].filter(Boolean).join(" · ")
    : `Descanso${nota && nota !== "Descanso" ? ` · ${nota}` : ""}`;

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
          {gtDayKey(t.created_at) !== hoy && (
            <span className="hoy-card-arrastre" title="Pendiente de un día anterior">
              Desde {diaCorto(t.created_at)}
            </span>
          )}
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
          <p className="hoy-date">
            {fecha}
            {jornadaTexto && (
              <span className={`hoy-jornada${infoHoy.laboral ? "" : " descanso"}`}>{jornadaTexto}</span>
            )}
          </p>
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
              <button className="action-button action-button-primary" onClick={() => setShowRegistrar(true)}>
                + Registrar atención
              </button>
              <button className="action-button" onClick={() => setShowEquipo(true)}>
                👥 Equipo
              </button>
              <button className="action-button" onClick={() => setShowRutinas(true)}>
                ⚙️ Rutinas
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
              <span>
                {col.titulo}
                {col.ausente && ausenteA(col.ausente, hhmm) && (
                  <span className="hoy-col-ausente">
                    Ausente{col.ausente.desde ? ` desde ${col.ausente.desde}` : ""}
                  </span>
                )}
              </span>
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
            Hecho hoy
            <span className="hoy-col-count">{hechoHoy.length}</span>
          </h3>
          <div className="hoy-col-body">
            {hechoHoy.length === 0 ? (
              <p className="hoy-empty">Todavía nada hecho hoy</p>
            ) : (
              hechoHoy.map((item) =>
                item.tipo === "ticket" ? (
                  <article
                    key={`t-${item.ticket.id}`}
                    className="hoy-done"
                    onClick={() => !kiosk && onOpenTicket(item.ticket)}
                  >
                    <span className="hoy-card-id">#{item.ticket.id}</span>
                    <span className="hoy-done-area">{item.ticket.areas?.nombre ?? "Sin área"}</span>
                    <span className="hoy-done-meta">
                      {item.ticket.tecnicos?.nombre ?? "Sin asignar"} · {formatGtTime(item.at)}
                    </span>
                  </article>
                ) : (
                  <article key={`r-${item.registro.id}`} className="hoy-done hoy-done-rutina">
                    <span className="hoy-card-id">✓</span>
                    <span className="hoy-done-area">
                      {rutinaById.get(item.registro.rutina_id)?.nombre ?? "Rutina"}
                    </span>
                    <span className="hoy-done-meta">
                      {item.registro.automatica ? "Rutina (auto)" : "Rutina"} ·{" "}
                      {item.registro.tecnico_id ? tecnicoById.get(item.registro.tecnico_id)?.nombre ?? "—" : "—"} ·{" "}
                      {formatGtTime(item.at)}
                    </span>
                  </article>
                )
              )
            )}
          </div>
        </section>
      </div>

      <section className="hoy-rutinas">
        <h3>
          Rutinas de hoy
          {rutinasHoy.length > 0 && (
            <span className="hoy-rutinas-count">
              {rutinasHoy.filter(({ rutina }) => {
                const reg = registroByRutina.get(rutina.id);
                return reg && !reg.omitida;
              }).length}
              /{rutinasHoy.length}
            </span>
          )}
        </h3>
        {rutinasHoy.length === 0 ? (
          <p className="hoy-empty">
            {!infoHoy.laboral
              ? "Hoy es día de descanso: no hay rutinas."
              : rutinas.length
                ? "No hay rutinas para hoy."
                : "Sin rutinas configuradas todavía."}
          </p>
        ) : (
          <div className="hoy-rutinas-list">
            {rutinasHoy.map(({ rutina: r, hora: horaRutina, responsable, cubreA }) => {
              const registro = registroByRutina.get(r.id);
              const tecnico = responsable ? tecnicoById.get(responsable) : undefined;
              const atrasada = !registro && !!horaRutina && horaRutina < hhmm;
              const estado = !registro ? "" : registro.omitida ? " omitida" : registro.automatica ? " done auto" : " done";
              return (
                <button
                  key={r.id}
                  className={`hoy-rutina${estado}${atrasada ? " atrasada" : ""}`}
                  onClick={() => toggleRutina(r, responsable, horaRutina)}
                  disabled={kiosk}
                  title={r.descripcion ?? undefined}
                >
                  <span className="hoy-rutina-check">
                    {!registro ? "⬜" : registro.omitida ? "❌" : registro.automatica ? "☑️" : "✅"}
                  </span>
                  {horaRutina && <span className="hoy-rutina-hora">{horaRutina}</span>}
                  <span className="hoy-rutina-nombre">{r.nombre}</span>
                  {tecnico && (
                    <span className="hoy-rutina-tec" style={{ color: tecnico.color || undefined }}>
                      {r.rotacion?.length ? "🔄 " : ""}
                      {tecnico.nombre}
                    </span>
                  )}
                  {cubreA && (
                    <span className="hoy-rutina-cubre">cubre a {tecnicoById.get(cubreA)?.nombre ?? "—"}</span>
                  )}
                  {registro?.omitida && <span className="hoy-rutina-tag">no se hizo</span>}
                  {registro && !registro.omitida && registro.automatica && <span className="hoy-rutina-tag">auto</span>}
                  {registro && !registro.omitida && !registro.automatica && (
                    <span className="hoy-rutina-hora">{formatGtTime(registro.completada_at)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {showEquipo && <EquipoModal tecnicos={tecnicos} hoy={hoy} onClose={() => setShowEquipo(false)} />}
      {showRegistrar && (
        <RegistrarAtencionModal areas={areas} tecnicos={tecnicos} onClose={() => setShowRegistrar(false)} />
      )}
      {showRutinas && (
        <RutinasModal
          rutinas={rutinas}
          tecnicos={tecnicos}
          jornada={jornada}
          excepciones={excepciones}
          hoy={hoy}
          onClose={() => setShowRutinas(false)}
        />
      )}
    </div>
  );
}
