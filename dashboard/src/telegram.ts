const BOT_USERNAME = "GGTicketsBot";

// Usamos el dominio de Telegram Web (no t.me) porque es el mismo origen donde
// ya tienes sesión iniciada en el navegador: t.me no puede ver esa sesión (es
// un dominio distinto) y por eso mostraba la pantalla genérica de "Start Bot".
//
// Prellenamos el comando real (ej. "/resolver 42") en el cuadro de texto en
// vez de usar "?start=": Telegram Web no ejecuta ese parámetro solo, así que
// abría el chat correcto pero no mandaba nada. Con "?text=" el mensaje queda
// listo en el cuadro — solo falta un Enter/Enviar.
export function botDeepLink(accion: string, ticketId?: number) {
  const command = ticketId ? `/${accion} ${ticketId}` : `/${accion}`;
  return `https://web.telegram.org/k/#@${BOT_USERNAME}?text=${encodeURIComponent(command)}`;
}
