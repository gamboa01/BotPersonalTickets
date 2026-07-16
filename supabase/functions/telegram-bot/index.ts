import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_CHAT_ID");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// deno-lint-ignore no-explicit-any
async function tg(method: string, body: unknown): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

// Reenvía la foto usando el mismo file_id que ya tiene Telegram — no hace
// falta volver a descargarla ni subirla, un bot puede reusar un file_id
// que ya recibió para mandarlo a cualquier otro chat.
function sendPhoto(chatId: number, fileId: string, caption: string) {
  return tg("sendPhoto", { chat_id: chatId, photo: fileId, caption, parse_mode: "HTML" });
}

function editMessageText(chatId: number, messageId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", ...extra });
}

function answerCallback(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

// Los mensajes se envían con parse_mode HTML; cualquier texto que venga del
// usuario (nombre, descripción, notas) debe escaparse antes de interpolarlo.
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Contraparte de registrarDeepLink() en el dashboard: el parámetro start de
// Telegram solo acepta [A-Za-z0-9_-], así que el nombre viaja en base64url.
function base64UrlDecode(value: string): string {
  const padLength = (4 - (value.length % 4)) % 4;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const GT_TIMEZONE = "America/Guatemala";
function formatGt(iso: string) {
  return new Date(iso).toLocaleString("es-GT", {
    timeZone: GT_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Arma los botones de categoría de a 2 por fila, para no tener una lista
// larguísima de una sola columna cuando hay muchas categorías.
// deno-lint-ignore no-explicit-any
function categoryRows(categorias: any[]) {
  const rows = [];
  for (let i = 0; i < categorias.length; i += 2) {
    rows.push(
      categorias
        .slice(i, i + 2)
        .map((c) => ({ text: c.nombre, callback_data: `cat:${c.id}` }))
    );
  }
  return rows;
}

const SESSION_TIMEOUT_MS = 30 * 60_000;

// Si la sesión lleva más de 30 min sin actividad, se descarta: evita que un
// mensaje escrito días después se interprete con una categoría/prioridad ya vieja.
async function getSession(telegramId: number) {
  const { data } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!data) return null;

  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > SESSION_TIMEOUT_MS) {
    await supabase.from("bot_sessions").delete().eq("telegram_id", telegramId);
    return null;
  }

  return data;
}

async function setSession(telegramId: number, step: string, payload: Record<string, unknown> = {}) {
  await supabase
    .from("bot_sessions")
    .upsert({ telegram_id: telegramId, step, payload, updated_at: new Date().toISOString() });
}

async function clearSession(telegramId: number) {
  await supabase.from("bot_sessions").delete().eq("telegram_id", telegramId);
}

function isAdmin(telegramId: number) {
  return !!ADMIN_CHAT_ID && String(telegramId) === ADMIN_CHAT_ID;
}

// Avisa al usuario que reportó el ticket, salvo que sea la misma persona
// que está haciendo la actualización (para no notificarse a sí mismo).
async function notifyReporter(reportedBy: number, actorTelegramId: number, text: string) {
  if (reportedBy === actorTelegramId) return;
  await sendMessage(Number(reportedBy), text);
}

type DraftKind = "description" | "seguimiento" | "resolution" | "reapertura" | "comentario";

const DRAFT_LABELS: Record<DraftKind, string> = {
  description: "Descripción del ticket",
  seguimiento: "Comentario de seguimiento",
  resolution: "Nota de resolución",
  reapertura: "Motivo de reapertura",
  comentario: "Comentario",
};

// Telegram no permite prellenar el texto que escribe un usuario, así que en
// vez de eso mostramos una vista previa editable: el borrador se enseña en un
// mensaje con botones "Listo"/"Editar", y cada vez que el usuario reescribe,
// se actualiza ese mismo mensaje (in-place) en lugar de mandar uno nuevo.
async function presentDraft(
  chatId: number,
  telegramId: number,
  kind: DraftKind,
  draft: string,
  extraPayload: Record<string, unknown>,
  existingMessageId?: number
) {
  const text = `<b>${DRAFT_LABELS[kind]}</b>\n${escapeHtml(draft)}\n\n¿Lo enviamos así?`;
  const reply_markup = {
    inline_keyboard: [
      [
        { text: "✅ Listo", callback_data: `confirm:${kind}` },
        { text: "✏️ Editar", callback_data: `edit:${kind}` },
      ],
    ],
  };

  let messageId = existingMessageId;
  if (existingMessageId) {
    await editMessageText(chatId, existingMessageId, text, { reply_markup });
  } else {
    const res = await sendMessage(chatId, text, { reply_markup });
    messageId = res?.result?.message_id;
  }

  await setSession(telegramId, `confirming_${kind}`, { ...extraPayload, draft, draft_message_id: messageId });
}

const MAX_ADJUNTOS_POR_TICKET = 4;

// Deja al usuario listo para mandar una foto sin pedirle un comando aparte.
async function offerPhoto(chatId: number, telegramId: number, ticketId: number) {
  await setSession(telegramId, "awaiting_foto", { ticket_id: ticketId });
  await sendMessage(chatId, "¿Quieres adjuntar una foto?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Sí", callback_data: "foto:si" },
          { text: "🚫 No", callback_data: "foto:no" },
        ],
      ],
    },
  });
}

// deno-lint-ignore no-explicit-any
async function handlePhoto(chatId: number, telegramId: number, name: string, photoSizes: any[]) {
  const session = await getSession(telegramId);
  if (!session || session.step !== "awaiting_foto") {
    await sendMessage(chatId, "Usa /foto <id> primero para indicar a qué ticket adjuntar la imagen.");
    return;
  }
  const { ticket_id } = session.payload as { ticket_id: number };

  const { data: ticket } = await supabase.from("tickets").select("reportado_por").eq("id", ticket_id).maybeSingle();
  if (!ticket) {
    await clearSession(telegramId);
    await sendMessage(chatId, `No existe el ticket #${ticket_id}`);
    return;
  }

  const { count } = await supabase
    .from("adjuntos")
    .select("*", { count: "exact", head: true })
    .eq("ticket_id", ticket_id);

  if ((count ?? 0) >= MAX_ADJUNTOS_POR_TICKET) {
    await clearSession(telegramId);
    await sendMessage(chatId, `Ya se alcanzó el máximo de fotos permitidas para el ticket #${ticket_id}.`);
    return;
  }

  // photoSizes viene ordenado de menor a mayor resolución; tomamos la más grande.
  const largest = photoSizes[photoSizes.length - 1];
  const fileRes = await tg("getFile", { file_id: largest.file_id });
  const filePath = fileRes?.result?.file_path;
  if (!filePath) {
    await sendMessage(chatId, "No se pudo procesar la foto, intenta de nuevo.");
    return;
  }

  const fileResp = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  const bytes = new Uint8Array(await fileResp.arrayBuffer());

  let jpegBytes: Uint8Array;
  try {
    const image = await Image.decode(bytes);
    if (image.width > 1280) image.resize(1280, Image.RESIZE_AUTO);
    jpegBytes = await image.encodeJPEG(75);
  } catch {
    await sendMessage(chatId, "No pude procesar esa imagen, intenta con otra foto.");
    return;
  }

  const storagePath = `${ticket_id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("adjuntos")
    .upload(storagePath, jpegBytes, { contentType: "image/jpeg" });

  if (uploadError) {
    await sendMessage(chatId, "Ocurrió un error subiendo la foto, intenta de nuevo.");
    return;
  }

  const { data: publicUrlData } = supabase.storage.from("adjuntos").getPublicUrl(storagePath);
  await supabase.from("adjuntos").insert({ ticket_id, url: publicUrlData.publicUrl });

  // Se queda en "awaiting_foto": puede seguir mandando fotos hasta el tope,
  // sin que le anunciemos el número exacto (para no invitar a llenarlo siempre).
  await sendMessage(chatId, "📎 Foto adjuntada. Puedes enviar otra o usar /cancelar para terminar.");

  if (ticket.reportado_por !== telegramId) {
    await sendPhoto(Number(ticket.reportado_por), largest.file_id, `📎 Foto nueva en tu ticket #${ticket_id}`);
  } else if (ADMIN_CHAT_ID && !isAdmin(telegramId)) {
    await sendPhoto(
      Number(ADMIN_CHAT_ID),
      largest.file_id,
      `📎 Foto nueva en el ticket #${ticket_id} (de ${escapeHtml(name)})`
    );
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// Devuelve true si la acción debe bloquearse. Avisa una sola vez por ventana
// para no generar respuestas en cadena que amplifiquen el spam.
async function isRateLimited(chatId: number, telegramId: number): Promise<boolean> {
  const now = new Date();
  const { data } = await supabase.from("rate_limits").select("*").eq("telegram_id", telegramId).maybeSingle();

  const windowExpired = !data || now.getTime() - new Date(data.window_start).getTime() > RATE_LIMIT_WINDOW_MS;

  if (windowExpired) {
    await supabase
      .from("rate_limits")
      .upsert({ telegram_id: telegramId, window_start: now.toISOString(), count: 1 });
    return false;
  }

  const newCount = data.count + 1;
  await supabase.from("rate_limits").update({ count: newCount }).eq("telegram_id", telegramId);

  if (newCount === RATE_LIMIT_MAX + 1) {
    await sendMessage(chatId, "⏳ Estás enviando demasiados mensajes. Espera un minuto e intenta de nuevo.");
  }

  return newCount > RATE_LIMIT_MAX;
}

function helpText(esAdmin: boolean) {
  let help = `<b>Comandos disponibles</b>
/nuevo - crear un ticket nuevo
/abiertos - ver tus tickets abiertos o en progreso
/resueltos - ver tus tickets resueltos
/estado &lt;id&gt; - ver detalle de un ticket
/comentar &lt;id&gt; - agregar un comentario al historial (sin cambiar el estado)
/foto &lt;id&gt; - adjuntar una foto a un ticket
/reabrir &lt;id&gt; - reabrir un ticket resuelto o cerrado
/cancelar - cancelar la operación en curso
/ayuda - ver esta ayuda`;

  if (esAdmin) {
    help += `
/registrar &lt;nombre&gt; - crear un ticket a nombre de alguien que no usa el bot
/seguimiento &lt;id&gt; - agregar un comentario de seguimiento (pasa a en progreso)
/resolver &lt;id&gt; - marcar un ticket como resuelto`;
  }

  return help;
}

async function handleCommand(chatId: number, telegramId: number, name: string, text: string) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "/start": {
      // Deep link desde el dashboard: t.me/<bot>?start=resolver_42 llega aquí
      // como "/start resolver_42". Lo traducimos al comando real (/resolver 42).
      const deepLink = arg.match(/^(resolver|seguimiento|reabrir|foto|estado)_(\d+)$/);
      if (deepLink) {
        const [, accion, id] = deepLink;
        await handleCommand(chatId, telegramId, name, `/${accion} ${id}`);
        break;
      }
      if (arg === "nuevo") {
        await handleCommand(chatId, telegramId, name, "/nuevo");
        break;
      }
      if (arg.startsWith("registrar_")) {
        try {
          const personName = base64UrlDecode(arg.slice("registrar_".length));
          await handleCommand(chatId, telegramId, name, `/registrar ${personName}`);
        } catch {
          await sendMessage(chatId, "No se pudo leer el nombre. Usa /registrar <nombre> manualmente.");
        }
        break;
      }
      await sendMessage(chatId, `Hola ${escapeHtml(name)} 👋\n\n${helpText(isAdmin(telegramId))}`);
      break;
    }

    case "/ayuda":
      await sendMessage(chatId, `Hola ${escapeHtml(name)} 👋\n\n${helpText(isAdmin(telegramId))}`);
      break;

    case "/nuevo": {
      const { data: categoriasRaw } = await supabase.from("categorias").select("*").order("id");
      // "Otros" siempre al final, sin importar el orden de inserción.
      const categorias = [...(categoriasRaw ?? [])].sort((a, b) =>
        a.nombre === "Otros" ? 1 : b.nombre === "Otros" ? -1 : 0
      );
      await setSession(telegramId, "awaiting_category", {});
      await sendMessage(chatId, "Selecciona una categoría:", {
        reply_markup: {
          inline_keyboard: [
            ...categoryRows(categorias),
            [{ text: "❌ Cancelar", callback_data: "cancel" }],
          ],
        },
      });
      break;
    }

    case "/registrar": {
      if (!isAdmin(telegramId)) {
        await sendMessage(chatId, "No tienes permiso para registrar tickets a nombre de otra persona.");
        break;
      }
      if (!arg) {
        await sendMessage(chatId, "Uso: /registrar <nombre de la persona>");
        break;
      }
      const { data: categoriasRaw } = await supabase.from("categorias").select("*").order("id");
      const categorias = [...(categoriasRaw ?? [])].sort((a, b) =>
        a.nombre === "Otros" ? 1 : b.nombre === "Otros" ? -1 : 0
      );
      await setSession(telegramId, "awaiting_category", { reportado_por_nombre: arg });
      await sendMessage(chatId, `Selecciona una categoría para el ticket de ${escapeHtml(arg)}:`, {
        reply_markup: {
          inline_keyboard: [
            ...categoryRows(categorias),
            [{ text: "❌ Cancelar", callback_data: "cancel" }],
          ],
        },
      });
      break;
    }

    case "/abiertos": {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, descripcion, prioridad, estado, reportado_por_nombre")
        .eq("reportado_por", telegramId)
        .in("estado", ["abierto", "en_progreso"])
        .order("created_at", { ascending: false });

      if (!tickets?.length) {
        await sendMessage(chatId, "No tienes tickets abiertos. Usa /nuevo para crear uno.");
        break;
      }
      const lines = tickets.map(
        (t) =>
          `#${t.id} [${t.estado}] (${t.prioridad}) - ${escapeHtml(t.reportado_por_nombre ?? "")}: ${escapeHtml(
            t.descripcion.slice(0, 60)
          )}`
      );
      await sendMessage(chatId, lines.join("\n"));
      break;
    }

    case "/resueltos": {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, descripcion, prioridad, estado, reportado_por_nombre")
        .eq("reportado_por", telegramId)
        .in("estado", ["resuelto", "cerrado"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (!tickets?.length) {
        await sendMessage(chatId, "Todavía no tienes tickets resueltos.");
        break;
      }
      const lines = tickets.map(
        (t) =>
          `#${t.id} [${t.estado}] (${t.prioridad}) - ${escapeHtml(t.reportado_por_nombre ?? "")}: ${escapeHtml(
            t.descripcion.slice(0, 60)
          )}`
      );
      await sendMessage(chatId, lines.join("\n"));
      break;
    }

    case "/estado": {
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /estado <id>");
        break;
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*, categorias(nombre)")
        .eq("id", id)
        .maybeSingle();
      if (!ticket || (!isAdmin(telegramId) && ticket.reportado_por !== telegramId)) {
        // Mismo mensaje en ambos casos: no revelar si el ticket existe pero es de otra persona.
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      const { data: comentarios } = await supabase
        .from("comentarios")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at");

      let msg =
        `<b>Ticket #${ticket.id}</b>\n` +
        `Categoría: ${escapeHtml(ticket.categorias?.nombre ?? "-")}\n` +
        `Prioridad: ${ticket.prioridad}\n` +
        `Estado: ${ticket.estado}\n` +
        `Descripción: ${escapeHtml(ticket.descripcion)}\n` +
        `Creado: ${formatGt(ticket.created_at)}`;
      if (ticket.resolved_at) {
        msg += `\nResuelto: ${formatGt(ticket.resolved_at)}`;
      }
      if (comentarios?.length) {
        msg +=
          `\n\n<b>Historial:</b>\n` + comentarios.map((c) => `- ${escapeHtml(c.texto)}`).join("\n");
      }
      await sendMessage(chatId, msg);
      break;
    }

    case "/comentar": {
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /comentar <id>");
        break;
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id, reportado_por")
        .eq("id", id)
        .maybeSingle();
      if (!ticket || (!isAdmin(telegramId) && ticket.reportado_por !== telegramId)) {
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      await setSession(telegramId, "awaiting_comentario", { ticket_id: id });
      await sendMessage(chatId, `Escribe tu comentario para el ticket #${id}:`);
      break;
    }

    case "/foto": {
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /foto <id>");
        break;
      }
      const { data: ticket } = await supabase.from("tickets").select("id, reportado_por").eq("id", id).maybeSingle();
      if (!ticket || (!isAdmin(telegramId) && ticket.reportado_por !== telegramId)) {
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      const { count } = await supabase
        .from("adjuntos")
        .select("*", { count: "exact", head: true })
        .eq("ticket_id", id);
      if ((count ?? 0) >= MAX_ADJUNTOS_POR_TICKET) {
        await sendMessage(chatId, `Ya se alcanzó el máximo de fotos permitidas para el ticket #${id}.`);
        break;
      }
      await setSession(telegramId, "awaiting_foto", { ticket_id: id });
      await sendMessage(chatId, `Envía la foto para adjuntarla al ticket #${id}.`);
      break;
    }

    case "/seguimiento": {
      if (!isAdmin(telegramId)) {
        await sendMessage(chatId, "No tienes permiso para actualizar tickets.");
        break;
      }
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /seguimiento <id>");
        break;
      }
      const { data: ticket } = await supabase.from("tickets").select("id, estado").eq("id", id).maybeSingle();
      if (!ticket) {
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      if (ticket.estado === "resuelto" || ticket.estado === "cerrado") {
        await sendMessage(chatId, `El ticket #${id} ya está ${ticket.estado}.`);
        break;
      }
      await setSession(telegramId, "awaiting_seguimiento", { ticket_id: id });
      await sendMessage(chatId, `Escribe el comentario de seguimiento para el ticket #${id}:`);
      break;
    }

    case "/resolver": {
      if (!isAdmin(telegramId)) {
        await sendMessage(chatId, "No tienes permiso para resolver tickets.");
        break;
      }
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /resolver <id>");
        break;
      }
      const { data: ticket } = await supabase.from("tickets").select("id, estado").eq("id", id).maybeSingle();
      if (!ticket) {
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      if (ticket.estado === "resuelto" || ticket.estado === "cerrado") {
        await sendMessage(chatId, `El ticket #${id} ya está ${ticket.estado}.`);
        break;
      }
      await setSession(telegramId, "awaiting_resolution", { ticket_id: id });
      await sendMessage(chatId, `Escribe una nota de resolución para el ticket #${id}:`);
      break;
    }

    case "/reabrir": {
      const id = Number(arg);
      if (!id) {
        await sendMessage(chatId, "Uso: /reabrir <id>");
        break;
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id, estado, reportado_por")
        .eq("id", id)
        .maybeSingle();
      if (!ticket || (!isAdmin(telegramId) && ticket.reportado_por !== telegramId)) {
        await sendMessage(chatId, `No existe el ticket #${id}`);
        break;
      }
      if (ticket.estado !== "resuelto" && ticket.estado !== "cerrado") {
        await sendMessage(chatId, `El ticket #${id} no está resuelto ni cerrado.`);
        break;
      }
      await setSession(telegramId, "awaiting_reapertura", { ticket_id: id });
      await sendMessage(chatId, `Escribe el motivo para reabrir el ticket #${id}:`);
      break;
    }

    case "/cancelar": {
      const session = await getSession(telegramId);
      await clearSession(telegramId);
      await sendMessage(chatId, session ? "❌ Operación cancelada." : "No tienes ninguna operación en curso.");
      break;
    }

    default:
      await sendMessage(chatId, "No entendí ese comando. Usa /ayuda para ver las opciones.");
  }
}

async function handleFreeText(chatId: number, telegramId: number, text: string) {
  const session = await getSession(telegramId);
  if (!session) {
    await sendMessage(chatId, "Usa /nuevo para crear un ticket o /ayuda para ver comandos.");
    return;
  }

  if (session.step === "awaiting_description" || session.step === "confirming_description") {
    const { categoria_id, prioridad, draft_message_id, reportado_por_nombre } = session.payload as {
      categoria_id: number;
      prioridad: string;
      draft_message_id?: number;
      reportado_por_nombre?: string;
    };
    await presentDraft(
      chatId,
      telegramId,
      "description",
      text,
      { categoria_id, prioridad, reportado_por_nombre },
      draft_message_id
    );
    return;
  }

  if (session.step === "awaiting_seguimiento" || session.step === "confirming_seguimiento") {
    const { ticket_id, draft_message_id } = session.payload as { ticket_id: number; draft_message_id?: number };
    await presentDraft(chatId, telegramId, "seguimiento", text, { ticket_id }, draft_message_id);
    return;
  }

  if (session.step === "awaiting_resolution" || session.step === "confirming_resolution") {
    const { ticket_id, draft_message_id } = session.payload as { ticket_id: number; draft_message_id?: number };
    await presentDraft(chatId, telegramId, "resolution", text, { ticket_id }, draft_message_id);
    return;
  }

  if (session.step === "awaiting_reapertura" || session.step === "confirming_reapertura") {
    const { ticket_id, draft_message_id } = session.payload as { ticket_id: number; draft_message_id?: number };
    await presentDraft(chatId, telegramId, "reapertura", text, { ticket_id }, draft_message_id);
    return;
  }

  if (session.step === "awaiting_comentario" || session.step === "confirming_comentario") {
    const { ticket_id, draft_message_id } = session.payload as { ticket_id: number; draft_message_id?: number };
    await presentDraft(chatId, telegramId, "comentario", text, { ticket_id }, draft_message_id);
    return;
  }

  await sendMessage(chatId, "No entendí, usa /ayuda para ver comandos.");
}

// deno-lint-ignore no-explicit-any
async function handleCallback(callback: any) {
  const chatId = callback.message.chat.id;
  const telegramId = callback.from.id;
  const data: string = callback.data;
  await answerCallback(callback.id);

  if (data === "cancel") {
    await clearSession(telegramId);
    await sendMessage(chatId, "❌ Operación cancelada.");
    return;
  }

  if (data === "foto:no") {
    await clearSession(telegramId);
    await sendMessage(chatId, "👍 Listo, sin foto.");
    return;
  }

  if (data === "foto:si") {
    await sendMessage(chatId, "Envía la foto ahora.");
    return;
  }

  if (data.startsWith("cat:")) {
    const categoria_id = Number(data.split(":")[1]);
    const session = await getSession(telegramId);
    // deno-lint-ignore no-explicit-any
    const reportado_por_nombre = (session?.payload as any)?.reportado_por_nombre;
    await setSession(telegramId, "awaiting_priority", { categoria_id, reportado_por_nombre });
    await sendMessage(chatId, "Selecciona la prioridad:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🟢 Baja", callback_data: "pri:baja" },
            { text: "🟡 Media", callback_data: "pri:media" },
          ],
          [
            { text: "🟠 Alta", callback_data: "pri:alta" },
            { text: "🔴 Crítica", callback_data: "pri:critica" },
          ],
          [{ text: "❌ Cancelar", callback_data: "cancel" }],
        ],
      },
    });
    return;
  }

  if (data.startsWith("pri:")) {
    const prioridad = data.split(":")[1];
    const session = await getSession(telegramId);
    if (!session) {
      await sendMessage(chatId, "Esa selección ya expiró, usa /nuevo para empezar de nuevo.");
      return;
    }
    // deno-lint-ignore no-explicit-any
    const categoria_id = (session.payload as any)?.categoria_id;
    // deno-lint-ignore no-explicit-any
    const reportado_por_nombre = (session.payload as any)?.reportado_por_nombre;
    await setSession(telegramId, "awaiting_description", { categoria_id, prioridad, reportado_por_nombre });
    await sendMessage(chatId, "Describe el problema:");
    return;
  }

  if (data.startsWith("edit:")) {
    // No hay forma de prellenar el texto del usuario en Telegram; solo le
    // pedimos que lo reescriba, y ese nuevo texto reemplazará el mismo
    // mensaje de vista previa (handleFreeText detecta el paso "confirming_*").
    await sendMessage(chatId, "✏️ Escribe el nuevo texto:");
    return;
  }

  if (data.startsWith("confirm:")) {
    const kind = data.split(":")[1] as DraftKind;
    const session = await getSession(telegramId);
    if (!session) {
      await sendMessage(chatId, "No hay nada pendiente de confirmar.");
      return;
    }
    // deno-lint-ignore no-explicit-any
    const payload = session.payload as any;
    const draft: string = payload.draft ?? "";
    const draftMessageId: number | undefined = payload.draft_message_id;
    const name = callback.from.first_name ?? "usuario";

    await clearSession(telegramId);
    if (draftMessageId) {
      await editMessageText(
        chatId,
        draftMessageId,
        `<b>${DRAFT_LABELS[kind]}</b>\n${escapeHtml(draft)}\n\n✅ Enviado.`,
        { reply_markup: { inline_keyboard: [] } }
      );
    }

    if (kind === "description") {
      const { categoria_id, prioridad, reportado_por_nombre } = payload;
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          descripcion: draft,
          categoria_id,
          prioridad,
          reportado_por: telegramId,
          reportado_por_nombre: reportado_por_nombre || name,
        })
        .select()
        .single();

      if (error || !ticket) {
        await sendMessage(chatId, "Ocurrió un error creando el ticket. Intenta de nuevo con /nuevo.");
        return;
      }
      await sendMessage(chatId, `✅ Ticket #${ticket.id} creado con prioridad ${prioridad}.`);

      if (ADMIN_CHAT_ID && !isAdmin(telegramId)) {
        await sendMessage(
          Number(ADMIN_CHAT_ID),
          `🆕 <b>Ticket #${ticket.id}</b>\nDe: ${escapeHtml(name)}\nPrioridad: ${prioridad}\nCreado: ${formatGt(
            ticket.created_at
          )}\n${escapeHtml(draft)}`
        );
      }
      await offerPhoto(chatId, telegramId, ticket.id);
      return;
    }

    if (kind === "seguimiento") {
      const { ticket_id } = payload;
      await supabase.from("comentarios").insert({ ticket_id, autor: name, texto: `Seguimiento: ${draft}` });
      const { data: ticket } = await supabase
        .from("tickets")
        .update({ estado: "en_progreso" })
        .eq("id", ticket_id)
        .select("reportado_por")
        .single();
      await sendMessage(chatId, `✅ Ticket #${ticket_id} actualizado (en progreso).`);

      if (ticket?.reportado_por) {
        await notifyReporter(
          ticket.reportado_por,
          telegramId,
          `🔧 <b>Actualización de tu ticket #${ticket_id}</b>\n${escapeHtml(draft)}`
        );
      }
      await offerPhoto(chatId, telegramId, ticket_id);
      return;
    }

    if (kind === "resolution") {
      const { ticket_id } = payload;
      await supabase.from("comentarios").insert({ ticket_id, autor: name, texto: `Resuelto: ${draft}` });
      const { data: ticket } = await supabase
        .from("tickets")
        .update({ estado: "resuelto", resolved_at: new Date().toISOString() })
        .eq("id", ticket_id)
        .select("reportado_por")
        .single();
      await sendMessage(chatId, `✅ Ticket #${ticket_id} marcado como resuelto.`);

      if (ticket?.reportado_por) {
        await notifyReporter(
          ticket.reportado_por,
          telegramId,
          `✅ <b>Tu ticket #${ticket_id} fue resuelto</b>\n${escapeHtml(draft)}`
        );
      }
      await offerPhoto(chatId, telegramId, ticket_id);
      return;
    }

    if (kind === "reapertura") {
      const { ticket_id } = payload;
      await supabase.from("comentarios").insert({ ticket_id, autor: name, texto: `Reabierto: ${draft}` });
      const { data: ticket } = await supabase
        .from("tickets")
        .update({ estado: "abierto", resolved_at: null })
        .eq("id", ticket_id)
        .select("reportado_por")
        .single();
      await sendMessage(chatId, `🔁 Ticket #${ticket_id} reabierto.`);

      if (ticket?.reportado_por) {
        if (ticket.reportado_por !== telegramId) {
          await notifyReporter(
            ticket.reportado_por,
            telegramId,
            `🔁 <b>Tu ticket #${ticket_id} fue reabierto</b>\n${escapeHtml(draft)}`
          );
        } else if (ADMIN_CHAT_ID && !isAdmin(telegramId)) {
          await sendMessage(
            Number(ADMIN_CHAT_ID),
            `🔁 <b>Ticket #${ticket_id} reabierto por quien lo reportó</b>\n${escapeHtml(draft)}`
          );
        }
      }
      await offerPhoto(chatId, telegramId, ticket_id);
      return;
    }

    if (kind === "comentario") {
      const { ticket_id } = payload;
      await supabase.from("comentarios").insert({ ticket_id, autor: name, texto: `Comentario: ${draft}` });
      const { data: ticket } = await supabase
        .from("tickets")
        .select("reportado_por")
        .eq("id", ticket_id)
        .maybeSingle();
      await sendMessage(chatId, `✅ Comentario agregado al ticket #${ticket_id}.`);

      if (ticket?.reportado_por) {
        if (ticket.reportado_por !== telegramId) {
          await notifyReporter(
            ticket.reportado_por,
            telegramId,
            `💬 <b>Nuevo comentario en tu ticket #${ticket_id}</b>\n${escapeHtml(draft)}`
          );
        } else if (ADMIN_CHAT_ID && !isAdmin(telegramId)) {
          await sendMessage(
            Number(ADMIN_CHAT_ID),
            `💬 <b>Comentario de ${escapeHtml(name)} en el ticket #${ticket_id}</b>\n${escapeHtml(draft)}`
          );
        }
      }
      await offerPhoto(chatId, telegramId, ticket_id);
      return;
    }
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    if (update.callback_query) {
      // deno-lint-ignore no-explicit-any
      const callback = update.callback_query as any;
      const limited = await isRateLimited(callback.message.chat.id, callback.from.id);
      if (limited) {
        await answerCallback(callback.id);
      } else {
        await handleCallback(callback);
      }
    } else if (update.message) {
      // deno-lint-ignore no-explicit-any
      const message = update.message as any;
      const chatId = message.chat.id;
      const telegramId = message.from.id;
      const name = message.from.first_name ?? "usuario";
      const text: string | undefined = message.text;

      const limited = await isRateLimited(chatId, telegramId);
      if (!limited) {
        if (text?.startsWith("/")) {
          await handleCommand(chatId, telegramId, name, text);
        } else if (message.photo) {
          await handlePhoto(chatId, telegramId, name, message.photo);
        } else if (message.document) {
          await sendMessage(chatId, "📎 Por favor reenvía la imagen como foto normal (no como archivo).");
        } else if (text) {
          await handleFreeText(chatId, telegramId, text);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  return new Response("ok", { status: 200 });
});
