import type { PrismaClient } from "@prisma/client";
import type { MarketIndexDailyBarPoint, MarketIndexDailyBarsResponse } from "@atlas-v1/shared";
import { TV_MARKET_INDEX_SYMBOLS } from "./tradingViewPriceFetch.js";

const DEFAULT_LIMIT = 3300;
const MAX_LIMIT = 5000;

function clampLimit(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

export function isSupportedMarketIndexDailyBarId(indexId: string): boolean {
  return Object.prototype.hasOwnProperty.call(TV_MARKET_INDEX_SYMBOLS, indexId);
}

export async function listMarketIndexDailyBars(
  prisma: PrismaClient,
  options: {
    indexId: string;
    limit?: number;
    from?: string;
    to?: string;
  },
): Promise<MarketIndexDailyBarsResponse> {
  const limit = clampLimit(options.limit);
  const where: {
    indexId: string;
    interval: string;
    day?: { gte?: string; lte?: string };
  } = {
    indexId: options.indexId,
    interval: "1d",
  };

  if (options.from || options.to) {
    where.day = {};
    if (options.from) where.day.gte = options.from;
    if (options.to) where.day.lte = options.to;
  }

  const rows = await prisma.marketIndexDailyBar.findMany({
    where,
    orderBy: { openTime: "desc" },
    take: limit,
  });

  const points: MarketIndexDailyBarPoint[] = [...rows].reverse().map((row) => ({
    day: row.day,
    openTime: row.openTime.toISOString(),
    open: row.open?.toString() ?? null,
    high: row.high?.toString() ?? null,
    low: row.low?.toString() ?? null,
    close: row.close.toString(),
    volume: row.volume?.toString() ?? null,
  }));

  return {
    indexId: options.indexId,
    bars: points.length,
    points,
  };
}
