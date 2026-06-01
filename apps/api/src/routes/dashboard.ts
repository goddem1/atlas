import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { UserDashboardState } from "@atlas-v1/shared";
import { requireSession } from "../middleware/requireSession.js";
import { getUserDashboardState, saveUserDashboardState } from "../services/dashboardService.js";

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

function dashboardPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (request, reply) => {
      const user = await requireSession(request, reply);
      if (!user) return;
      request.user = user;
    });

    app.get("/dashboard/state", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return getUserDashboardState(prisma, req.user!.id);
    });

    app.put<{ Body: UserDashboardState }>("/dashboard/state", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return await saveUserDashboardState(prisma, req.user!.id, req.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid dashboard state";
        return reply.status(400).send({ error: message });
      }
    });
  };
}

export function registerDashboardRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  void app.register(dashboardPlugin(prisma));
}
