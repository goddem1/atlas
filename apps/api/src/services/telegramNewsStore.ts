import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  TelegramNewsChannel,
  TelegramNewsMessage,
  TelegramNewsTextEntity,
} from "@atlas-v1/shared";
import { TELEGRAM_CHANNELS_MAX, normalizeTelegramUsername } from "@atlas-v1/shared";
import { getDefaultTelegramChannels } from "./telegramMtproto.js";

function asEntities(raw: unknown): TelegramNewsTextEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw as TelegramNewsTextEntity[];
}

function previewText(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

export function newsMessageFromDbRow(row: {
  messageId: number;
  channelUsername: string;
  date: Date;
  text: string;
  entities: unknown;
  views: number | null;
  forwards: number | null;
  isForwarded: boolean;
  hasMedia: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  hasVideoThumb: boolean;
  videoSize: number | null;
  mediaType: string | null;
  url: string;
}): TelegramNewsMessage {
  return {
    id: row.messageId,
    channelUsername: row.channelUsername,
    date: row.date.toISOString(),
    text: row.text,
    entities: asEntities(row.entities),
    views: row.views,
    forwards: row.forwards,
    isForwarded: row.isForwarded,
    hasMedia: row.hasMedia,
    hasImage: row.hasImage,
    hasVideo: row.hasVideo,
    hasVideoThumb: row.hasVideoThumb,
    videoSize: row.videoSize,
    mediaType: (row.mediaType as TelegramNewsMessage["mediaType"]) ?? null,
    url: row.url,
  };
}

export async function ensureWatchedChannels(
  prisma: PrismaClient,
  usernamesRaw: string[],
): Promise<string[]> {
  const usernames = Array.from(
    new Set(
      usernamesRaw
        .map((u) => normalizeTelegramUsername(u))
        .filter(Boolean),
    ),
  ).slice(0, TELEGRAM_CHANNELS_MAX);

  for (const username of usernames) {
    await prisma.telegramWatchedChannel.upsert({
      where: { username },
      create: { username },
      update: { updatedAt: new Date() },
    });
  }
  return usernames;
}

export async function listWatchedUsernames(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.telegramWatchedChannel.findMany({
    select: { username: true },
    orderBy: { username: "asc" },
  });
  const fromDb = rows.map((r) => r.username);
  if (fromDb.length > 0) return fromDb.slice(0, TELEGRAM_CHANNELS_MAX);
  return getDefaultTelegramChannels();
}

/** Ключ поста: `channelUsername:messageId` → сообщения в порядке keys. */
export async function getTelegramMessagesByKeys(
  prisma: PrismaClient,
  keys: string[],
): Promise<TelegramNewsMessage[]> {
  const pairs: Array<{ channelUsername: string; messageId: number }> = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const idx = key.lastIndexOf(":");
    if (idx <= 0) continue;
    const channelUsername = normalizeTelegramUsername(key.slice(0, idx));
    const messageId = Number.parseInt(key.slice(idx + 1), 10);
    if (!channelUsername || !Number.isFinite(messageId)) continue;
    const id = `${channelUsername}:${messageId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    pairs.push({ channelUsername, messageId });
  }
  if (pairs.length === 0) return [];

  const rows = await prisma.telegramNewsPost.findMany({
    where: {
      OR: pairs.map((p) => ({
        channelUsername: p.channelUsername,
        messageId: p.messageId,
      })),
    },
  });
  const map = new Map(
    rows.map((row) => [`${row.channelUsername}:${row.messageId}`, newsMessageFromDbRow(row)]),
  );
  const out: TelegramNewsMessage[] = [];
  for (const key of keys) {
    const idx = key.lastIndexOf(":");
    if (idx <= 0) continue;
    const channelUsername = normalizeTelegramUsername(key.slice(0, idx));
    const messageId = Number.parseInt(key.slice(idx + 1), 10);
    const msg = map.get(`${channelUsername}:${messageId}`);
    if (msg) out.push(msg);
  }
  return out;
}

/** Список каналов с превью последнего поста из БД (для live UI слева). */
export async function listStoredTelegramChannels(
  prisma: PrismaClient,
  usernamesRaw?: string[],
): Promise<TelegramNewsChannel[]> {
  const usernames =
    usernamesRaw !== undefined
      ? await ensureWatchedChannels(prisma, usernamesRaw)
      : await listWatchedUsernames(prisma);

  if (usernames.length === 0) return [];

  const watched = await prisma.telegramWatchedChannel.findMany({
    where: { username: { in: usernames } },
  });
  const watchedByName = new Map(watched.map((w) => [w.username, w]));

  const channels: TelegramNewsChannel[] = [];
  for (const username of usernames) {
    const meta = watchedByName.get(username);
    const last = await prisma.telegramNewsPost.findFirst({
      where: { channelUsername: username },
      orderBy: { messageId: "desc" },
    });
    const lastMessagePreview = last
      ? last.text.trim()
        ? previewText(last.text)
        : last.hasMedia
          ? "[медиа]"
          : null
      : null;
    channels.push({
      username,
      title: meta?.title?.trim() || username,
      hasPhoto: meta?.hasPhoto ?? false,
      lastMessagePreview,
      lastMessageAt: last?.date.toISOString() ?? null,
    });
  }

  channels.sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return tb - ta;
  });
  return channels;
}

export async function upsertTelegramNewsMessages(
  prisma: PrismaClient,
  messages: TelegramNewsMessage[],
): Promise<number> {
  let n = 0;
  for (const msg of messages) {
    const username = normalizeTelegramUsername(msg.channelUsername);
    if (!username) continue;
    await prisma.telegramWatchedChannel.upsert({
      where: { username },
      create: { username },
      update: {},
    });
    await prisma.telegramNewsPost.upsert({
      where: {
        channelUsername_messageId: {
          channelUsername: username,
          messageId: msg.id,
        },
      },
      create: {
        channelUsername: username,
        messageId: msg.id,
        date: new Date(msg.date),
        text: msg.text,
        entities: msg.entities as object[],
        views: msg.views,
        forwards: msg.forwards,
        isForwarded: msg.isForwarded,
        hasMedia: msg.hasMedia,
        hasImage: msg.hasImage,
        hasVideo: msg.hasVideo,
        hasVideoThumb: msg.hasVideoThumb,
        videoSize: msg.videoSize,
        mediaType: msg.mediaType,
        url: msg.url,
      },
      update: {
        date: new Date(msg.date),
        text: msg.text,
        entities: msg.entities as object[],
        views: msg.views,
        forwards: msg.forwards,
        isForwarded: msg.isForwarded,
        hasMedia: msg.hasMedia,
        hasImage: msg.hasImage,
        hasVideo: msg.hasVideo,
        hasVideoThumb: msg.hasVideoThumb,
        videoSize: msg.videoSize,
        mediaType: msg.mediaType,
        url: msg.url,
      },
    });
    n += 1;
  }
  return n;
}

export async function getStoredTelegramNewsMessages(
  prisma: PrismaClient,
  usernameRaw: string,
  options: { limit?: number; offsetId?: number } = {},
): Promise<TelegramNewsMessage[]> {
  const username = normalizeTelegramUsername(usernameRaw);
  if (!username) return [];
  const limit = Math.min(100, Math.max(1, options.limit ?? 40));
  const offsetId = options.offsetId && options.offsetId > 0 ? options.offsetId : 0;

  const rows = await prisma.telegramNewsPost.findMany({
    where: {
      channelUsername: username,
      ...(offsetId > 0 ? { messageId: { lt: offsetId } } : {}),
    },
    orderBy: { messageId: "desc" },
    take: limit,
  });

  return rows.map(newsMessageFromDbRow);
}

/** Общая лента по нескольким каналам, свежие сверху. */
export async function getStoredTelegramFeed(
  prisma: PrismaClient,
  usernamesRaw: string[],
  options: { limit?: number; before?: string } = {},
): Promise<TelegramNewsMessage[]> {
  const usernames = Array.from(
    new Set(
      usernamesRaw
        .map((u) => normalizeTelegramUsername(u))
        .filter(Boolean),
    ),
  ).slice(0, TELEGRAM_CHANNELS_MAX);
  if (usernames.length === 0) return [];

  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const before = options.before ? new Date(options.before) : null;
  const beforeOk = before && !Number.isNaN(before.getTime());

  const rows = await prisma.telegramNewsPost.findMany({
    where: {
      channelUsername: { in: usernames },
      ...(beforeOk ? { date: { lt: before! } } : {}),
    },
    orderBy: [{ date: "desc" }, { messageId: "desc" }],
    take: limit,
  });

  return rows.map(newsMessageFromDbRow);
}

/** Все посты выбранных каналов за календарный день Europe/Moscow (YYYY-MM-DD). */
export async function getStoredTelegramFeedForMskDay(
  prisma: PrismaClient,
  usernamesRaw: string[],
  dayMsk: string,
): Promise<TelegramNewsMessage[]> {
  const usernames = Array.from(
    new Set(
      usernamesRaw
        .map((u) => normalizeTelegramUsername(u))
        .filter(Boolean),
    ),
  ).slice(0, TELEGRAM_CHANNELS_MAX);
  if (usernames.length === 0) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayMsk)) return [];

  const rows = await prisma.$queryRaw<
    Array<{
      messageId: number;
      channelUsername: string;
      date: Date;
      text: string;
      entities: unknown;
      views: number | null;
      forwards: number | null;
      isForwarded: boolean;
      hasMedia: boolean;
      hasImage: boolean;
      hasVideo: boolean;
      hasVideoThumb: boolean;
      videoSize: number | null;
      mediaType: string | null;
      url: string;
    }>
  >`
    SELECT
      "messageId", "channelUsername", date, text, entities, views, forwards,
      "isForwarded", "hasMedia", "hasImage", "hasVideo", "hasVideoThumb",
      "videoSize", "mediaType", url
    FROM "TelegramNewsPost"
    WHERE "channelUsername" IN (${Prisma.join(usernames)})
      AND (date AT TIME ZONE 'Europe/Moscow')::date = CAST(${dayMsk} AS date)
    ORDER BY date ASC, "messageId" ASC
  `;

  return rows.map(newsMessageFromDbRow);
}

export async function getLatestMessageId(
  prisma: PrismaClient,
  usernameRaw: string,
): Promise<number> {
  const username = normalizeTelegramUsername(usernameRaw);
  if (!username) return 0;
  const row = await prisma.telegramNewsPost.findFirst({
    where: { channelUsername: username },
    orderBy: { messageId: "desc" },
    select: { messageId: true },
  });
  return row?.messageId ?? 0;
}

export async function updateChannelMeta(
  prisma: PrismaClient,
  usernameRaw: string,
  meta: { title?: string; hasPhoto?: boolean },
): Promise<void> {
  const username = normalizeTelegramUsername(usernameRaw);
  if (!username) return;
  await prisma.telegramWatchedChannel.upsert({
    where: { username },
    create: {
      username,
      title: meta.title ?? null,
      hasPhoto: meta.hasPhoto ?? false,
      lastSyncAt: new Date(),
    },
    update: {
      ...(meta.title != null ? { title: meta.title } : {}),
      ...(meta.hasPhoto != null ? { hasPhoto: meta.hasPhoto } : {}),
      lastSyncAt: new Date(),
    },
  });
}

/** Optional retention. 0 / unset = keep forever (accumulate forward). */
export async function pruneOldTelegramNewsPosts(prisma: PrismaClient): Promise<number> {
  const daysRaw = process.env.TELEGRAM_NEWS_RETENTION_DAYS?.trim() ?? "0";
  const days = Number.parseInt(daysRaw, 10);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const res = await prisma.telegramNewsPost.deleteMany({
    where: { date: { lt: cutoff } },
  });
  return res.count;
}
