import { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { ExcepcionDia, JornadaDia, Rutina, RutinaRegistro, supabase } from "../supabaseClient";
import { GT_TIMEZONE, gtDayKey, gtWeekday } from "../timezone";
import { MARGEN_AUTO_MIN, diaInfo, rutinasDelDia, sumarMinutos } from "../rutinasUtils";

// Vista de solo lectura para Gerencia: solo porcentajes, sin detalle de
// tickets ni resumen por integrante. Los tickets llegan ya agregados por
// resumen_gerencia() (la cuenta no puede leer la tabla); las rutinas se
// calculan aquí con la misma lógica que la pantalla Hoy.

interface Periodo {
  recibidos: number;
  resueltos: number;
}

interface Resumen {
  periodos: { dia: Periodo; semana: Periodo; mes: Periodo };
  categorias: { nombre: string; total: number }[];
}

const REFRESCO_MS = 60_000;

function sumarDias(key: string, dias: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
}

function diaSemana(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

function Indicador({ titulo, valor, vacio }: { titulo: string; valor: number | null; vacio: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tono = valor === null ? "sin" : valor >= 90 ? "alto" : valor >= 70 ? "medio" : "bajo";
  return (
    <div className={`gerencia-indicador ${tono}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="gerencia-anillo-fondo" />
        {valor !== null && (
          <circle
            cx="60"
            cy="60"
            r={r}
            className="gerencia-anillo"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - valor / 100)}
            transform="rotate(-90 60 60)"
          />
        )}
      </svg>
      <div className="gerencia-valor">{valor === null ? "—" : `${valor}%`}</div>
      <div className="gerencia-titulo">{valor === null ? vacio : titulo}</div>
    </div>
  );
}

export function GerenciaView() {
  const [now, setNow] = useState(() => Date.now());
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [rutinas, setRutinas] = useState<Rutina[]>([]);
  const [registros, setRegistros] = useState<RutinaRegistro[]>([]);
  const [jornada, setJornada] = useState<JornadaDia[]>([]);
  const [excepciones, setExcepciones] = useState<ExcepcionDia[]>([]);
  // Primer día con rutinas registradas: antes de eso el sistema no se usaba y
  // esos días no deben contar como rutinas incumplidas.
  const [inicioSeguimiento, setInicioSeguimiento] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hoy = gtDayKey(new Date(now).toISOString());
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const lunes = sumarDias(hoy, -((gtWeekday(new Date(now)) + 6) % 7));
  // Del lunes o del 1 del mes, lo que sea antes (la semana puede empezar el mes anterior).
  const desde = lunes < inicioMes ? lunes : inicioMes;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      const [res, rut, reg, jor, exc, primero] = await Promise.all([
        supabase.rpc("resumen_gerencia"),
        supabase.from("rutinas").select("*"),
        supabase.from("rutina_registros").select("*").gte("fecha", desde).lte("fecha", hoy),
        supabase.from("jornada_semana").select("*"),
        supabase.from("calendario_excepciones").select("*"),
        supabase.from("rutina_registros").select("fecha").order("fecha").limit(1),
      ]);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setError(null);
      setResumen(res.data as Resumen);
      setRutinas((rut.data ?? []) as Rutina[]);
      setRegistros((reg.data ?? []) as RutinaRegistro[]);
      setJornada((jor.data ?? []) as JornadaDia[]);
      setExcepciones((exc.data ?? []) as ExcepcionDia[]);
      setInicioSeguimiento((primero.data?.[0] as { fecha: string } | undefined)?.fecha ?? null);
    }
    load();
    const refresco = setInterval(load, REFRESCO_MS);
    return () => clearInterval(refresco);
  }, [desde, hoy]);

  // Rutinas cumplidas / rutinas que tocaban, día por día. De hoy solo cuentan
  // las que ya pasaron su hora + margen (o que ya se marcaron).
  const rutinasPct = useMemo(() => {
    const hhmm = new Date(now).toLocaleTimeString("en-GB", { timeZone: GT_TIMEZONE, hour: "2-digit", minute: "2-digit" });
    const hechas = new Set(registros.filter((r) => !r.omitida).map((r) => `${r.fecha}:${r.rutina_id}`));
    const marcadas = new Set(registros.map((r) => `${r.fecha}:${r.rutina_id}`));
    const porDia = new Map<string, { tocaban: number; hechas: number }>();
    if (!inicioSeguimiento) return { dia: null, semana: null, mes: null };
    for (let fecha = desde > inicioSeguimiento ? desde : inicioSeguimiento; fecha <= hoy; fecha = sumarDias(fecha, 1)) {
      const lista = rutinasDelDia(rutinas, diaInfo(fecha, diaSemana(fecha), jornada, excepciones)).filter(
        ({ rutina, hora }) =>
          fecha < hoy ||
          marcadas.has(`${fecha}:${rutina.id}`) ||
          (!!hora && sumarMinutos(hora, MARGEN_AUTO_MIN) <= hhmm)
      );
      porDia.set(fecha, {
        tocaban: lista.length,
        hechas: lista.filter(({ rutina }) => hechas.has(`${fecha}:${rutina.id}`)).length,
      });
    }
    const sumar = (inicio: string) => {
      let tocaban = 0;
      let hechasTotal = 0;
      porDia.forEach((v, fecha) => {
        if (fecha >= inicio) {
          tocaban += v.tocaban;
          hechasTotal += v.hechas;
        }
      });
      return porcentaje(hechasTotal, tocaban);
    };
    return { dia: sumar(hoy), semana: sumar(lunes), mes: sumar(inicioMes) };
  }, [now, registros, rutinas, jornada, excepciones, desde, hoy, lunes, inicioMes, inicioSeguimiento]);

  const fechaLarga = new Date(now).toLocaleDateString("es-GT", {
    timeZone: GT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const totalCategorias = resumen?.categorias.reduce((s, c) => s + c.total, 0) ?? 0;

  const periodos: { clave: "dia" | "semana" | "mes"; titulo: string }[] = [
    { clave: "dia", titulo: "Hoy" },
    { clave: "semana", titulo: "Esta semana" },
    { clave: "mes", titulo: "Este mes" },
  ];

  return (
    <div className="gerencia">
      <header className="gerencia-header">
        <div>
          <h1>Departamento de TI</h1>
          <p className="hoy-date">{fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}</p>
        </div>
        <button className="logout-button" onClick={() => supabase.auth.signOut()}>
          <LogOut size={15} /> Cerrar sesión
        </button>
      </header>

      {error ? (
        <div className="status-screen error">No se pudo cargar el resumen: {error}</div>
      ) : !resumen ? (
        <div className="status-screen">Cargando resumen...</div>
      ) : (
        <>
          <section className="gerencia-periodos">
            {periodos.map(({ clave, titulo }) => {
              const p = resumen.periodos[clave];
              return (
                <div key={clave} className="panel gerencia-periodo">
                  <h2>{titulo}</h2>
                  <div className="gerencia-indicadores">
                    <Indicador
                      titulo="Atenciones resueltas"
                      valor={porcentaje(p.resueltos, p.recibidos)}
                      vacio="Sin solicitudes"
                    />
                    <Indicador titulo="Rutinas cumplidas" valor={rutinasPct[clave]} vacio="Sin rutinas" />
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel">
            <h2>Categorías más solicitadas</h2>
            {totalCategorias === 0 ? (
              <p className="empty-state">Todavía no hay solicitudes con categoría.</p>
            ) : (
              <ul className="gerencia-categorias">
                {resumen.categorias.map((c) => {
                  const pct = Math.round((c.total / totalCategorias) * 100);
                  return (
                    <li key={c.nombre}>
                      <span className="gerencia-cat-nombre">{c.nombre}</span>
                      <span className="gerencia-cat-barra">
                        <i style={{ width: `${Math.max(pct, 1)}%` }} />
                      </span>
                      <span className="gerencia-cat-pct">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
