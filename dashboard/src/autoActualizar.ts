// La pantalla de TI (#pantalla) pasa días abierta sin que nadie la recargue:
// cuando se publica una versión nueva del dashboard (GitHub Pages), seguiría
// mostrando la vieja. Cada cierto tiempo se compara el script del index.html
// publicado con el que está corriendo y, si cambió, se recarga la página.

const REVISAR_CADA_MS = 5 * 60_000;
// Respaldo: recarga completa cada 6 h aunque no haya versión nueva.
const RECARGA_COMPLETA_MS = 6 * 60 * 60_000;

function scriptActual() {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src ?? null;
}

async function scriptPublicado() {
  const res = await fetch(window.location.pathname, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/src="([^"]*assets\/index-[^"]+\.js)"/);
  return match ? new URL(match[1], window.location.href).href : null;
}

export function vigilarNuevaVersion() {
  const actual = scriptActual();
  // En desarrollo (vite dev) no hay assets con hash: no hay nada que vigilar.
  if (!actual) return () => {};

  const revisar = setInterval(async () => {
    try {
      const publicado = await scriptPublicado();
      if (publicado && publicado !== actual) window.location.reload();
    } catch {
      // Sin red: se vuelve a intentar en la próxima revisión.
    }
  }, REVISAR_CADA_MS);
  const completa = setTimeout(() => window.location.reload(), RECARGA_COMPLETA_MS);

  return () => {
    clearInterval(revisar);
    clearTimeout(completa);
  };
}
