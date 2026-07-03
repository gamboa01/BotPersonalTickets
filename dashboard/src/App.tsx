import { useEffect, useMemo, useState } from "react";
import { supabase, Ticket } from "./supabaseClient";
import { KpiCard } from "./components/KpiCard";
import { CategoryChart } from "./components/CategoryChart";
import { TrendChart } from "./components/TrendChart";
import { TicketsTable } from "./components/TicketsTable";

const TREND_DAYS = 14;

function formatHours(hours: number) {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");

  useEffect(() => {
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
    return () => {
      active = false;
    };
  }, []);

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

  const trendData = useMemo(() => {
    const days: { fecha: string; creados: number; resueltos: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const label = day.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });

      const creados = tickets.filter((t) => {
        const d = new Date(t.created_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === day.getTime();
      }).length;

      const resueltos = tickets.filter((t) => {
        if (!t.resolved_at) return false;
        const d = new Date(t.resolved_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === day.getTime();
      }).length;

      days.push({ fecha: label, creados, resueltos });
    }
    return days;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (filtroEstado === "todos") return tickets;
    return tickets.filter((t) => t.estado === filtroEstado);
  }, [tickets, filtroEstado]);

  if (loading) return <div className="status-screen">Cargando datos...</div>;
  if (error) return <div className="status-screen error">Error al cargar datos: {error}</div>;

  return (
    <div className="app">
      <header>
        <h1>Dashboard de Tickets TI</h1>
        <p className="subtitle">Trazabilidad de incidencias reportadas vía Telegram</p>
      </header>

      <section className="kpi-grid">
        <KpiCard label="Total de tickets" value={stats.total} accent="#4f46e5" />
        <KpiCard label="Pendientes" value={stats.pendientes} accent="#f59e0b" />
        <KpiCard label="Abiertos" value={stats.abiertos} accent="#ef4444" />
        <KpiCard label="En progreso" value={stats.enProgreso} accent="#0ea5e9" />
        <KpiCard label="Resueltos" value={stats.resueltos} accent="#10b981" />
        <KpiCard
          label="Tiempo prom. de resolución"
          value={stats.promedioResolucion !== null ? formatHours(stats.promedioResolucion) : "-"}
          accent="#8b5cf6"
        />
      </section>

      <section className="chart-grid">
        <div className="panel">
          <h2>Tickets por categoría</h2>
          <CategoryChart data={categoryData} />
        </div>
        <div className="panel">
          <h2>Tendencia (últimos {TREND_DAYS} días)</h2>
          <TrendChart data={trendData} />
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
        <TicketsTable tickets={filteredTickets} />
      </section>
    </div>
  );
}
