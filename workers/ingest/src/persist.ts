import { createHash } from "node:crypto";
import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

export type IncomingMessage = {
  tgMsgId: number;
  postedAt: Date;
  text: string;
  replyToTgMsgId: number | null;
  isForward: boolean;
  forwardedFrom: string | null;
  mediaKinds: string[];
  editedAt: Date | null;
};

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function upsertIncomingMessage(
  prisma: PrismaClient,
  channelId: string,
  incoming: IncomingMessage,
  backfilled: boolean,
): Promise<"created" | "versioned" | "unchanged"> {
  const existing = await prisma.message.findUnique({
    where: { channelId_tgMsgId: { channelId, tgMsgId: incoming.tgMsgId } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const hash = textHash(incoming.text);
  if (!existing) {
    const editedBeforeIngest = Boolean(
      backfilled &&
        incoming.editedAt &&
        incoming.editedAt.getTime() - incoming.postedAt.getTime() > 2 * 60 * 1000,
    );
    await prisma.message.create({
      data: {
        channelId,
        tgMsgId: incoming.tgMsgId,
        postedAt: incoming.postedAt,
        replyToTgMsgId: incoming.replyToTgMsgId,
        isForward: incoming.isForward,
        forwardedFrom: incoming.forwardedFrom,
        hasMedia: incoming.mediaKinds.length > 0,
        mediaKinds: incoming.mediaKinds,
        backfilled,
        editedBeforeIngest,
        versions: {
          create: {
            version: 1,
            text: incoming.text,
            editedAt: incoming.editedAt,
            textHash: hash,
          },
        },
      },
    });
    return "created";
  }
  const latest = existing.versions[0];
  if (latest?.textHash === hash) return "unchanged";
  await prisma.messageVersion.create({
    data: {
      messageId: existing.id,
      version: (latest?.version ?? 0) + 1,
      text: incoming.text,
      editedAt: incoming.editedAt,
      textHash: hash,
    },
  });
  return "versioned";
}

export async function markDeleted(prisma: PrismaClient, channelId: string, tgMsgIds: number[]): Promise<number> {
  if (tgMsgIds.length === 0) return 0;
  const result = await prisma.message.updateMany({
    where: { channelId, tgMsgId: { in: tgMsgIds }, isDeleted: false },
    data: { isDeleted: true, deletedDetectedAt: new Date() },
  });
  return result.count;
}
