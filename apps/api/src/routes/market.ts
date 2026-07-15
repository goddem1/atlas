import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  BONDS_YIELD_DATES_DEFAULT_LIMIT,
  BONDS_YIELD_DATES_MAX_LIMIT,
  getBondsYieldCurve,
  getBondsYieldCurveAvailableDates,
  getBondsYieldCurveDateBounds,
  getBondsYieldCurveDatesForMonth,
  getBondsYieldCurveNeighborDate,
  normalizeBondsYieldCompareDays,
} from "../services/bondsYieldCurve.js";
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
    const days = Number.isFinite(daysRaw) ? Math.min(2000, Math.max(1, Math.floor(daysRaw))) : 7;

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

  app.get<{ Querystring: { compareDays?: string; asOfDate?: string } }>("/widgets/bonds-yield-curve", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const compareDays = normalizeBondsYieldCompareDays(req.query.compareDays);
    const asOfDate = typeof req.query.asOfDate === "string" ? req.query.asOfDate : null;
    return getBondsYieldCurve(prisma, compareDays, asOfDate);
  });

  app.get("/widgets/bonds-yield-curve/dates/bounds", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return getBondsYieldCurveDateBounds(prisma);
  });

  app.get<{ Querystring: { year?: string; month?: string } }>(
    "/widgets/bonds-yield-curve/dates/month",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const year = Number.parseInt(req.query.year ?? "", 10);
      const month = Number.parseInt(req.query.month ?? "", 10);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return reply.status(400).send({ error: "query year and month are required (month 1–12)" });
      }
      const dates = await getBondsYieldCurveDatesForMonth(prisma, year, month);
      return { dates };
    },
  );

  app.get<{ Querystring: { date?: string; direction?: string } }>(
    "/widgets/bonds-yield-curve/dates/neighbor",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const date = typeof req.query.date === "string" ? req.query.date.trim() : "";
      const direction = req.query.direction === "next" ? "next" : req.query.direction === "prev" ? "prev" : null;
      if (!date || !direction) {
        return reply.status(400).send({ error: "query date and direction=prev|next are required" });
      }
      const neighbor = await getBondsYieldCurveNeighborDate(prisma, date, direction);
      return { date: neighbor };
    },
  );

  app.get<{ Querystring: { limit?: string } }>("/widgets/bonds-yield-curve/dates", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const limitRaw = req.query.limit ? Number.parseInt(req.query.limit, 10) : BONDS_YIELD_DATES_DEFAULT_LIMIT;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(BONDS_YIELD_DATES_MAX_LIMIT, Math.max(1, limitRaw))
      : BONDS_YIELD_DATES_DEFAULT_LIMIT;
    const dates = await getBondsYieldCurveAvailableDates(prisma, limit);
    return { dates };
  });
}
