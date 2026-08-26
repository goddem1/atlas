import type {
  TelegramNewsChannel,
  TelegramNewsMessage,
  TelegramNewsTextEntity,
} from "@atlas-v1/shared";
import { TELEGRAM_CHANNELS_MAX, normalizeTelegramUsername, isValidTelegramChannelUsername } from "@atlas-v1/shared";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import {
  listTelegramSocksProxyCandidates,
  type TelegramSocksProxy,
} from "../lib/httpProxy.js";

export class TelegramMtprotoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramMtprotoUnavailableError";
  }
}

function parseChannelsEnv(): string[] {
  const raw = process.env.TELEGRAM_CHANNELS?.trim() ?? "cryptoattack24,markettwits";
  return normalizeUsernameList(raw.split(/[,;\s]+/));
}

function normalizeUsernameList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const username = normalizeTelegramUsername(item);
    if (!username || !isValidTelegramChannelUsername(username) || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= TELEGRAM_CHANNELS_MAX) break;
  }
  return out;
}

function readApiCredentials(): { apiId: number; apiHash: string; session: string } {
  const apiIdRaw = process.env.TELEGRAM_API_ID?.trim() ?? "";
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? "";
  const session = process.env.TELEGRAM_SESSION?.trim() ?? "";
  const apiId = Number.parseInt(apiIdRaw, 10);
  if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash || !session) {
    throw new TelegramMtprotoUnavailableError(
      "Telegram MTProto не настроен. Задайте TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION (см. pnpm telegram:auth).",
    );
  }
  return { apiId, apiHash, session };
}

const TELEGRAM_CONNECT_TIMEOUT_MS = Math.min(
  60_000,
  Math.max(5_000, Number.parseInt(process.env.TELEGRAM_CONNECT_TIMEOUT_MS ?? "20000", 10) || 20_000),
);

function proxyTimeoutError(hasProxy: boolean): TelegramMtprotoUnavailableError {
  return new TelegramMtprotoUnavailableError(
    hasProxy
      ? "Не удалось подключиться к Telegram через прокси (таймаут). Проверьте RAPIDAPI_PROXY_URL / TELEGRAM_PROXY_*."
      : "Не удалось подключиться к Telegram (таймаут). Задайте RAPIDAPI_PROXY_URL или TELEGRAM_PROXY_*.",
  );
}

async function connectClient(client: TelegramClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(proxyTimeoutError(listTelegramSocksProxyCandidates().length > 0));
        }, TELEGRAM_CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createConnectedClient(): Promise<TelegramClient> {
  const { apiId, apiHash, session } = readApiCredentials();
  const proxies = listTelegramSocksProxyCandidates();
  const attempts: Array<TelegramSocksProxy | undefined> =
    proxies.length > 0 ? proxies : [undefined];
  let lastErr: unknown;

  for (const proxy of attempts) {
    const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
      connectionRetries: 2,
      ...(proxy ? { proxy } : {}),
    });
    try {
      await connectClient(client);
      if (!(await client.isUserAuthorized())) {
        await client.disconnect();
        throw new TelegramMtprotoUnavailableError(
          "Telegram session не авторизована. Запустите pnpm telegram:auth и обновите TELEGRAM_SESSION.",
        );
      }
      return client;
    } catch (err) {
      lastErr = err;
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
      if (attempts.length === 1) break;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new TelegramMtprotoUnavailableError("Не удалось подключиться к Telegram.");
}

function detectMediaType(message: Api.Message): TelegramNewsMessage["mediaType"] {
  const media = message.media;
  if (!media) return null;
  if (media instanceof Api.MessageMediaPhoto) return "photo";
  if (media instanceof Api.MessageMediaDocument) {
    const info = getDocumentMimeAndSize(message);
    if (info) {
      if (info.mime.startsWith("video/") || info.isVideoAttr) return "video";
      if (info.mime.startsWith("audio/")) return "audio";
      if (info.mime.startsWith("image/")) return "photo";
    }
    return "document";
  }
  if (media instanceof Api.MessageMediaWebPage) return "webpage";
  return "other";
}

function messageHasDownloadableImage(message: Api.Message): boolean {
  const media = message.media;
  if (!media) return false;
  if (media instanceof Api.MessageMediaPhoto) return true;
  if (media instanceof Api.MessageMediaWebPage) {
    const page = media.webpage;
    return page instanceof Api.WebPage && Boolean(page.photo);
  }
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc && "mimeType" in doc && typeof doc.mimeType === "string") {
      return doc.mimeType.startsWith("image/");
    }
  }
  return false;
}

/** Лимит скачивания видео через API (байты). Крупнее — только ссылка в Telegram. */
export const TELEGRAM_VIDEO_MAX_BYTES = 40 * 1024 * 1024;

function getDocumentMimeAndSize(
  message: Api.Message,
): { mime: string; size: number; isVideoAttr: boolean } | null {
  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument)) return null;
  const doc = media.document;
  if (!doc || !("mimeType" in doc) || typeof doc.mimeType !== "string") return null;
  const size =
    "size" in doc && typeof doc.size === "number" && Number.isFinite(doc.size) ? doc.size : 0;
  const attrs = "attributes" in doc && Array.isArray(doc.attributes) ? doc.attributes : [];
  const isVideoAttr = attrs.some((a) => a instanceof Api.DocumentAttributeVideo);
  return { mime: doc.mimeType, size, isVideoAttr };
}

function messageHasDownloadableVideo(message: Api.Message): boolean {
  const info = getDocumentMimeAndSize(message);
  if (!info) return false;
  return info.mime.startsWith("video/") || info.isVideoAttr;
}

function messageHasVideoThumb(message: Api.Message): boolean {
  if (!messageHasDownloadableVideo(message)) return false;
  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument)) return false;
  const doc = media.document;
  if (!doc || !("thumbs" in doc) || !Array.isArray(doc.thumbs)) return false;
  return doc.thumbs.some(
    (t) =>
      !(t instanceof Api.PhotoSizeEmpty) &&
      !(t instanceof Api.PhotoPathSize),
  );
}

function messageVideoSize(message: Api.Message): number | null {
  if (!messageHasDownloadableVideo(message)) return null;
  const info = getDocumentMimeAndSize(message);
  return info && info.size > 0 ? info.size : null;
}

function sniffImageContentType(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function toBuffer(data: Buffer | string | undefined | null): Buffer | null {
  if (!data) return null;
  if (typeof data === "string") {
    if (!data) return null;
    return Buffer.from(data);
  }
  if (Buffer.isBuffer(data) && data.length > 0) return data;
  return null;
}

function previewText(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function extractTextEntities(message: Api.Message): TelegramNewsTextEntity[] {
  const raw = message.entities;
  if (!raw || raw.length === 0) return [];
  const out: TelegramNewsTextEntity[] = [];
  for (const entity of raw) {
    if (entity instanceof Api.MessageEntityUrl) {
      out.push({ offset: entity.offset, length: entity.length, type: "url" });
    } else if (entity instanceof Api.MessageEntityTextUrl) {
      out.push({
        offset: entity.offset,
        length: entity.length,
        type: "text_url",
        url: entity.url,
      });
    } else if (entity instanceof Api.MessageEntityMention) {
      out.push({ offset: entity.offset, length: entity.length, type: "mention" });
    } else if (entity instanceof Api.MessageEntityHashtag) {
      out.push({ offset: entity.offset, length: entity.length, type: "hashtag" });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

let clientPromise: Promise<TelegramClient> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();

function isAuthKeyDuplicated(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("AUTH_KEY_DUPLICATED")) return true;
  const code = (err as { code?: number; errorMessage?: string }).code;
  const errorMessage = (err as { errorMessage?: string }).errorMessage;
  return code === 406 || errorMessage === "AUTH_KEY_DUPLICATED";
}

async function resetTelegramClient(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (pending) {
    try {
      const client = await pending;
      await client.disconnect();
    } catch {
      // ignore
    }
  }
  // Telegram needs a moment to release the auth key after disconnect.
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/** Serialize MTProto calls and recover from duplicate session errors. */
function runTelegramOp<T>(op: () => Promise<T>): Promise<T> {
  const exec = async (): Promise<T> => {
    try {
      return await op();
    } catch (err) {
      if (isAuthKeyDuplicated(err)) {
        await resetTelegramClient();
        return op();
      }
      throw err;
    }
  };
  const result = opQueue.then(exec, exec);
  opQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function getClient(): Promise<TelegramClient> {
  if (!clientPromise) {
    clientPromise = createConnectedClient().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export function isTelegramMtprotoConfigured(): boolean {
  try {
    readApiCredentials();
    return true;
  } catch {
    return false;
  }
}

export function getDefaultTelegramChannels(): string[] {
  return parseChannelsEnv();
}

export function mapApiMessageToNewsMessage(
  msg: Api.Message,
  channelUsername: string,
): TelegramNewsMessage {
  const username = normalizeTelegramUsername(channelUsername);
  const text = msg.message ?? "";
  return {
    id: msg.id,
    channelUsername: username,
    date: new Date(msg.date * 1000).toISOString(),
    text,
    entities: extractTextEntities(msg),
    views: typeof msg.views === "number" ? msg.views : null,
    forwards: typeof msg.forwards === "number" ? msg.forwards : null,
    isForwarded: Boolean(msg.fwdFrom),
    hasMedia: Boolean(msg.media),
    hasImage: messageHasDownloadableImage(msg),
    hasVideo: messageHasDownloadableVideo(msg),
    hasVideoThumb: messageHasVideoThumb(msg),
    videoSize: messageVideoSize(msg),
    mediaType: detectMediaType(msg),
    url: `https://t.me/${username}/${msg.id}`,
  };
}

export async function getTelegramClientForEvents(): Promise<TelegramClient> {
  return runTelegramOp(() => getClient());
}

/** Resolve public username for a chat/channel peer (best-effort). */
export async function resolveChannelUsernameFromPeer(
  peer: unknown,
): Promise<string | null> {
  return runTelegramOp(async () => {
    try {
      const client = await getClient();
      const entity = await client.getEntity(peer as Parameters<TelegramClient["getEntity"]>[0]);
      if ("username" in entity && typeof entity.username === "string" && entity.username) {
        return normalizeTelegramUsername(entity.username);
      }
    } catch {
      // ignore
    }
    return null;
  });
}

export async function listTelegramNewsChannels(
  usernamesRaw?: string[],
): Promise<TelegramNewsChannel[]> {
  return runTelegramOp(async () => {
    const client = await getClient();
    const usernames =
      usernamesRaw !== undefined
        ? normalizeUsernameList(usernamesRaw)
        : parseChannelsEnv();
    const channels: TelegramNewsChannel[] = [];

    for (const username of usernames) {
      try {
        const entity = await client.getEntity(username);
        const title =
          "title" in entity && typeof entity.title === "string"
            ? entity.title
            : "firstName" in entity && typeof entity.firstName === "string"
              ? entity.firstName
              : username;

        let hasPhoto = false;
        if ("photo" in entity && entity.photo) {
          hasPhoto = !(entity.photo instanceof Api.ChatPhotoEmpty);
        }

        const recent = await client.getMessages(entity, { limit: 1 });
        const last = recent[0];
        const lastText = last && "message" in last ? String(last.message ?? "") : "";
        const lastAt =
          last && last.date
            ? new Date(last.date * 1000).toISOString()
            : null;

        channels.push({
          username,
          title,
          hasPhoto,
          lastMessagePreview: lastText ? previewText(lastText) : last?.media ? "[медиа]" : null,
          lastMessageAt: lastAt,
        });
      } catch (err) {
        channels.push({
          username,
          title: username,
          hasPhoto: false,
          lastMessagePreview: err instanceof Error ? `Ошибка: ${err.message}` : "Ошибка загрузки",
          lastMessageAt: null,
        });
      }
    }

    return channels;
  });
}

export async function getTelegramNewsMessages(
  usernameRaw: string,
  options: { limit?: number; offsetId?: number } = {},
): Promise<TelegramNewsMessage[]> {
  return runTelegramOp(async () => {
    const username = normalizeTelegramUsername(usernameRaw);
    if (!username) return [];

    const client = await getClient();
    const entity = await client.getEntity(username);
    const limit = Math.min(100, Math.max(1, options.limit ?? 40));
    const offsetId = options.offsetId && options.offsetId > 0 ? options.offsetId : 0;

    const messages = await client.getMessages(entity, {
      limit,
      ...(offsetId > 0 ? { offsetId } : {}),
    });

    const out: TelegramNewsMessage[] = [];
    for (const msg of messages) {
      if (!(msg instanceof Api.Message)) continue;
      out.push(mapApiMessageToNewsMessage(msg, username));
    }
    return out;
  });
}

export async function downloadTelegramChannelPhoto(usernameRaw: string): Promise<Buffer | null> {
  return runTelegramOp(async () => {
    const username = normalizeTelegramUsername(usernameRaw);
    if (!username) return null;

    const client = await getClient();
    const entity = await client.getEntity(username);
    const buffer = await client.downloadProfilePhoto(entity, { isBig: false });
    if (!buffer || typeof buffer === "string" || buffer.length === 0) return null;
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  });
}

export async function downloadTelegramMessageImage(
  usernameRaw: string,
  messageId: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return runTelegramOp(async () => {
    const username = normalizeTelegramUsername(usernameRaw);
    if (!username || !Number.isFinite(messageId) || messageId <= 0) return null;

    const client = await getClient();
    const entity = await client.getEntity(username);
    const messages = await client.getMessages(entity, { ids: [messageId] });
    const msg = messages[0];
    if (!(msg instanceof Api.Message) || !msg.media) return null;

    const media = msg.media;
    let downloaded: Buffer | string | undefined | null = null;
    let contentTypeHint: string | null = null;

    if (media instanceof Api.MessageMediaPhoto) {
      downloaded = (await client.downloadMedia(msg, {})) as Buffer | string | undefined;
    } else if (media instanceof Api.MessageMediaWebPage) {
      const page = media.webpage;
      if (page instanceof Api.WebPage && page.photo) {
        downloaded = (await client.downloadMedia(msg, {})) as Buffer | string | undefined;
      }
    } else if (media instanceof Api.MessageMediaDocument) {
      const doc = media.document;
      const mime =
        doc && "mimeType" in doc && typeof doc.mimeType === "string" ? doc.mimeType : "";
      if (mime.startsWith("image/")) {
        contentTypeHint = mime;
        downloaded = (await client.downloadMedia(msg, {})) as Buffer | string | undefined;
      }
    }

    const buffer = toBuffer(downloaded);
    if (!buffer) return null;
    return {
      buffer,
      contentType: contentTypeHint || sniffImageContentType(buffer),
    };
  });
}

export async function downloadTelegramMessageVideo(
  usernameRaw: string,
  messageId: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return runTelegramOp(async () => {
    const username = normalizeTelegramUsername(usernameRaw);
    if (!username || !Number.isFinite(messageId) || messageId <= 0) return null;

    const client = await getClient();
    const entity = await client.getEntity(username);
    const messages = await client.getMessages(entity, { ids: [messageId] });
    const msg = messages[0];
    if (!(msg instanceof Api.Message) || !messageHasDownloadableVideo(msg)) return null;

    const info = getDocumentMimeAndSize(msg);
    if (!info) return null;
    if (info.size > TELEGRAM_VIDEO_MAX_BYTES) {
      throw new TelegramMtprotoUnavailableError(
        `Видео слишком большое (${Math.round(info.size / (1024 * 1024))} МБ). Лимит ${Math.round(TELEGRAM_VIDEO_MAX_BYTES / (1024 * 1024))} МБ.`,
      );
    }

    const downloaded = (await client.downloadMedia(msg, {})) as Buffer | string | undefined;
    const buffer = toBuffer(downloaded);
    if (!buffer) return null;
    const contentType = info.mime.startsWith("video/") ? info.mime : "video/mp4";
    return { buffer, contentType };
  });
}

export async function downloadTelegramMessageVideoThumb(
  usernameRaw: string,
  messageId: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return runTelegramOp(async () => {
    const username = normalizeTelegramUsername(usernameRaw);
    if (!username || !Number.isFinite(messageId) || messageId <= 0) return null;

    const client = await getClient();
    const entity = await client.getEntity(username);
    const messages = await client.getMessages(entity, { ids: [messageId] });
    const msg = messages[0];
    if (!(msg instanceof Api.Message) || !messageHasVideoThumb(msg)) return null;

    const media = msg.media;
    if (!(media instanceof Api.MessageMediaDocument)) return null;
    const doc = media.document;
    if (!doc || !("thumbs" in doc) || !Array.isArray(doc.thumbs)) return null;

    const usable = doc.thumbs.filter(
      (t) =>
        t instanceof Api.PhotoSize ||
        t instanceof Api.PhotoCachedSize ||
        t instanceof Api.PhotoStrippedSize ||
        t instanceof Api.VideoSize ||
        t instanceof Api.PhotoSizeProgressive,
    );
    if (usable.length === 0) return null;

    const thumbSizeOf = (t: (typeof usable)[number]): number => {
      if (t instanceof Api.PhotoStrippedSize || t instanceof Api.PhotoCachedSize) {
        return t.bytes.length;
      }
      if (t instanceof Api.PhotoSize || t instanceof Api.VideoSize) return t.size;
      if (t instanceof Api.PhotoSizeProgressive) return Math.max(...t.sizes, 0);
      return 0;
    };
    const best = usable.reduce((a, b) => (thumbSizeOf(b) > thumbSizeOf(a) ? b : a));

    const downloaded = (await client.downloadMedia(msg, {
      thumb: best,
    })) as Buffer | string | undefined;

    const buffer = toBuffer(downloaded);
    if (!buffer) return null;
    return {
      buffer,
      contentType: sniffImageContentType(buffer),
    };
  });
}
