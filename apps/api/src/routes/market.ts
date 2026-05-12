import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { fetchRestMskDailyCandle, getLiveCandle, toMskDayStartMs } from "../services/binanceCandleStream.js";

function toApiRow(row: {
  openTime: Date;
  open: { toString(): string };
  high: { toString(): string };
  low: { toString(): string };
  close: { toString(): string };
  volume: { toString(): string };
}) {
  return {
    openTime: row.openTime.toISOString(),
    open: row.open.toString(),
    high: row.high.toString(),
    low: row.low.toString(),
    close: row.close.toString(),
    volume: row.volume.toString(),
  };
}

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

    const symbol = pair.toUpperCase();
    const currentDayStartMs = toMskDayStartMs(Date.now());
    const memoryLive = getLiveCandle(symbol);
    const live =
      memoryLive?.openTimeMs === currentDayStartMs
        ? memoryLive
        : await fetchRestMskDailyCandle(symbol, currentDayStartMs);

    if (!live) {
      const rows = await prisma.cryptoPriceCandle.findMany({
        where: { symbol, interval: "1d" },
        orderBy: { openTime: "desc" },
        take: days,
      });
      return [...rows].reverse().map(toApiRow);
    }

    const historyRows = await prisma.cryptoPriceCandle.findMany({
      where: {
        symbol,
        interval: "1d",
        openTime: { lt: new Date(currentDayStartMs) },
      },
      orderBy: { openTime: "desc" },
      take: Math.max(days - 1, 0),
    });

    const response = [
      ...historyRows.reverse().map(toApiRow),
      {
        openTime: new Date(live.openTimeMs).toISOString(),
        open: live.open,
        high: live.high,
        low: live.low,
        close: live.close,
        volume: live.volume,
      },
    ];

    return response.slice(-days);
  });
}
