import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  dayFromFearGreedTimestamp,
  fetchFearGreedChartHistory,
  type FearGreedChartPoint,
} from "./fearGreedChartFetch.js";

const BATCH_SIZE = 100;

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export async function importFearGreedDailyBars(
  prisma: PrismaClient,
  options: {
    start: number;
    end: number;
    convertId?: number;
  },
): Promise<{
  fetched: number;
  upserted: number;
  oldestDay: string | null;
  newestDay: string | null;
}> {
  const points = await fetchFearGreedChartHistory(options);

  if (points.length === 0) {
    return { fetched: 0, upserted: 0, oldestDay: null, newestDay: null };
  }

  let upserted = 0;
  for (let offset = 0; offset < points.length; offset += BATCH_SIZE) {
    const chunk = points.slice(offset, offset + BATCH_SIZE);
    await prisma.$transaction(chunk.map((point) => upsertPoint(prisma, point)));
    upserted += chunk.length;
  }

  const oldest = points[0]!;
  const newest = points[points.length - 1]!;

  return {
    fetched: points.length,
    upserted,
    oldestDay: dayFromFearGreedTimestamp(oldest.timestampSec),
    newestDay: dayFromFearGreedTimestamp(newest.timestampSec),
  };
}

function upsertPoint(prisma: PrismaClient, point: FearGreedChartPoint) {
  const barTime = new Date(point.timestampSec * 1000);
  const day = dayFromFearGreedTimestamp(point.timestampSec);

  return prisma.fearGreedDailyBar.upsert({
    where: { day },
    create: {
      day,
      score: point.score,
      classification: point.classification,
      barTime,
      btcPrice: point.btcPrice == null ? null : toDecimal(point.btcPrice),
      btcVolume: point.btcVolume == null ? null : toDecimal(point.btcVolume),
    },
    update: {
      score: point.score,
      classification: point.classification,
      barTime,
      btcPrice: point.btcPrice == null ? null : toDecimal(point.btcPrice),
      btcVolume: point.btcVolume == null ? null : toDecimal(point.btcVolume),
    },
  });
}

export async function upsertFearGreedDailyBarFromLatest(
  prisma: PrismaClient,
  point: {
    day: string;
    barTime: Date;
    score: number;
    classification: string;
  },
): Promise<void> {
  const score = Math.round(Math.min(100, Math.max(0, point.score)));
  await prisma.fearGreedDailyBar.upsert({
    where: { day: point.day },
    create: {
      day: point.day,
      score,
      classification: point.classification,
      barTime: point.barTime,
      btcPrice: null,
      btcVolume: null,
    },
    update: {
      score,
      classification: point.classification,
      barTime: point.barTime,
    },
  });
}
