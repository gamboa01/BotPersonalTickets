import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function tg(method: string, body: unknown) {
  await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

function answerCallback(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

async function getSession(telegramId: number) {
  const { data } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
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

const HELP = `<b>Comandos disponibles</b>
/nuevo - crear un ticket nuevo
/mistickets - ver tus tickets abiertos
/estado &lt;id&gt; - ver detalle de un ticket
/resolver &lt;id&gt; - marcar un ticket como resuelto
/ayuda - ver esta ayuda`;

async function handleCommand(chatId: number, telegramId: number, name: string, text: string) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "/start":
    case "/ayuda":
      await sendMessage(chatId, `Hola ${name} 👋\n\n${HELP}`);
      break;

    case "/nuevo": {
      const { data: categorias } = await supabase.from("categorias").select("*").order("id");
      await setSession(telegramId, "awaiting_category", {});
      await sendMessage(chatId, "Selecciona una categoría:", {
        reply_markup: {
          inline_keyboard: (categorias ?? []).map((c) => [{ text: c.nombre, callback_data: `cat:${c.id}` }]),
        },
      });
      break;
    }

    case "/mistickets": {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, descripcion, prioridad, estado")
        .eq("reportado_por", telegramId)
        .neq("estado", "cerrado")
        .order("created_at", { ascending: false });

      if (!tickets?.length) {
        await sendMessage(chatId, "No tienes tickets abiertos. Usa /nuevo para crear uno.");
        break;
      }
      const lines = tickets.map((t) => `#${t.id} [${t.estado}] (${t.prioridad}) - ${t.descripcion.slice(0, 60)}`);
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
      if (!ticket) {
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
        `Categoría: ${ticket.categorias?.nombre ?? "-"}\n` +
        `Prioridad: ${ticket.prioridad}\n` +
        `Estado: ${ticket.estado}\n` +
        `Descripción: ${ticket.descripcion}`;
      if (comentarios?.length) {
        msg += `\n\n<b>Historial:</b>\n` + comentarios.map((c) => `- ${c.texto}`).join("\n");
      }
      await sendMessage(chatId, msg);
      break;
    }

    case "/resolver": {
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

    default:
      await sendMessage(chatId, "No entendí ese comando. Usa /ayuda para ver las opciones.");
  }
}

async function handleFreeText(chatId: number, telegramId: number, name: string, text: string) {
  const session = await getSession(telegramId);
  if (!session) {
    await sendMessage(chatId, "Usa /nuevo para crear un ticket o /ayuda para ver comandos.");
    return;
  }

  if (session.step === "awaiting_description") {
    const { categoria_id, prioridad } = session.payload as { categoria_id: number; prioridad: string };
    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        descripcion: text,
        categoria_id,
        prioridad,
        reportado_por: telegramId,
        reportado_por_nombre: name,
      })
      .select()
      .single();

    await clearSession(telegramId);
    if (error || !ticket) {
      await sendMessage(chatId, "Ocurrió un error creando el ticket. Intenta de nuevo con /nuevo.");
      return;
    }
    await sendMessage(chatId, `✅ Ticket #${ticket.id} creado con prioridad ${prioridad}.`);
    return;
  }

  if (session.step === "awaiting_resolution") {
    const { ticket_id } = session.payload as { ticket_id: number };
    await supabase.from("comentarios").insert({ ticket_id, autor: name, texto: `Resuelto: ${text}` });
    await supabase
      .from("tickets")
      .update({ estado: "resuelto", resolved_at: new Date().toISOString() })
      .eq("id", ticket_id);
    await clearSession(telegramId);
    await sendMessage(chatId, `✅ Ticket #${ticket_id} marcado como resuelto.`);
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

  if (data.startsWith("cat:")) {
    const categoria_id = Number(data.split(":")[1]);
    await setSession(telegramId, "awaiting_priority", { categoria_id });
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
        ],
      },
    });
    return;
  }

  if (data.startsWith("pri:")) {
    const prioridad = data.split(":")[1];
    const session = await getSession(telegramId);
    // deno-lint-ignore no-explicit-any
    const categoria_id = (session?.payload as any)?.categoria_id;
    await setSession(telegramId, "awaiting_description", { categoria_id, prioridad });
    await sendMessage(chatId, "Describe el problema:");
    return;
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
      await handleCallback(update.callback_query);
    } else if (update.message) {
      // deno-lint-ignore no-explicit-any
      const message = update.message as any;
      const chatId = message.chat.id;
      const telegramId = message.from.id;
      const name = message.from.first_name ?? "usuario";
      const text: string | undefined = message.text;

      if (text?.startsWith("/")) {
        await handleCommand(chatId, telegramId, name, text);
      } else if (text) {
        await handleFreeText(chatId, telegramId, name, text);
      }
    }
  } catch (e) {
    console.error(e);
  }

  return new Response("ok", { status: 200 });
});
