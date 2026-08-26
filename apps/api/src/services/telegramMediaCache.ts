import fs from "node:fs/promises";
import path from "node:path";
import { normalizeTelegramUsername } from "@atlas-v1/shared";

export type CachedMedia = { buffer: Buffer; contentType: string };

const ROOT = path.join(process.cwd(), "data", "telegram-media");

function safeUsername(usernameRaw: string): string | null {
  const username = normalizeTelegramUsername(usernameRaw);
  if (!username) return null;
  return username.replace(/[^a-z0-9_]/g, "");
}

function channelPhotoFile(usernameRaw: string): string | null {
  const username = safeUsername(usernameRaw);
  if (!username) return null;
  return path.join(ROOT, "channels", `${username}.jpg`);
}

function messageDir(usernameRaw: string, messageId: number): string | null {
  const username = safeUsername(usernameRaw);
  if (!username || !Number.isFinite(messageId) || messageId <= 0) return null;
  return path.join(ROOT, username, String(messageId));
}

async function readTypeFile(typePath: string, fallback: string): Promise<string> {
  try {
    const raw = (await fs.readFile(typePath, "utf8")).trim();
    return raw || fallback;
  } catch {
    return fallback;
  }
}

async function readBinaryFile(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeBinaryWithType(
  filePath: string,
  typePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  await fs.writeFile(typePath, contentType);
}

export async function readCachedChannelPhoto(usernameRaw: string): Promise<Buffer | null> {
  const file = channelPhotoFile(usernameRaw);
  if (!file) return null;
  return readBinaryFile(file);
}

export async function writeCachedChannelPhoto(usernameRaw: string, buffer: Buffer): Promise<void> {
  const file = channelPhotoFile(usernameRaw);
  if (!file) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
}

export async function readCachedMessageImage(
  usernameRaw: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return null;
  const file = path.join(dir, "image.bin");
  const buffer = await readBinaryFile(file);
  if (!buffer) return null;
  const contentType = await readTypeFile(path.join(dir, "image.type"), "image/jpeg");
  return { buffer, contentType };
}

export async function writeCachedMessageImage(
  usernameRaw: string,
  messageId: number,
  media: CachedMedia,
): Promise<void> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return;
  await writeBinaryWithType(
    path.join(dir, "image.bin"),
    path.join(dir, "image.type"),
    media.buffer,
    media.contentType,
  );
}

export async function readCachedVideoThumb(
  usernameRaw: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return null;
  const file = path.join(dir, "video-thumb.bin");
  const buffer = await readBinaryFile(file);
  if (!buffer) return null;
  const contentType = await readTypeFile(path.join(dir, "video-thumb.type"), "image/jpeg");
  return { buffer, contentType };
}

export async function writeCachedVideoThumb(
  usernameRaw: string,
  messageId: number,
  media: CachedMedia,
): Promise<void> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return;
  await writeBinaryWithType(
    path.join(dir, "video-thumb.bin"),
    path.join(dir, "video-thumb.type"),
    media.buffer,
    media.contentType,
  );
}

export async function readCachedMessageVideo(
  usernameRaw: string,
  messageId: number,
): Promise<CachedMedia | null> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return null;
  const file = path.join(dir, "video.bin");
  const buffer = await readBinaryFile(file);
  if (!buffer) return null;
  const contentType = await readTypeFile(path.join(dir, "video.type"), "video/mp4");
  return { buffer, contentType };
}

export async function writeCachedMessageVideo(
  usernameRaw: string,
  messageId: number,
  media: CachedMedia,
): Promise<void> {
  const dir = messageDir(usernameRaw, messageId);
  if (!dir) return;
  await writeBinaryWithType(
    path.join(dir, "video.bin"),
    path.join(dir, "video.type"),
    media.buffer,
    media.contentType,
  );
}
