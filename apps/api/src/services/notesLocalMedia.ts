import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "crypto";

const MEDIA_DIR = path.join(process.cwd(), "data", "notes-media");
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function isLocalNotesMediaEnabled(): boolean {
  if (process.env.NOTES_LOCAL_MEDIA === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function extFromContentType(contentType: string): string {
  const raw = contentType.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "jpg";
  return raw === "jpeg" ? "jpg" : raw;
}

function mediaPublicPrefix(): string {
  const raw = process.env.NOTES_MEDIA_PUBLIC_PREFIX?.trim();
  return raw && raw.startsWith("/") ? raw.replace(/\/$/, "") : "/api";
}

export function assertValidMediaKey(key: string): void {
  if (!/^[0-9a-f-]{36}\.(jpe?g|png|webp|gif|avif)$/i.test(key)) {
    throw new Error("Invalid media key");
  }
}

export function createLocalUploadUrls(contentType: string): {
  uploadUrl: string;
  publicUrl: string;
  key: string;
} {
  const ext = extFromContentType(contentType);
  const key = `${randomUUID()}.${ext}`;
  const prefix = mediaPublicPrefix();
  return {
    key,
    uploadUrl: `${prefix}/notes/local-upload/${key}`,
    publicUrl: `${prefix}/notes/media/${key}`,
  };
}

export async function saveLocalNoteMedia(key: string, body: Buffer, contentType: string): Promise<void> {
  assertValidMediaKey(key);
  const normalizedType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error("Unsupported image type");
  }
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const filePath = path.join(MEDIA_DIR, key);
  try {
    await fs.access(filePath);
    throw new Error("Upload already exists");
  } catch (err) {
    if (err instanceof Error && err.message === "Upload already exists") throw err;
  }
  await fs.writeFile(filePath, body);
  await fs.writeFile(path.join(MEDIA_DIR, `${key}.type`), normalizedType, "utf8");
}

export async function readLocalNoteMedia(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  assertValidMediaKey(key);
  try {
    const buffer = await fs.readFile(path.join(MEDIA_DIR, key));
    const contentType =
      (await fs.readFile(path.join(MEDIA_DIR, `${key}.type`), "utf8").catch(() => "image/jpeg")).trim() ||
      "image/jpeg";
    return { buffer, contentType };
  } catch {
    return null;
  }
}
