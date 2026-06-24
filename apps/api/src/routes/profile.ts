import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireSession } from "../middleware/requireSession.js";
import {
  getProfileUser,
  readUserAvatarFile,
  updateProfileAvatar,
  updateProfileName,
} from "../services/profileService.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      image?: string | null;
    };
  }
}

function profilePublicPlugin(): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { userId: string } }>("/profile/avatars/:userId", async (req, reply) => {
      const userId = req.params.userId.replace(/\.webp$/i, "").trim();
      if (!userId) {
        return reply.status(404).send();
      }
      const file = await readUserAvatarFile(userId);
      if (!file) {
        return reply.status(404).send();
      }
      reply.header("Content-Type", "image/webp");
      reply.header("Cache-Control", "private, max-age=3600");
      return reply.send(file);
    });
  };
}

function profileMutationsPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (request, reply) => {
      const user = await requireSession(request, reply);
      if (!user) return;
      request.user = user;
    });

    app.get("/profile", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return await getProfileUser(prisma, req.user!.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Profile not found";
        return reply.status(404).send({ error: message });
      }
    });

    app.patch<{ Body: { name?: string } }>("/profile", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const name = typeof req.body?.name === "string" ? req.body.name : "";
        return await updateProfileName(prisma, req.user!.id, name);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid profile name";
        return reply.status(400).send({ error: message });
      }
    });

    app.post<{ Body: { dataUrl?: string } }>("/profile/avatar", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
      if (!dataUrl) {
        return reply.status(400).send({ error: "Image is required" });
      }
      try {
        return await updateProfileAvatar(prisma, req.user!.id, dataUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid image";
        return reply.status(400).send({ error: message });
      }
    });
  };
}

export function registerProfileRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  void app.register(profilePublicPlugin());
  void app.register(profileMutationsPlugin(prisma));
}
