import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  downloadTelegramChannelPhoto,
  downloadTelegramMessageImage,
  downloadTelegramMessageVideo,
  downloadTelegramMessageVideoThumb,
  getTelegramNewsMessages,
  isTelegramMtprotoConfigured,
  listTelegramNewsChannels,
  TelegramMtprotoUnavailableError,
} from "../services/telegramMtproto.js";
import {
  ensureWatchedChannels,
  getStoredTelegramFeed,
  getStoredTelegramNewsMessages,
  listStoredTelegramChannels,
  upsertTelegramNewsMessages,
} from "../services/telegramNewsStore.js";
import { runTelegramNewsCatchUp } from "../services/telegramNewsSync.js";
import { getNewsWidgetInsight, resolveNewsWidgetMskDay } from "../services/newsWidgetLlm.js";
import { listTelegramNewsDailyIndex } from "../services/telegramNewsDailyIndex.js";
import { requireProjectOwner } from "../middleware/requireProjectOwner.js";
import {
  getPriceHintsForPost,
  listNewsFeedbackCandidates,
  saveFeedback,
} from "../services/newsFeedbackService.js";

function parseUsernamesQuery(raw: string | undefined): string[] | undefined {
  // Параметр отсутствует → дефолт из env; присутствует (даже пустой) → список клиента.
  if (raw == null) return undefined;
  return raw.split(/[,;\s]+/).filter(Boolean);
}

function parseFiltersQuery(raw: string | undefined): string[] {
  if (raw == null || !raw.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function registerTelegramNewsRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get<{ Querystring: { usernames?: string; live?: string } }>("/telegram/channels", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isTelegramMtprotoConfigured()) {
      return reply.status(503).send({
        error:
          "Telegram MTProto не настроен. Задайте TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION.",
      });
    }
    try {
      const usernames = parseUsernamesQuery(req.query.usernames);
      if (usernames !== undefined) {
        await ensureWatchedChannels(prisma, usernames);
        void runTelegramNewsCatchUp(prisma, app.log, usernames).catch((err) => {
          app.log.warn({ err }, "[telegram-news] watch catch-up failed");
        });
      }

      const wantLive = req.query.live === "1" || req.query.live === "true";
      if (wantLive) {
        const channels = await listTelegramNewsChannels(usernames);
        return { channels };
      }

      // Быстрый путь для live UI: превью из БД (обновляется MTProto/catch-up).
      let channels = await listStoredTelegramChannels(prisma, usernames);
      const missingMeta = channels.some((c) => !c.title || c.title === c.username);
      if (channels.length === 0 || missingMeta) {
        try {
          const live = await listTelegramNewsChannels(usernames ?? channels.map((c) => c.username));
          const { updateChannelMeta } = await import("../services/telegramNewsStore.js");
          for (const ch of live) {
            await updateChannelMeta(prisma, ch.username, {
              title: ch.title,
              hasPhoto: ch.hasPhoto,
            });
          }
          channels = await listStoredTelegramChannels(prisma, usernames);
          // Если постов ещё нет — покажем live preview.
          if (channels.every((c) => !c.lastMessageAt)) {
            return { channels: live };
          }
        } catch {
          if (channels.length === 0) throw new Error("Не удалось загрузить каналы");
        }
      }
      return { channels };
    } catch (err) {
      const message =
        err instanceof TelegramMtprotoUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Не удалось загрузить каналы";
      return reply.status(503).send({ error: message });
    }
  });

  app.get<{
    Querystring: { usernames?: string; filters?: string };
  }>("/telegram/news-widget", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isTelegramMtprotoConfigured()) {
      return reply.status(503).send({
        error:
          "Telegram MTProto не настроен. Задайте TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION.",
      });
    }
    const usernames = parseUsernamesQuery(req.query.usernames) ?? [];
    const filters = parseFiltersQuery(req.query.filters);
    if (usernames.length === 0) {
      return {
        sentiment: 50,
        why: "Добавьте каналы, чтобы считать сентимент и топ новостей.",
        explanation: { formula: "Нет каналов — сентимент не считается.", notes: [] },
        items: [],
        cached: false,
        updatedAt: new Date().toISOString(),
      };
    }
    try {
      await ensureWatchedChannels(prisma, usernames);
      return await getNewsWidgetInsight(prisma, usernames, filters, app.log);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить news-виджет";
      return reply.status(503).send({ error: message });
    }
  });

  app.get<{
    Querystring: { from?: string; to?: string; limit?: string };
  }>("/telegram/news-index", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const limitRaw = req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined;
    try {
      return await listTelegramNewsDailyIndex(prisma, {
        from: req.query.from,
        to: req.query.to,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить историю индекса";
      return reply.status(503).send({ error: message });
    }
  });

  app.get<{
    Querystring: { usernames?: string; limit?: string; before?: string; refresh?: string };
  }>("/telegram/feed", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isTelegramMtprotoConfigured()) {
      return reply.status(503).send({
        error:
          "Telegram MTProto не настроен. Задайте TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION.",
      });
    }
    const usernames = parseUsernamesQuery(req.query.usernames) ?? [];
    if (usernames.length === 0) {
      return { messages: [] };
    }
    const limit = Number.parseInt(req.query.limit ?? "50", 10);
    const safeLimit = Number.isFinite(limit) ? limit : 50;
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";

    try {
      await ensureWatchedChannels(prisma, usernames);
      if (forceRefresh) {
        // Не блокируем ответ: клиент подхватит свежие посты следующим poll.
        void (async () => {
          try {
            await runTelegramNewsCatchUp(prisma, app.log, usernames);
          } catch (err) {
            app.log.warn({ err }, "[telegram-news] feed refresh catch-up failed");
          }
          for (const username of usernames.slice(0, 8)) {
            try {
              const live = await getTelegramNewsMessages(username, { limit: 20 });
              await upsertTelegramNewsMessages(prisma, live);
            } catch (err) {
              app.log.warn({ err, username }, "[telegram-news] feed channel refresh failed");
            }
          }
        })();
      }

      const messages = await getStoredTelegramFeed(prisma, usernames, {
        limit: safeLimit,
        before: req.query.before,
      });
      return { messages };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить ленту";
      return reply.status(503).send({ error: message });
    }
  });

  app.get<{
    Params: { username: string };
    Querystring: { limit?: string; offsetId?: string; refresh?: string };
  }>("/telegram/channels/:username/messages", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isTelegramMtprotoConfigured()) {
      return reply.status(503).send({
        error:
          "Telegram MTProto не настроен. Задайте TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION.",
      });
    }
    const limit = Number.parseInt(req.query.limit ?? "40", 10);
    const offsetId = Number.parseInt(req.query.offsetId ?? "0", 10);
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const safeLimit = Number.isFinite(limit) ? limit : 40;
    const safeOffset = Number.isFinite(offsetId) ? offsetId : 0;

    try {
      await ensureWatchedChannels(prisma, [req.params.username]);

      if (forceRefresh) {
        try {
          const live = await getTelegramNewsMessages(req.params.username, {
            limit: safeLimit,
            offsetId: safeOffset,
          });
          await upsertTelegramNewsMessages(prisma, live);
        } catch (err) {
          app.log.warn({ err, username: req.params.username }, "[telegram-news] live refresh failed");
        }
      }

      let messages = await getStoredTelegramNewsMessages(prisma, req.params.username, {
        limit: safeLimit,
        offsetId: safeOffset,
      });

      // Cold start: DB empty → one live pull, then serve.
      if (messages.length === 0) {
        messages = await getTelegramNewsMessages(req.params.username, {
          limit: safeLimit,
          offsetId: safeOffset,
        });
        await upsertTelegramNewsMessages(prisma, messages);
      }

      return { messages };
    } catch (err) {
      const message =
        err instanceof TelegramMtprotoUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Не удалось загрузить сообщения";
      const status = err instanceof TelegramMtprotoUnavailableError ? 400 : 503;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Params: { username: string; messageId: string } }>(
    "/telegram/channels/:username/messages/:messageId/media",
    async (req, reply) => {
      reply.header("Cache-Control", "public, max-age=3600");
      if (!isTelegramMtprotoConfigured()) {
        return reply.status(404).send();
      }
      const messageId = Number.parseInt(req.params.messageId, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return reply.status(404).send();
      }
      try {
        const media = await downloadTelegramMessageImage(req.params.username, messageId);
        if (!media) return reply.status(404).send();
        return reply.type(media.contentType).send(media.buffer);
      } catch {
        return reply.status(404).send();
      }
    },
  );

  app.get<{ Params: { username: string; messageId: string } }>(
    "/telegram/channels/:username/messages/:messageId/video",
    async (req, reply) => {
      reply.header("Cache-Control", "public, max-age=3600");
      if (!isTelegramMtprotoConfigured()) {
        return reply.status(404).send();
      }
      const messageId = Number.parseInt(req.params.messageId, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return reply.status(404).send();
      }
      try {
        const media = await downloadTelegramMessageVideo(req.params.username, messageId);
        if (!media) return reply.status(404).send();
        return reply.type(media.contentType).send(media.buffer);
      } catch (err) {
        if (err instanceof TelegramMtprotoUnavailableError) {
          return reply.status(413).send({ error: err.message });
        }
        return reply.status(404).send();
      }
    },
  );

  app.get<{ Params: { username: string; messageId: string } }>(
    "/telegram/channels/:username/messages/:messageId/video-thumb",
    async (req, reply) => {
      reply.header("Cache-Control", "public, max-age=3600");
      if (!isTelegramMtprotoConfigured()) {
        return reply.status(404).send();
      }
      const messageId = Number.parseInt(req.params.messageId, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return reply.status(404).send();
      }
      try {
        const media = await downloadTelegramMessageVideoThumb(req.params.username, messageId);
        if (!media) return reply.status(404).send();
        return reply.type(media.contentType).send(media.buffer);
      } catch {
        return reply.status(404).send();
      }
    },
  );

  app.get<{ Params: { username: string } }>(
    "/telegram/channels/:username/photo",
    async (req, reply) => {
      reply.header("Cache-Control", "public, max-age=3600");
      if (!isTelegramMtprotoConfigured()) {
        return reply.status(404).send();
      }
      try {
        const buf = await downloadTelegramChannelPhoto(req.params.username);
        if (!buf) return reply.status(404).send();
        return reply.type("image/jpeg").send(buf);
      } catch {
        return reply.status(404).send();
      }
    },
  );

  app.get<{ Querystring: { day?: string } }>(
    "/telegram/news-feedback/candidates",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!(await requireProjectOwner(req, reply))) return;
      const day = req.query.day?.trim() || resolveNewsWidgetMskDay();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return reply.status(400).send({ error: "Invalid day (YYYY-MM-DD)" });
      }
      try {
        return await listNewsFeedbackCandidates(prisma, day);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load candidates";
        return reply.status(503).send({ error: message });
      }
    },
  );

  app.get<{ Querystring: { timestamp?: string } }>(
    "/telegram/news-feedback/price-hint",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!(await requireProjectOwner(req, reply))) return;
      const tsRaw = req.query.timestamp?.trim();
      if (!tsRaw) return reply.status(400).send({ error: "timestamp is required" });
      const postTimestamp = new Date(tsRaw);
      if (Number.isNaN(postTimestamp.getTime())) {
        return reply.status(400).send({ error: "Invalid timestamp" });
      }
      try {
        return await getPriceHintsForPost(postTimestamp);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load price hint";
        return reply.status(503).send({ error: message });
      }
    },
  );

  app.post<{
    Body: {
      postKey?: string;
      day?: string;
      postText?: string;
      postTimestamp?: string;
      source?: "top5" | "candidate";
      llmWeight?: number;
      llmPolarity?: number;
      llmType?: string;
      llmCategory?: string;
      llmHeadline?: string;
      humanWeight?: number;
      humanPolarity?: number;
      humanType?: string;
      humanCorrect?: boolean;
      humanNote?: string;
    };
  }>("/telegram/news-feedback", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await requireProjectOwner(req, reply))) return;

    const body = req.body ?? {};
    const postKey = body.postKey?.trim();
    const day = body.day?.trim();
    const postText = body.postText?.trim() ?? "";
    const postTimestampRaw = body.postTimestamp?.trim();
    const source = body.source;
    const humanNote = body.humanNote?.trim() ?? "";

    if (!postKey || !day || !postTimestampRaw || (source !== "top5" && source !== "candidate")) {
      return reply.status(400).send({ error: "postKey, day, postTimestamp and source are required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return reply.status(400).send({ error: "Invalid day (YYYY-MM-DD)" });
    }
    if (!humanNote) {
      return reply.status(400).send({ error: "humanNote is required" });
    }

    const postTimestamp = new Date(postTimestampRaw);
    if (Number.isNaN(postTimestamp.getTime())) {
      return reply.status(400).send({ error: "Invalid postTimestamp" });
    }

    try {
      const saved = await saveFeedback(prisma, {
        postKey,
        day,
        postText,
        postTimestamp,
        source,
        llmWeight: body.llmWeight,
        llmPolarity: body.llmPolarity,
        llmType: body.llmType,
        llmCategory: body.llmCategory,
        llmHeadline: body.llmHeadline,
        humanWeight: body.humanWeight,
        humanPolarity: body.humanPolarity,
        humanType: body.humanType,
        humanCorrect: body.humanCorrect,
        humanNote,
      });
      return { ok: true, feedback: saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save feedback";
      return reply.status(503).send({ error: message });
    }
  });
}
