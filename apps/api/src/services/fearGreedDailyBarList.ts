import type { PrismaClient } from "@prisma/client";
import type { FearGreedDailyBarPoint, FearGreedDailyBarsResponse } from "@atlas-v1/shared";

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;

function clampLimit(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

export async function listFearGreedDailyBars(
  prisma: PrismaClient,
  options?: {
    limit?: number;
    from?: string;
    to?: string;
  },
): Promise<FearGreedDailyBarsResponse> {
  const limit = clampLimit(options?.limit);
  const where: {
    day?: { gte?: string; lte?: string };
  } = {};

  if (options?.from || options?.to) {
    where.day = {};
    if (options.from) where.day.gte = options.from;
    if (options.to) where.day.lte = options.to;
  }

  const rows = await prisma.fearGreedDailyBar.findMany({
    where,
    orderBy: { barTime: "desc" },
    take: limit,
  });

  const points: FearGreedDailyBarPoint[] = [...rows].reverse().map((row) => ({
    day: row.day,
    score: row.score,
    classification: row.classification,
    barTime: row.barTime.toISOString(),
  }));

  return { bars: points.length, points };
}
