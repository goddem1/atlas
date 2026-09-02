import type { Prisma, PrismaClient } from "@prisma/client";

export type NoteListItem = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  coverImageUrl: string | null;
};

export type NoteDetail = {
  id: string;
  title: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

const EMPTY_DOC: Prisma.InputJsonValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(extractTextFromNode).join("");
  }
  return "";
}

export function extractPreview(content: unknown, maxLen = 120): string {
  const text = extractTextFromNode(content).replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function findFirstImageUrl(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  if (n.type === "image") {
    const attrs = n.attrs;
    if (attrs && typeof attrs === "object") {
      const src = (attrs as Record<string, unknown>).src;
      if (typeof src === "string" && src.trim()) return src.trim();
    }
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      const found = findFirstImageUrl(child);
      if (found) return found;
    }
  }
  return null;
}

export function extractCoverImageUrl(content: unknown): string | null {
  return findFirstImageUrl(content);
}

function mapDetail(row: {
  id: string;
  title: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}): NoteDetail {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listUserNotes(prisma: PrismaClient, userId: string): Promise<NoteListItem[]> {
  const rows = await prisma.note.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, content: true, updatedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    preview: extractPreview(row.content),
    coverImageUrl: extractCoverImageUrl(row.content),
  }));
}

export async function getUserNote(
  prisma: PrismaClient,
  userId: string,
  noteId: string,
): Promise<NoteDetail | null> {
  const row = await prisma.note.findFirst({
    where: { id: noteId, userId },
  });
  return row ? mapDetail(row) : null;
}

export async function createUserNote(
  prisma: PrismaClient,
  userId: string,
  input: { title?: string; content?: unknown },
): Promise<NoteDetail> {
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Без названия";
  const content = input.content ?? EMPTY_DOC;
  const row = await prisma.note.create({
    data: { userId, title, content: content as Prisma.InputJsonValue },
  });
  return mapDetail(row);
}

export async function updateUserNote(
  prisma: PrismaClient,
  userId: string,
  noteId: string,
  input: { title?: string; content?: unknown },
): Promise<NoteDetail | null> {
  const existing = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!existing) return null;

  const data: Prisma.NoteUpdateInput = {};
  if (typeof input.title === "string") {
    data.title = input.title.trim() || "Без названия";
  }
  if (input.content !== undefined) {
    data.content = input.content as Prisma.InputJsonValue;
  }

  const row = await prisma.note.update({
    where: { id: noteId },
    data,
  });
  return mapDetail(row);
}

export async function deleteUserNote(
  prisma: PrismaClient,
  userId: string,
  noteId: string,
): Promise<boolean> {
  const existing = await prisma.note.findFirst({ where: { id: noteId, userId }, select: { id: true } });
  if (!existing) return false;
  await prisma.note.delete({ where: { id: noteId } });
  return true;
}
