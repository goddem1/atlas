import type { FastifyInstance } from "fastify";
import { getSessionUser } from "../middleware/requireSession.js";

/** Токен и chat id читаются из окружения при старте API. */

const MESSAGE_MAX = 2000;
const CONTACT_MAX = 160;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

function allowSend(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.post<{ Body: { message?: string; contact?: string } }>("/feedback", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = process.env.TELEGRAM_FEEDBACK_BOT_TOKEN?.trim() ?? "";
    const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID?.trim() ?? "";
    if (!token || !chatId) {
      return reply.status(503).send({ error: "Отправка в Telegram ещё не настроена" });
    }

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const contact = typeof req.body?.contact === "string" ? req.body.contact.trim() : "";
    if (message.length < 2) {
      return reply.status(400).send({ error: "Напишите сообщение" });
    }
    if (message.length > MESSAGE_MAX || contact.length > CONTACT_MAX) {
      return reply.status(400).send({ error: "Сообщение слишком длинное" });
    }

    const ip = req.ip || "unknown";
    if (!allowSend(ip)) {
      return reply.status(429).send({ error: "Слишком много сообщений. Попробуйте чуть позже" });
    }

    const user = await getSessionUser(req);
    const who = user ? `${user.name || "Без имени"} <${user.email}>` : "Гость";
    const lines = [
      "Сообщение с Atlas",
      `От: ${who}`,
      contact ? `Контакт: ${clip(contact, CONTACT_MAX)}` : "",
      "",
      clip(message, MESSAGE_MAX),
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "");

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        req.log.warn({ status: res.status }, "telegram feedback send failed");
        return reply.status(502).send({ error: "Не удалось отправить сообщение" });
      }
      return { ok: true as const };
    } catch (err) {
      req.log.warn({ err }, "telegram feedback send failed");
      return reply.status(502).send({ error: "Не удалось отправить сообщение" });
    }
  });
}
