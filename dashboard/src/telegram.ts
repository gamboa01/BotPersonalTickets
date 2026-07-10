const BOT_USERNAME = "GGTicketsBot";

// Usamos el dominio de Telegram Web (no t.me) porque es el mismo origen donde
// ya tienes sesión iniciada en el navegador: t.me no puede ver esa sesión (es
// un dominio distinto) y por eso muestra la pantalla genérica de "Start Bot"
// en vez de saltar directo a tu chat.
export function botDeepLink(accion: string, ticketId?: number) {
  const payload = ticketId ? `${accion}_${ticketId}` : accion;
  return `https://web.telegram.org/k/#@${BOT_USERNAME}?start=${payload}`;
}
