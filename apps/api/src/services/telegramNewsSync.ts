import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { Api } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import {
  getDefaultTelegramChannels,
  getTelegramClientForEvents,
  getTelegramNewsMessages,
  isTelegramMtprotoConfigured,
  listTelegramNewsChannels,
  mapApiMessageToNewsMessage,
  resolveChannelUsernameFromPeer,
} from "./telegramMtproto.js";
import {
  ensureWatchedChannels,
  getLatestMessageId,
  getStoredTelegramNewsMessages,
  listWatchedUsernames,
  pruneOldTelegramNewsPosts,
  updateChannelMeta,
  upsertTelegramNewsMessages,
} from "./telegramNewsStore.js";
import {
  ensureChannelPhotoCached,
  prefetchTelegramMessageMedia,
} from "./telegramMediaEnsure.js";

type Log = Pick<FastifyBaseLogger, "info" | "warn" | "error" | "debug">;

let syncRunning = false;
let listenerStarted = false;
let catchUpTimer: ReturnType<typeof setInterval> | null = null;

async function syncOneChannel(
  prisma: PrismaClient,
  log: Log,
  username: string,
): Promise<number> {
  const latestId = await getLatestMessageId(prisma, username);
  const limit = latestId > 0 ? 40 : 50;
  const live = await getTelegramNewsMessages(username, { limit });
  const fresh = latestId > 0 ? live.filter((m) => m.id > latestId) : live;
  if (fresh.length === 0) {
    await updateChannelMeta(prisma, username, {});
    return 0;
  }
  const n = await upsertTelegramNewsMessages(prisma, fresh);
  await updateChannelMeta(prisma, username, {});
  await prefetchTelegramMessageMedia(username, fresh, log);
  log.debug({ username, upserted: n, latestId }, "[telegram-news] channel sync");
  return n;
}

export async function runTelegramNewsCatchUp(
  prisma: PrismaClient,
  log: Log,
  usernames?: string[],
): Promise<void> {
  if (!isTelegramMtprotoConfigured()) return;
  if (syncRunning) {
    log.debug("[telegram-news] catch-up skipped (already running)");
    return;
  }
  syncRunning = true;
  try {
    if (usernames && usernames.length > 0) {
      await ensureWatchedChannels(prisma, usernames);
    } else {
      const existing = await listWatchedUsernames(prisma);
      if (existing.length === 0) {
        await ensureWatchedChannels(prisma, getDefaultTelegramChannels());
      }
    }

    const channels = await listWatchedUsernames(prisma);

    try {
      const meta = await listTelegramNewsChannels(channels);
      for (const ch of meta) {
        await updateChannelMeta(prisma, ch.username, {
          title: ch.title,
          hasPhoto: ch.hasPhoto,
        });
        if (ch.hasPhoto) {
          try {
            await ensureChannelPhotoCached(ch.username);
          } catch (err) {
            log.warn({ err, username: ch.username }, "[telegram-news] channel photo cache failed");
          }
        }
      }
    } catch (err) {
      log.warn({ err }, "[telegram-news] channel meta refresh failed");
    }

    let total = 0;
    for (const username of channels) {
      try {
        total += await syncOneChannel(prisma, log, username);
      } catch (err) {
        log.warn({ err, username }, "[telegram-news] channel sync failed");
      }
    }

    // Догрузить медиа для постов, уже лежащих в БД (первый запуск / после деплоя).
    for (const username of channels) {
      try {
        const recent = await getStoredTelegramNewsMessages(prisma, username, { limit: 30 });
        const needsMedia = recent.filter(
          (m) => m.hasImage || m.hasVideoThumb || m.hasVideo,
        );
        if (needsMedia.length > 0) {
          await prefetchTelegramMessageMedia(username, needsMedia, log);
        }
      } catch (err) {
        log.debug({ err, username }, "[telegram-news] backlog media prefetch skipped");
      }
    }

    const pruned = await pruneOldTelegramNewsPosts(prisma);
    log.info({ channels: channels.length, upserted: total, pruned }, "[telegram-news] catch-up done");
  } finally {
    syncRunning = false;
  }
}

async function attachNewMessageListener(prisma: PrismaClient, log: Log): Promise<void> {
  const client = await getTelegramClientForEvents();

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!(msg instanceof Api.Message)) return;
      if (!msg.peerId) return;

      const username = await resolveChannelUsernameFromPeer(msg.peerId);
      if (!username) return;

      const watched = new Set(await listWatchedUsernames(prisma));
      if (!watched.has(username)) return;

      const dto = mapApiMessageToNewsMessage(msg, username);
      await upsertTelegramNewsMessages(prisma, [dto]);
      log.debug({ username, messageId: dto.id }, "[telegram-news] live upsert");
    } catch (err) {
      log.warn({ err }, "[telegram-news] live handler error");
    }
  }, new NewMessage({}));
}

export async function startTelegramNewsAutoSync(
  prisma: PrismaClient,
  log: Log,
): Promise<() => void> {
  if (!isTelegramMtprotoConfigured()) {
    log.warn("[telegram-news] auto-sync disabled (MTProto not configured)");
    return () => undefined;
  }
  if (process.env.TELEGRAM_NEWS_SYNC_DISABLED === "true") {
    log.warn("[telegram-news] auto-sync disabled via TELEGRAM_NEWS_SYNC_DISABLED");
    return () => undefined;
  }

  await ensureWatchedChannels(prisma, getDefaultTelegramChannels());

  void runTelegramNewsCatchUp(prisma, log).catch((err) => {
    log.warn({ err }, "[telegram-news] initial catch-up failed");
  });

  const intervalMin = Number.parseInt(process.env.TELEGRAM_NEWS_CATCHUP_MINUTES ?? "5", 10);
  const minutes = Math.max(2, Number.isFinite(intervalMin) ? intervalMin : 5);
  catchUpTimer = setInterval(() => {
    void runTelegramNewsCatchUp(prisma, log).catch((err) => {
      log.warn({ err }, "[telegram-news] scheduled catch-up failed");
    });
  }, minutes * 60_000);

  if (!listenerStarted) {
    try {
      await attachNewMessageListener(prisma, log);
      listenerStarted = true;
    } catch (err) {
      log.warn({ err }, "[telegram-news] live listener failed to start");
    }
  }

  log.info({ catchUpMinutes: minutes }, "[telegram-news] auto-sync started (live events + catch-up)");

  return () => {
    if (catchUpTimer) {
      clearInterval(catchUpTimer);
      catchUpTimer = null;
    }
  };
}
