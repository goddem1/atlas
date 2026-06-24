import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const USER_AVATAR_PUBLIC_PATH = (userId: string) => `/profile/avatars/${userId}.webp`;

export type ProfileUserDto = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  updatedAt: string;
};

function toProfileUserDto(user: {
  id: string;
  name: string;
  email: string;
  image: string | null;
  updatedAt: Date;
}): ProfileUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    updatedAt: user.updatedAt.toISOString(),
  };
}

const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  updatedAt: true,
} as const;

function avatarFilePath(userId: string): string {
  return path.join(AVATAR_DIR, `${userId}.webp`);
}

export function parseAvatarDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1]!.toLowerCase();
  if (!ALLOWED_AVATAR_MIME.has(mime)) return null;
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) return null;
  return { mime, buffer };
}

export async function saveUserAvatarFile(userId: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const processed = await sharp(buffer)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
  await fs.writeFile(avatarFilePath(userId), processed);
}

export async function readUserAvatarFile(userId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(avatarFilePath(userId));
  } catch {
    return null;
  }
}

export async function deleteUserAvatarFile(userId: string): Promise<void> {
  try {
    await fs.unlink(avatarFilePath(userId));
  } catch {
    /* файла может не быть */
  }
}

export async function getProfileUser(prisma: PrismaClient, userId: string): Promise<ProfileUserDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  if (!user) {
    throw new Error("User not found");
  }
  return toProfileUserDto(user);
}

export async function updateProfileName(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<ProfileUserDto> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new Error("Name must be 1–80 characters");
  }
  return prisma.user
    .update({
      where: { id: userId },
      data: { name: trimmed },
      select: profileSelect,
    })
    .then(toProfileUserDto);
}

export async function updateProfileAvatar(
  prisma: PrismaClient,
  userId: string,
  dataUrl: string,
): Promise<ProfileUserDto> {
  const parsed = parseAvatarDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("Invalid image");
  }
  await deleteUserAvatarFile(userId);
  await saveUserAvatarFile(userId, parsed.buffer);
  const image = USER_AVATAR_PUBLIC_PATH(userId);
  return prisma.user
    .update({
      where: { id: userId },
      data: { image },
      select: profileSelect,
    })
    .then(toProfileUserDto);
}
