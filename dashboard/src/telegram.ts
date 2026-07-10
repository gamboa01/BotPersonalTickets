const BOT_USERNAME = "GGTicketsBot";

// Telegram Web (por navegador) no ejecuta "?start=" ni "?text=" de forma
// confiable — probamos ambos y ninguno mandaba el comando solo. El esquema
// tg:// sí funciona como se espera, pero requiere la app de escritorio
// instalada (el sistema operativo la asocia como manejador de tg://).
export function botDeepLink(accion: string, ticketId?: number) {
  const payload = ticketId ? `${accion}_${ticketId}` : accion;
  return `tg://resolve?domain=${BOT_USERNAME}&start=${payload}`;
}
