import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireSession, type SessionUser } from "./requireSession.js";

export const LOCAL_DEV_USER: SessionUser = {
  id: "local-dev",
  name: "Local Dev",
  email: "local-dev@atlas",
  emailVerified: true,
};

export function isNotesAuthSkipped(): boolean {
  if (process.env.NOTES_SKIP_AUTH === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function ensureLocalDevUser(prisma: PrismaClient): Promise<void> {
  await prisma.user.upsert({
    where: { id: LOCAL_DEV_USER.id },
    create: {
      id: LOCAL_DEV_USER.id,
      name: LOCAL_DEV_USER.name,
      email: LOCAL_DEV_USER.email,
      emailVerified: LOCAL_DEV_USER.emailVerified,
    },
    update: {},
  });
}

export async function requireNotesSession(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
): Promise<SessionUser | undefined> {
  if (isNotesAuthSkipped()) {
    await ensureLocalDevUser(prisma);
    return LOCAL_DEV_USER;
  }
  return requireSession(request, reply);
}
