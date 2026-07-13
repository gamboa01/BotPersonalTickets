import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Adjunto, supabase, Comentario, Ticket } from "./supabaseClient";
import { KpiCard } from "./components/KpiCard";
import { RankedBarChart } from "./components/RankedBarChart";
import { TrendChart } from "./components/TrendChart";
import { TicketsTable } from "./components/TicketsTable";
import { TicketDetailModal } from "./components/TicketDetailModal";
import { Login } from "./components/Login";
import { RegistrarTicket } from "./components/RegistrarTicket";
import { gtDayKey } from "./timezone";
import { botDeepLink } from "./telegram";

const TREND_DAYS = 14;

function formatHours(hours: number) {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loadingComentarios, setLoadingComentarios] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);

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

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, categorias(nombre)")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error) {
        setError(error.message);
      } else {
        setTickets((data ?? []) as Ticket[]);
      }
      setLoading(false);
    }

    load();

    // Vuelve a cargar la lista en cuanto el bot inserta o actualiza un
    // ticket, en vez de esperar a que alguien recargue la página a mano.
    const channel = supabase
      .channel("tickets-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        load();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session]);

  const stats = useMemo(() => {
    const abiertos = tickets.filter((t) => t.estado === "abierto").length;
    const enProgreso = tickets.filter((t) => t.estado === "en_progreso").length;
    const resueltos = tickets.filter((t) => t.estado === "resuelto" || t.estado === "cerrado").length;
    const pendientes = abiertos + enProgreso;

    const tiemposResolucion = tickets
      .filter((t) => t.resolved_at)
      .map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3600000);
    const promedioResolucion =
      tiemposResolucion.length > 0
        ? tiemposResolucion.reduce((a, b) => a + b, 0) / tiemposResolucion.length
        : null;

    return { total: tickets.length, abiertos, enProgreso, resueltos, pendientes, promedioResolucion };
  }, [tickets]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const nombre = t.categorias?.nombre ?? "Sin categoría";
      counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([nombre, total]) => ({ nombre, total }));
  }, [tickets]);

  const reporterData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const nombre = t.reportado_por_nombre ?? "Sin nombre";
      counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [tickets]);

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

      const creados = tickets.filter((t) => gtDayKey(t.created_at) === dayKey).length;
      const resueltos = tickets.filter((t) => t.resolved_at && gtDayKey(t.resolved_at) === dayKey).length;

      days.push({ fecha: label, creados, resueltos });
    }
    return days;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (filtroEstado === "todos") return tickets;
    return tickets.filter((t) => t.estado === filtroEstado);
  }, [tickets, filtroEstado]);

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

  return (
    <div className="app">
      <header className="header-row">
        <div>
          <h1>Dashboard de Tickets TI</h1>
          <p className="subtitle">Trazabilidad de incidencias reportadas vía Telegram</p>
        </div>
        <div className="header-actions">
          <a className="action-button action-button-primary" href={botDeepLink("nuevo")} target="_blank" rel="noreferrer">
            + Nuevo ticket
          </a>
          <RegistrarTicket />
          <button className="logout-button" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>

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
          </select>
        </div>
        <TicketsTable tickets={filteredTickets} onRowClick={openTicket} />
      </section>

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          comentarios={comentarios}
          adjuntos={adjuntos}
          loadingComentarios={loadingComentarios}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
