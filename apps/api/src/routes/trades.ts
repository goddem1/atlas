import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireNotesSession } from "../middleware/requireNotesSession.js";
import {
  createUserTrade,
  deleteUserTrade,
  getTradeEquityCurve,
  getUserTrade,
  listUserTrades,
  type TradeListQuery,
  type TradeUpsertInput,
  updateUserTrade,
} from "../services/tradesService.js";

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

function tradesPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (request, reply) => {
      const user = await requireNotesSession(request, reply, prisma);
      if (!user) return;
      request.user = user;
    });

    app.get<{
      Querystring: {
        symbol?: string;
        direction?: string;
        from?: string;
        to?: string;
        pnlMin?: string;
        pnlMax?: string;
        period?: string;
      };
    }>("/trades", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const query: TradeListQuery = {
        symbol: req.query.symbol,
        direction: req.query.direction,
        from: req.query.from,
        to: req.query.to,
        pnlMin: req.query.pnlMin,
        pnlMax: req.query.pnlMax,
        period: req.query.period as TradeListQuery["period"],
      };
      return listUserTrades(prisma, req.user!.id, query);
    });

    app.get<{
      Querystring: { period?: string };
    }>("/trades/equity-curve", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return getTradeEquityCurve(prisma, req.user!.id, req.query.period);
    });

    app.get<{ Params: { id: string } }>("/trades/:id", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const trade = await getUserTrade(prisma, req.user!.id, req.params.id);
      if (!trade) return reply.status(404).send({ error: "Trade not found" });
      return trade;
    });

    app.post<{ Body: TradeUpsertInput }>("/trades", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const trade = await createUserTrade(prisma, req.user!.id, req.body ?? {});
        return reply.status(201).send(trade);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to create trade";
        return reply.status(400).send({ error: message });
      }
    });

    app.patch<{ Params: { id: string }; Body: TradeUpsertInput }>("/trades/:id", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const trade = await updateUserTrade(prisma, req.user!.id, req.params.id, req.body ?? {});
        if (!trade) return reply.status(404).send({ error: "Trade not found" });
        return trade;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update trade";
        return reply.status(400).send({ error: message });
      }
    });

    app.delete<{ Params: { id: string } }>("/trades/:id", async (req, reply) => {
      const ok = await deleteUserTrade(prisma, req.user!.id, req.params.id);
      if (!ok) return reply.status(404).send({ error: "Trade not found" });
      return reply.status(204).send();
    });
  };
}

export function registerTradesRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  void app.register(tradesPlugin(prisma));
}
