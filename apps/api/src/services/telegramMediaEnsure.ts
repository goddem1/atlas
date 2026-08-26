import type { TelegramNewsMessage } from "@atlas-v1/shared";
import type { FastifyBaseLogger } from "fastify";
import {
  downloadTelegramChannelPhoto,
  downloadTelegramMessageImage,
  downloadTelegramMessageVideo,
  downloadTelegramMessageVideoThumb,
  TELEGRAM_VIDEO_MAX_BYTES,
} from "./telegramMtproto.js";
import {
  readCachedChannelPhoto,
  readCachedMessageImage,
  readCachedMessageVideo,
  readCachedVideoThumb,
  writeCachedChannelPhoto,
  writeCachedMessageImage,
  writeCachedMessageVideo,
  writeCachedVideoThumb,
  type CachedMedia,
} from "./telegramMediaCache.js";

type Log = Pick<FastifyBaseLogger, "debug" | "warn">;

export async function ensureChannelPhotoCached(username: string): Promise<Buffer | null> {
  const cached = await readCachedChannelPhoto(username);
  if (cached) return cached;
  const live = await downloadTelegramChannelPhoto(username);
  if (!live) return null;
  await writeCachedChannelPhoto(username, live);
  return live;
}

export async function ensureMessageImageCached(
  username: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const cached = await readCachedMessageImage(username, messageId);
  if (cached) return cached;
  const live = await downloadTelegramMessageImage(username, messageId);
  if (!live) return null;
  await writeCachedMessageImage(username, messageId, live);
  return live;
}

export async function ensureVideoThumbCached(
  username: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const cached = await readCachedVideoThumb(username, messageId);
  if (cached) return cached;
  const live = await downloadTelegramMessageVideoThumb(username, messageId);
  if (!live) return null;
  await writeCachedVideoThumb(username, messageId, live);
  return live;
}

export async function ensureMessageVideoCached(
  username: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const cached = await readCachedMessageVideo(username, messageId);
  if (cached) return cached;
  const live = await downloadTelegramMessageVideo(username, messageId);
  if (!live) return null;
  await writeCachedMessageVideo(username, messageId, live);
  return live;
}

/** Скачивает медиа для недавних постов в фоне sync (не блокирует надолго). */
export async function prefetchTelegramMessageMedia(
  username: string,
  messages: TelegramNewsMessage[],
  log?: Log,
): Promise<void> {
  for (const msg of messages) {
    try {
      if (msg.hasImage) {
        await ensureMessageImageCached(username, msg.id);
      }
      if (msg.hasVideoThumb) {
        await ensureVideoThumbCached(username, msg.id);
      }
      if (
        msg.hasVideo &&
        msg.videoSize != null &&
        msg.videoSize > 0 &&
        msg.videoSize <= TELEGRAM_VIDEO_MAX_BYTES
      ) {
        await ensureMessageVideoCached(username, msg.id);
      }
    } catch (err) {
      log?.debug?.({ err, username, messageId: msg.id }, "[telegram-news] media prefetch skipped");
    }
  }
}
