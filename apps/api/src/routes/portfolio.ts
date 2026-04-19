import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  addPortfolioGoal,
  deletePortfolioGoal,
  deletePortfolioTransaction,
  getPortfolioAssetDetail,
  getPortfolioChart,
  getPortfolioSummary,
  type PortfolioTimeframe,
  type PortfolioTransactionUpsertInput,
  updatePortfolioTransaction,
  validateAndCreateTransaction,
} from "../services/portfolioService.js";

function parseTimeframe(raw: string | undefined): PortfolioTimeframe {
  const v = raw?.trim().toLowerCase();
  if (v === "d" || v === "m" || v === "y" || v === "all") return v;
  return "all";
}

export function registerPortfolioRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/portfolio", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return getPortfolioSummary(prisma);
  });

  app.get<{
    Querystring: { timeframe?: string };
  }>("/portfolio/chart", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const timeframe = parseTimeframe(req.query.timeframe);
    return getPortfolioChart(prisma, timeframe);
  });

  app.post<{
    Body: PortfolioTransactionUpsertInput;
  }>("/portfolio/transaction", async (req, reply) => {
    try {
      const created = await validateAndCreateTransaction(prisma, req.body);
      return reply.status(201).send(created);
    } catch (err) {
      return reply
        .status(400)
        .send({ error: err instanceof Error ? err.message : "Unable to create transaction" });
    }
  });

  app.get<{
    Params: { symbol: string };
  }>("/portfolio/:symbol", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await getPortfolioAssetDetail(prisma, req.params.symbol);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "Not found" });
    }
  });

  app.put<{
    Params: { id: string };
    Body: Omit<PortfolioTransactionUpsertInput, "symbol">;
  }>("/portfolio/transaction/:id", async (req, reply) => {
    try {
      await updatePortfolioTransaction(prisma, req.params.id, req.body);
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Unable to update" });
    }
  });

  app.delete<{
    Params: { id: string };
  }>("/portfolio/transaction/:id", async (req, reply) => {
    try {
      await deletePortfolioTransaction(prisma, req.params.id);
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Unable to delete" });
    }
  });

  app.post<{
    Body: { symbol: string; targetPriceUsd: string };
  }>("/portfolio/goal", async (req, reply) => {
    try {
      const created = await addPortfolioGoal(prisma, req.body.symbol, req.body.targetPriceUsd);
      return reply.status(201).send(created);
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Unable to add goal" });
    }
  });

  app.delete<{
    Params: { id: string };
  }>("/portfolio/goal/:id", async (req, reply) => {
    try {
      await deletePortfolioGoal(prisma, req.params.id);
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Unable to delete goal" });
    }
  });
}
