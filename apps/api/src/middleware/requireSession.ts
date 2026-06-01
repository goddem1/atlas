import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session?.user) return null;
    return session.user as SessionUser;
  } catch (err) {
    request.log.error({ err }, "getSession failed");
    return null;
  }
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | undefined> {
  const user = await getSessionUser(request);
  if (!user) {
    await reply.status(401).send({ error: "Unauthorized" });
    return undefined;
  }
  return user;
}
