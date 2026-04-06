import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

export function registerMarketRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/cryptocurrencies", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return prisma.cryptocurrencyList.findMany({
      orderBy: { symbol: "asc" },
    });
  });

  app.get<{
    Querystring: { pair?: string; days?: string };
  }>("/widgets/candles", async (req, reply) => {
    const pair = req.query.pair?.trim();
    const daysRaw = Number(req.query.days ?? 7);
    const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, Math.floor(daysRaw))) : 7;

    if (!pair) {
      return reply.status(400).send({ error: "query pair is required (e.g. BTCUSDT)" });
    }

    reply.header("Cache-Control", "no-store");

    const rows = await prisma.cryptoPriceCandle.findMany({
      where: { symbol: pair, interval: "1d" },
      orderBy: { openTime: "desc" },
      take: days,
    });

    const asc = [...rows].reverse();

    return asc.map((r) => ({
      openTime: r.openTime.toISOString(),
      open: r.open.toString(),
      high: r.high.toString(),
      low: r.low.toString(),
      close: r.close.toString(),
      volume: r.volume.toString(),
    }));
  });
}
