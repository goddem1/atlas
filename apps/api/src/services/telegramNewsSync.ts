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
  resetTelegramMtprotoClient,
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
import { isTelegramDisabled } from "./telegramFeature.js";

type Log = Pick<FastifyBaseLogger, "info" | "warn" | "error" | "debug">;

let syncRunning = false;
let syncStartedAt = 0;
let listenerStarted = false;
let catchUpTimer: ReturnType<typeof setInterval> | null = null;

/** Макс. длительность одного catch-up; иначе сбрасываем клиент и флаг. */
function catchUpTimeoutMs(): number {
  const raw = Number.parseInt(process.env.TELEGRAM_NEWS_CATCHUP_TIMEOUT_MS ?? "240000", 10);
  if (!Number.isFinite(raw)) return 240_000;
  return Math.min(900_000, Math.max(60_000, raw));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

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

async function runTelegramNewsCatchUpBody(
  prisma: PrismaClient,
  log: Log,
  usernames?: string[],
): Promise<void> {
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
}

export async function runTelegramNewsCatchUp(
  prisma: PrismaClient,
  log: Log,
  usernames?: string[],
): Promise<void> {
  if (!isTelegramMtprotoConfigured()) return;

  const timeoutMs = catchUpTimeoutMs();
  if (syncRunning) {
    const runningFor = syncStartedAt > 0 ? Date.now() - syncStartedAt : 0;
    if (runningFor > timeoutMs) {
      log.warn(
        { runningForMs: runningFor, timeoutMs },
        "[telegram-news] catch-up stuck — force reset",
      );
      syncRunning = false;
      syncStartedAt = 0;
      void resetTelegramMtprotoClient().catch((err) => {
        log.warn({ err }, "[telegram-news] force client reset failed");
      });
    } else {
      log.debug("[telegram-news] catch-up skipped (already running)");
      return;
    }
  }

  syncRunning = true;
  syncStartedAt = Date.now();
  try {
    await withTimeout(
      runTelegramNewsCatchUpBody(prisma, log, usernames),
      timeoutMs,
      "[telegram-news] catch-up",
    );
  } catch (err) {
    const timedOut = err instanceof Error && err.message.includes("timed out");
    if (timedOut) {
      log.warn({ err, timeoutMs }, "[telegram-news] catch-up timed out — resetting MTProto client");
      // Не блокируем finally на зависшем disconnect — иначе syncRunning залипает на часы.
      void resetTelegramMtprotoClient().catch((resetErr) => {
        log.warn({ err: resetErr }, "[telegram-news] client reset after timeout failed");
      });
    } else {
      throw err;
    }
  } finally {
    syncRunning = false;
    syncStartedAt = 0;
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
  if (isTelegramDisabled()) {
    log.info("[telegram-news] auto-sync disabled via TELEGRAM_DISABLED");
    return () => undefined;
  }
  if (!isTelegramMtprotoConfigured()) {
    log.warn("[telegram-news] auto-sync disabled (MTProto not configured)");
    return () => undefined;
  }
  if (process.env.TELEGRAM_NEWS_SYNC_DISABLED === "true") {
    log.warn("[telegram-news] auto-sync disabled via TELEGRAM_NEWS_SYNC_DISABLED");
    return () => undefined;
  }

  await ensureWatchedChannels(prisma, getDefaultTelegramChannels());

  try {
    await runTelegramNewsCatchUp(prisma, log);
  } catch (err) {
    log.warn({ err }, "[telegram-news] initial catch-up failed");
  }

  const intervalMin = Number.parseInt(process.env.TELEGRAM_NEWS_CATCHUP_MINUTES ?? "5", 10);
  const minutes = Math.max(2, Number.isFinite(intervalMin) ? intervalMin : 5);
  const timeoutMs = catchUpTimeoutMs();
  catchUpTimer = setInterval(() => {
    void runTelegramNewsCatchUp(prisma, log).catch((err) => {
      log.warn({ err }, "[telegram-news] scheduled catch-up failed");
    });
  }, minutes * 60_000);

  const liveListenerDisabled = process.env.TELEGRAM_NEWS_LIVE_LISTENER_DISABLED === "true";
  if (!listenerStarted && !liveListenerDisabled) {
    try {
      await attachNewMessageListener(prisma, log);
      listenerStarted = true;
    } catch (err) {
      log.warn({ err }, "[telegram-news] live listener failed to start");
    }
  } else if (liveListenerDisabled) {
    log.info("[telegram-news] live listener disabled (TELEGRAM_NEWS_LIVE_LISTENER_DISABLED)");
  }

  log.info(
    { catchUpMinutes: minutes, catchUpTimeoutMs: timeoutMs },
    "[telegram-news] auto-sync started (live events + catch-up)",
  );

  return () => {
    if (catchUpTimer) {
      clearInterval(catchUpTimer);
      catchUpTimer = null;
    }
  };
}
