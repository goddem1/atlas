import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { KlineDrawingToolPin, KlineStoredOverlay } from "@atlas-v1/shared";
import { normalizeKlinePairSymbol } from "@atlas-v1/shared";
import { requireSession } from "../middleware/requireSession.js";
import {
  getUserKlineDrawingPins,
  getUserKlineOverlays,
  saveUserKlineDrawingPins,
  saveUserKlineOverlays,
} from "../services/klineChartPrefsService.js";

function klineChartPrefsPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (request, reply) => {
      const user = await requireSession(request, reply);
      if (!user) return;
      request.user = user;
    });

    app.get("/kline-chart/drawing-pins", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const pins = await getUserKlineDrawingPins(prisma, req.user!.id);
      return { pins };
    });

    app.put<{ Body: { pins?: KlineDrawingToolPin[] } }>("/kline-chart/drawing-pins", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const pins = await saveUserKlineDrawingPins(prisma, req.user!.id, req.body?.pins ?? []);
      return { pins };
    });

    app.get<{ Params: { pair: string } }>("/kline-chart/overlays/:pair", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const pair = normalizeKlinePairSymbol(req.params.pair ?? "");
      if (!pair) return reply.status(400).send({ error: "Invalid pair" });
      const overlays = await getUserKlineOverlays(prisma, req.user!.id, pair);
      return { overlays };
    });

    app.put<{ Params: { pair: string }; Body: { overlays?: KlineStoredOverlay[] } }>(
      "/kline-chart/overlays/:pair",
      async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        const pair = normalizeKlinePairSymbol(req.params.pair ?? "");
        if (!pair) return reply.status(400).send({ error: "Invalid pair" });
        const overlays = await saveUserKlineOverlays(
          prisma,
          req.user!.id,
          pair,
          req.body?.overlays ?? [],
        );
        return { overlays };
      },
    );
  };
}

export function registerKlineChartPrefsRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  void app.register(klineChartPrefsPlugin(prisma));
}
