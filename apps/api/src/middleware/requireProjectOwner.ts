import type { FastifyReply, FastifyRequest } from "fastify";
import { requireSession, type SessionUser } from "./requireSession.js";

const LOCAL_DEV_OWNER: SessionUser = {
  id: "local-dev",
  name: "Local Dev",
  email: "local-dev@atlas",
  emailVerified: true,
};

function isNewsFeedbackAuthSkipped(): boolean {
  if (process.env.NEWS_FEEDBACK_SKIP_AUTH === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function requireProjectOwner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | undefined> {
  if (isNewsFeedbackAuthSkipped()) {
    return LOCAL_DEV_OWNER;
  }

  const user = await requireSession(request, reply);
  if (!user) return undefined;

  const ownerEmail = process.env.NEWS_FEEDBACK_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    await reply.status(503).send({
      error: "NEWS_FEEDBACK_OWNER_EMAIL is not configured",
    });
    return undefined;
  }

  if (user.email.trim().toLowerCase() !== ownerEmail) {
    await reply.status(403).send({ error: "Forbidden" });
    return undefined;
  }

  return user;
}