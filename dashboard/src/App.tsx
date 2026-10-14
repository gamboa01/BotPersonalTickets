import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Adjunto, supabase, Comentario, Tecnico, Ticket } from "./supabaseClient";
import { KpiCard } from "./components/KpiCard";
import { RankedBarChart } from "./components/RankedBarChart";
import { TrendChart } from "./components/TrendChart";
import { TicketsTable } from "./components/TicketsTable";
import { TicketAccion, TicketDetailModal } from "./components/TicketDetailModal";
import { RegistrarAtencionModal } from "./components/RegistrarAtencionModal";
import { resizeImageFile } from "./imageUtils";
import { vigilarNuevaVersion } from "./autoActualizar";
import { Login } from "./components/Login";
import { DocsView } from "./components/DocsView";
import { PlantaView } from "./components/PlantaView";
import { HoyView } from "./components/HoyView";
import { gtDayKey } from "./timezone";
import { BookOpen, CalendarDays, Factory, Plus, Ticket as TicketIcon } from "lucide-react";

const TREND_DAYS = 14;

// Deep link desde el bot (/areas → "Ver en el plano"): #area=<id> abre la pestaña Planta.
// #pantalla: la pantalla de TI (TV) muestra solo "Hoy", en grande y sin controles.
const KIOSK = window.location.hash === "#pantalla";
// Respaldo por si el realtime se cae en una pantalla que pasa el día abierta.
const RELOAD_MS = 60_000;

function areaFromHash() {
  const match = window.location.hash.match(/^#area=(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatHours(hours: number) {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [initialAreaId] = useState(areaFromHash);
  const [view, setView] = useState<"hoy" | "tickets" | "docs" | "planta">(initialAreaId !== null ? "planta" : "hoy");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loadingComentarios, setLoadingComentarios] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [editando, setEditando] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // La pantalla de TI se recarga sola al publicarse una versión nueva del dashboard.
  useEffect(() => (KIOSK ? vigilarNuevaVersion() : undefined), []);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, categorias(nombre), areas(nombre), tecnicos(nombre)")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error) {
        setError(error.message);
      } else {
        setTickets((data ?? []) as Ticket[]);
      }
      setLoading(false);
    }

    async function loadTecnicos() {
      const { data } = await supabase.from("tecnicos").select("*").order("id");
      if (active) setTecnicos((data ?? []) as Tecnico[]);
    }

    load();
    loadTecnicos();
    const reload = setInterval(load, RELOAD_MS);

    // Vuelve a cargar la lista en cuanto el bot inserta o actualiza un
    // ticket, en vez de esperar a que alguien recargue la página a mano.
    const channel = supabase
      .channel("tickets-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tecnicos" }, () => {
        loadTecnicos();
        load();
      })
      .subscribe();

    return () => {
      active = false;
      clearInterval(reload);
      supabase.removeChannel(channel);
    };
  }, [session]);

  // Los anulados (creados por error o duplicados) no cuentan en estadísticas,
  // Hoy ni Planta; solo se ven en la tabla con el filtro "Anulados".
  const vigentes = useMemo(() => tickets.filter((t) => t.estado !== "anulado"), [tickets]);

  const stats = useMemo(() => {
    const abiertos = vigentes.filter((t) => t.estado === "abierto").length;
    const enProgreso = vigentes.filter((t) => t.estado === "en_progreso").length;
    const resueltos = vigentes.filter((t) => t.estado === "resuelto" || t.estado === "cerrado").length;
    const pendientes = abiertos + enProgreso;

    const tiemposResolucion = vigentes
      .filter((t) => t.resolved_at)
      .map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3600000);
    const promedioResolucion =
      tiemposResolucion.length > 0
        ? tiemposResolucion.reduce((a, b) => a + b, 0) / tiemposResolucion.length
        : null;

    return { total: vigentes.length, abiertos, enProgreso, resueltos, pendientes, promedioResolucion };
  }, [vigentes]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of vigentes) {
      const nombre = t.categorias?.nombre ?? "Sin categoría";
      counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([nombre, total]) => ({ nombre, total }));
  }, [vigentes]);

  const areaData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of vigentes) {
      const nombre = t.areas?.nombre ?? "Sin área";
      counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [vigentes]);

  const reporterData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of vigentes) {
      const nombre = t.reportado_por_nombre ?? "Sin nombre";
      counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [vigentes]);

  const trendData = useMemo(() => {
    const days: { fecha: string; creados: number; resueltos: number }[] = [];

    // Ancla en el día calendario de Guatemala (no en el del navegador de quien
    // visite el dashboard), para que un ticket de la noche no se cuente en el día siguiente.
    const [y, m, d] = gtDayKey(new Date().toISOString()).split("-").map(Number);
    const todayAnchor = Date.UTC(y, m - 1, d);

    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const dayDate = new Date(todayAnchor - i * 86400000);
      const dayKey = dayDate.toISOString().slice(0, 10);
      const label = dayDate.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

      const creados = vigentes.filter((t) => gtDayKey(t.created_at) === dayKey).length;
      const resueltos = vigentes.filter((t) => t.resolved_at && gtDayKey(t.resolved_at) === dayKey).length;

      days.push({ fecha: label, creados, resueltos });
    }
    return days;
  }, [vigentes]);

  const filteredTickets = useMemo(() => {
    if (filtroEstado === "todos") return vigentes;
    return tickets.filter((t) => t.estado === filtroEstado);
  }, [tickets, vigentes, filtroEstado]);

  async function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    setLoadingComentarios(true);
    const [{ data: comentariosData }, { data: adjuntosData }] = await Promise.all([
      supabase.from("comentarios").select("*").eq("ticket_id", ticket.id).order("created_at"),
      supabase.from("adjuntos").select("*").eq("ticket_id", ticket.id).order("created_at"),
    ]);
    setComentarios((comentariosData ?? []) as Comentario[]);
    setAdjuntos((adjuntosData ?? []) as Adjunto[]);
    setLoadingComentarios(false);
  }

  if (checkingSession) return <div className="status-screen">Cargando...</div>;
  if (!session) return <Login />;
  if (loading) return <div className="status-screen">Cargando datos...</div>;
  if (error) return <div className="status-screen error">Error al cargar datos: {error}</div>;

  // El detalle abierto sigue al ticket actualizado (p. ej. después de asignarlo).
  const ticketAbierto = selectedTicket ? tickets.find((t) => t.id === selectedTicket.id) ?? selectedTicket : null;

  async function asignarTicket(ticketId: number, tecnicoId: number | null) {
    const { error } = await supabase.rpc("asignar_ticket", { p_ticket_id: ticketId, p_tecnico_id: tecnicoId });
    if (error) {
      alert(`No se pudo asignar el ticket: ${error.message}`);
      return;
    }
    const { data } = await supabase.from("comentarios").select("*").eq("ticket_id", ticketId).order("created_at");
    setComentarios((data ?? []) as Comentario[]);
  }

  async function accionTicket(accion: TicketAccion, ticketId: number, texto: string) {
    const { error } =
      accion === "resolver"
        ? await supabase.rpc("resolver_ticket", { p_ticket_id: ticketId, p_nota: texto })
        : await supabase.rpc(accion === "anular" ? "anular_ticket" : "reabrir_ticket", {
            p_ticket_id: ticketId,
            p_motivo: texto,
          });
    if (error) {
      alert(`No se pudo completar la acción: ${error.message}`);
      return false;
    }
    const { data } = await supabase.from("comentarios").select("*").eq("ticket_id", ticketId).order("created_at");
    setComentarios((data ?? []) as Comentario[]);
    return true;
  }

  async function recargarDetalle(ticketId: number) {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from("comentarios").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("adjuntos").select("*").eq("ticket_id", ticketId).order("created_at"),
    ]);
    setComentarios((c ?? []) as Comentario[]);
    setAdjuntos((a ?? []) as Adjunto[]);
  }

  // Autor de los comentarios: quien atendió la última vez en "Registrar atención"
  // (se recuerda en este navegador); si no hay, "Dashboard".
  function autorActual() {
    try {
      const id = Number(localStorage.getItem("atencion-tecnico"));
      return tecnicos.find((t) => t.id === id)?.nombre ?? "Dashboard";
    } catch {
      return "Dashboard";
    }
  }

  async function comentarTicket(ticketId: number, texto: string, seguimiento: boolean) {
    const { error } = await supabase.rpc("comentar_ticket", {
      p_ticket_id: ticketId,
      p_texto: texto,
      p_seguimiento: seguimiento,
      p_autor: autorActual(),
    });
    if (error) {
      alert(`No se pudo guardar el comentario: ${error.message}`);
      return false;
    }
    await recargarDetalle(ticketId);
    return true;
  }

  // Misma compresión y misma carpeta (bucket "adjuntos", <ticket>/<uuid>.jpg) que usa el bot.
  async function adjuntarFoto(ticketId: number, file: File) {
    try {
      const jpeg = await resizeImageFile(file);
      const path = `${ticketId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("adjuntos")
        .upload(path, jpeg, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("adjuntos").getPublicUrl(path);
      const { error } = await supabase.rpc("agregar_adjunto", { p_ticket_id: ticketId, p_url: data.publicUrl });
      if (error) throw error;
      await recargarDetalle(ticketId);
      return true;
    } catch (err) {
      alert(`No se pudo adjuntar la foto: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  if (KIOSK) {
    return (
      <div className="kiosk-root">
        <HoyView tickets={vigentes} tecnicos={tecnicos} kiosk onOpenTicket={() => {}} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header-row">
        <div>
          <h1>Tickets TI · Textyler</h1>
          <p className="subtitle">Trazabilidad de incidencias reportadas vía Telegram</p>
          <nav className="tabs">
            <button className={view === "hoy" ? "tab active" : "tab"} onClick={() => setView("hoy")}>
              <CalendarDays size={15} /> Hoy
            </button>
            <button className={view === "tickets" ? "tab active" : "tab"} onClick={() => setView("tickets")}>
              <TicketIcon size={15} /> Tickets
            </button>
            <button className={view === "docs" ? "tab active" : "tab"} onClick={() => setView("docs")}>
              <BookOpen size={15} /> Documentación
            </button>
            <button className={view === "planta" ? "tab active" : "tab"} onClick={() => setView("planta")}>
              <Factory size={15} /> Planta
            </button>
          </nav>
        </div>
        <div className="header-actions">
          {view === "tickets" && (
            <>
              <button className="action-button action-button-primary" onClick={() => setRegistrando(true)}>
                <Plus size={15} /> Registrar atención
              </button>
            </>
          )}
          <button className="logout-button" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {view === "hoy" ? (
        <HoyView tickets={vigentes} tecnicos={tecnicos} kiosk={false} onOpenTicket={openTicket} />
      ) : view === "docs" ? (
        <DocsView />
      ) : view === "planta" ? (
        <PlantaView tickets={vigentes} initialAreaId={initialAreaId} onOpenTicket={openTicket} />
      ) : (
        <>
          <section className="kpi-grid">
            <KpiCard label="Total de tickets" value={stats.total} accent="#22d3ee" />
            <KpiCard label="Pendientes" value={stats.pendientes} accent="#fbbf24" />
            <KpiCard label="Abiertos" value={stats.abiertos} accent="#fb7185" />
            <KpiCard label="En progreso" value={stats.enProgreso} accent="#38bdf8" />
            <KpiCard label="Resueltos" value={stats.resueltos} accent="#4ade80" />
            <KpiCard
              label="Tiempo prom. de resolución"
              value={stats.promedioResolucion !== null ? formatHours(stats.promedioResolucion) : "-"}
              accent="#c084fc"
            />
          </section>

          <section className="chart-grid">
            <div className="panel">
              <h2>Tickets por categoría</h2>
              <RankedBarChart data={categoryData} />
            </div>
            <div className="panel">
              <h2>Tendencia (últimos {TREND_DAYS} días)</h2>
              <TrendChart data={trendData} />
            </div>
            <div className="panel">
              <h2>Tickets por área (top 10)</h2>
              <RankedBarChart data={areaData} />
            </div>
            <div className="panel">
              <h2>Tickets por persona (top 10)</h2>
              <RankedBarChart data={reporterData} />
            </div>
          </section>

          <section className="panel">
            <div className="table-header">
              <h2>Tickets</h2>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="abierto">Abiertos</option>
                <option value="en_progreso">En progreso</option>
                <option value="resuelto">Resueltos</option>
                <option value="cerrado">Cerrados</option>
                <option value="anulado">Anulados</option>
              </select>
            </div>
            <TicketsTable tickets={filteredTickets} onRowClick={openTicket} />
          </section>
        </>
      )}

      {/* Fuera de las vistas: también se abre desde la ficha de un área en Planta. */}
      {ticketAbierto && (
        <TicketDetailModal
          ticket={ticketAbierto}
          tecnicos={tecnicos}
          onAssign={asignarTicket}
          onAction={accionTicket}
          onEdit={() => setEditando(true)}
          onComment={comentarTicket}
          onPhoto={adjuntarFoto}
          comentarios={comentarios}
          adjuntos={adjuntos}
          loadingComentarios={loadingComentarios}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      {registrando && <RegistrarAtencionModal tecnicos={tecnicos} onClose={() => setRegistrando(false)} />}

      {ticketAbierto && editando && (
        <RegistrarAtencionModal
          tecnicos={tecnicos}
          ticket={ticketAbierto}
          onClose={async () => {
            setEditando(false);
            // La edición deja un comentario "Editado: …" en el historial.
            const { data } = await supabase
              .from("comentarios")
              .select("*")
              .eq("ticket_id", ticketAbierto.id)
              .order("created_at");
            setComentarios((data ?? []) as Comentario[]);
          }}
        />
      )}
    </div>
  );
}
