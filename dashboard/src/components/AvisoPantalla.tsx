import { useEffect, useRef, useState } from "react";
import { Megaphone, VolumeX } from "lucide-react";
import { supabase } from "../supabaseClient";

type Aviso = { id: number; mensaje: string; segundos: number; enviado_por: string | null; created_at: string };

const RESPALDO_MS = 15_000;

let audioCtx: AudioContext | null = null;
function contextoAudio() {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

// Campana de dos tonos, dos veces. Se genera con Web Audio para no depender
// de un archivo.
function sonarCampana() {
  const ctx = contextoAudio();
  void ctx.resume();
  const inicio = ctx.currentTime + 0.05;
  [0, 0.9].forEach((offset) => {
    [
      { freq: 880, t: 0 },
      { freq: 659.25, t: 0.32 },
    ].forEach(({ freq, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = inicio + offset + t;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.85);
    });
  });
}

// Solo en #pantalla: escucha la tabla avisos (que el bot llena con /aviso) y
// muestra cada uno a pantalla completa unos segundos, con sonido.
export function AvisoPantalla() {
  const [cola, setCola] = useState<Aviso[]>([]);
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false);
  const vistos = useRef(new Set<number>());

  // Último id conocido: los avisos que ya existían al abrir la pantalla no se
  // vuelven a mostrar. Se compara por id y no por hora para no depender de
  // que el reloj de la PC de la TV esté bien.
  const ultimoId = useRef<number | null>(null);

  function encolar(aviso: Aviso) {
    if (vistos.current.has(aviso.id)) return;
    vistos.current.add(aviso.id);
    ultimoId.current = Math.max(ultimoId.current ?? 0, aviso.id);
    setCola((actual) => [...actual, aviso]);
  }

  useEffect(() => {
    // Respaldo por si el realtime se cayó un momento: busca avisos nuevos.
    async function respaldo() {
      if (ultimoId.current === null) {
        const { data } = await supabase.from("avisos").select("id").order("id", { ascending: false }).limit(1);
        ultimoId.current = (data?.[0] as { id: number } | undefined)?.id ?? 0;
        return;
      }
      const { data } = await supabase.from("avisos").select("*").gt("id", ultimoId.current).order("id");
      (data as Aviso[] | null)?.forEach(encolar);
    }
    void respaldo();

    const channel = supabase
      .channel("avisos-pantalla")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos" }, (payload) =>
        encolar(payload.new as Aviso)
      )
      .subscribe();
    const intervalo = setInterval(respaldo, RESPALDO_MS);
    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, []);

  // El navegador no deja sonar audio hasta que alguien toca la página (salvo
  // Chrome con --autoplay-policy=no-user-gesture-required). Cualquier clic o
  // tecla lo habilita; mientras tanto se muestra un indicador discreto.
  useEffect(() => {
    const ctx = contextoAudio();
    const revisar = () => setSonidoBloqueado(ctx.state !== "running");
    const desbloquear = () => void ctx.resume().then(revisar);
    ctx.addEventListener("statechange", revisar);
    window.addEventListener("pointerdown", desbloquear);
    window.addEventListener("keydown", desbloquear);
    void ctx.resume().then(revisar);
    const t = setTimeout(revisar, 1000);
    return () => {
      clearTimeout(t);
      ctx.removeEventListener("statechange", revisar);
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
  }, []);

  const actual = cola[0];
  const cerrar = () => setCola((c) => c.slice(1));

  useEffect(() => {
    if (!actual) return;
    sonarCampana();
    const t = setTimeout(cerrar, actual.segundos * 1000);
    const conTecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", conTecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", conTecla);
    };
  }, [actual]);

  return (
    <>
      {sonidoBloqueado && (
        <div className="aviso-sonido-bloqueado" title="Toca la pantalla o presiona una tecla para habilitar el sonido de los avisos">
          <VolumeX size={16} /> Sonido de avisos desactivado: toca la pantalla
        </div>
      )}
      {actual && (
        <div className="aviso-overlay" key={actual.id} onClick={cerrar}>
          <Megaphone className="aviso-icono" />
          <span className="aviso-etiqueta">Aviso</span>
          <p className="aviso-mensaje">{actual.mensaje}</p>
          <span className="aviso-cerrar">Toca la pantalla para cerrar</span>
          <div className="aviso-barra" style={{ animationDuration: `${actual.segundos}s` }} />
        </div>
      )}
    </>
  );
}
