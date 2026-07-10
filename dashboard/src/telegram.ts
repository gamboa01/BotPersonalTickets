const BOT_USERNAME = "GGTicketsBot";

// Abre el bot con el comando correspondiente ya listo para enviar, en vez de
// que el admin tenga que copiar el ID y escribirlo a mano en Telegram.
export function botDeepLink(accion: string, ticketId?: number) {
  const payload = ticketId ? `${accion}_${ticketId}` : accion;
  return `https://t.me/${BOT_USERNAME}?start=${payload}`;
}
