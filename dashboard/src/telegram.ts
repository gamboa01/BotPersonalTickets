const BOT_USERNAME = "GGTicketsBot";

// Telegram Web (por navegador) no ejecuta "?start=" ni "?text=" de forma
// confiable — probamos ambos y ninguno mandaba el comando solo. El esquema
// tg:// sí funciona como se espera, pero requiere la app de escritorio
// instalada (el sistema operativo la asocia como manejador de tg://).
export function botDeepLink(accion: string, ticketId?: number) {
  const payload = ticketId ? `${accion}_${ticketId}` : accion;
  return `tg://resolve?domain=${BOT_USERNAME}&start=${payload}`;
}

// El parámetro start de Telegram solo acepta [A-Za-z0-9_-], máx. 64
// caracteres — un nombre con acentos o espacios no cabe tal cual. Lo
// codificamos en base64url (que sí cumple ese formato) y el bot lo decodifica.
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Devuelve null si el nombre codificado no cabe en el límite de Telegram.
export function registrarDeepLink(personName: string): string | null {
  const encoded = base64UrlEncode(personName.trim());
  const payload = `registrar_${encoded}`;
  if (payload.length > 64) return null;
  return `tg://resolve?domain=${BOT_USERNAME}&start=${payload}`;
}
