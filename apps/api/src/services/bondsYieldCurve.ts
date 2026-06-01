import type { PrismaClient } from "@prisma/client";

/** Порядок сроков на оси X (кривая Treasury). */
export const BONDS_YIELD_TENORS = [
  "1M",
  "3M",
  "6M",
  "1Y",
  "2Y",
  "3Y",
  "5Y",
  "7Y",
  "10Y",
  "20Y",
  "30Y",
] as const;

const INTERVAL = "1D";

export type BondsYieldCurvePointDto = {
  symbol: string;
  close: string | null;
};

export type BondsYieldCurveResponseDto = {
  tenors: string[];
  asOfDate: string | null;
  monthAgoDate: string | null;
  compareDays: BondsYieldCompareDays;
  current: BondsYieldCurvePointDto[];
  monthAgo: BondsYieldCurvePointDto[];
};

export const BONDS_YIELD_COMPARE_DAYS_ALLOWED = [7, 30, 90, 180, 365] as const;
export type BondsYieldCompareDays = (typeof BONDS_YIELD_COMPARE_DAYS_ALLOWED)[number];

export const BONDS_YIELD_DEFAULT_COMPARE_DAYS: BondsYieldCompareDays = 30;

/** Сколько последних торговых дат отдаём в календарь попапа (по умолчанию). */
export const BONDS_YIELD_DATES_DEFAULT_LIMIT = 756;

/** Верхняя граница limit в query (≈3 года торговых дней и запас). */
export const BONDS_YIELD_DATES_MAX_LIMIT = 2500;

export function normalizeBondsYieldCompareDays(raw: unknown): BondsYieldCompareDays {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (typeof n === "number" && Number.isFinite(n) && (BONDS_YIELD_COMPARE_DAYS_ALLOWED as readonly number[]).includes(n)) {
    return n as BondsYieldCompareDays;
  }
  return BONDS_YIELD_DEFAULT_COMPARE_DAYS;
}

function daysBeforeUtc(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - days);
  return x;
}

async function latestCloseForSymbol(
  prisma: PrismaClient,
  symbol: string,
  onOrBefore: Date,
): Promise<{ closeTime: Date; close: { toString(): string } } | null> {
  return prisma.bondsPrices.findFirst({
    where: {
      symbol,
      interval: INTERVAL,
      closeTime: { lte: onOrBefore },
    },
    orderBy: { closeTime: "desc" },
    select: { closeTime: true, close: true },
  });
}

const bondsCurveDateWhere = {
  interval: INTERVAL,
  symbol: { in: [...BONDS_YIELD_TENORS] as string[] },
};

export async function getBondsYieldCurveAvailableDates(
  prisma: PrismaClient,
  limit = BONDS_YIELD_DATES_DEFAULT_LIMIT,
): Promise<string[]> {
  const rows = await prisma.bondsPrices.groupBy({
    by: ["closeTime"],
    where: bondsCurveDateWhere,
    orderBy: { closeTime: "desc" },
    take: limit,
  });
  return rows.map((r) => r.closeTime.toISOString());
}

export async function getBondsYieldCurveDateBounds(
  prisma: PrismaClient,
): Promise<{ min: string | null; max: string | null }> {
  const [minRow, maxRow] = await Promise.all([
    prisma.bondsPrices.findFirst({
      where: bondsCurveDateWhere,
      orderBy: { closeTime: "asc" },
      select: { closeTime: true },
    }),
    prisma.bondsPrices.findFirst({
      where: bondsCurveDateWhere,
      orderBy: { closeTime: "desc" },
      select: { closeTime: true },
    }),
  ]);
  return {
    min: minRow?.closeTime.toISOString() ?? null,
    max: maxRow?.closeTime.toISOString() ?? null,
  };
}

/** month: 1–12 (UTC). */
export async function getBondsYieldCurveDatesForMonth(
  prisma: PrismaClient,
  year: number,
  month: number,
): Promise<string[]> {
  if (!Number.isFinite(year) || month < 1 || month > 12) return [];
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const rows = await prisma.bondsPrices.groupBy({
    by: ["closeTime"],
    where: {
      ...bondsCurveDateWhere,
      closeTime: { gte: start, lte: end },
    },
    orderBy: { closeTime: "asc" },
  });
  return rows.map((r) => r.closeTime.toISOString());
}

export async function getBondsYieldCurveNeighborDate(
  prisma: PrismaClient,
  fromIso: string,
  direction: "prev" | "next",
): Promise<string | null> {
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return null;

  const rows = await prisma.bondsPrices.groupBy({
    by: ["closeTime"],
    where: {
      ...bondsCurveDateWhere,
      closeTime: direction === "prev" ? { lt: from } : { gt: from },
    },
    orderBy: { closeTime: direction === "prev" ? "desc" : "asc" },
    take: 1,
  });
  return rows[0]?.closeTime.toISOString() ?? null;
}

export async function getBondsYieldCurve(
  prisma: PrismaClient,
  compareDays: BondsYieldCompareDays = BONDS_YIELD_DEFAULT_COMPARE_DAYS,
  asOfDateInput?: string | null,
): Promise<BondsYieldCurveResponseDto> {
  let asOf: Date | null = null;
  if (asOfDateInput) {
    const parsed = new Date(asOfDateInput);
    if (Number.isFinite(parsed.getTime())) asOf = parsed;
  }

  if (!asOf) {
    const latestRow = await prisma.bondsPrices.findFirst({
      where: { interval: INTERVAL, symbol: { in: [...BONDS_YIELD_TENORS] } },
      orderBy: { closeTime: "desc" },
      select: { closeTime: true },
    });
    asOf = latestRow?.closeTime ?? null;
  }
  if (!asOf) {
    return {
      tenors: [...BONDS_YIELD_TENORS],
      asOfDate: null,
      monthAgoDate: null,
      compareDays,
      current: BONDS_YIELD_TENORS.map((symbol) => ({ symbol, close: null })),
      monthAgo: BONDS_YIELD_TENORS.map((symbol) => ({ symbol, close: null })),
    };
  }

  const monthTarget = daysBeforeUtc(asOf, compareDays);
  let monthAgoResolved: Date | null = null;

  const current: BondsYieldCurvePointDto[] = [];
  const monthAgo: BondsYieldCurvePointDto[] = [];

  for (const symbol of BONDS_YIELD_TENORS) {
    const cur = await latestCloseForSymbol(prisma, symbol, asOf);
    current.push({
      symbol,
      close: cur ? cur.close.toString() : null,
    });

    const past = await latestCloseForSymbol(prisma, symbol, monthTarget);
    if (past) {
      if (!monthAgoResolved || past.closeTime > monthAgoResolved) {
        monthAgoResolved = past.closeTime;
      }
    }
    monthAgo.push({
      symbol,
      close: past ? past.close.toString() : null,
    });
  }

  return {
    tenors: [...BONDS_YIELD_TENORS],
    asOfDate: asOf.toISOString(),
    monthAgoDate: monthAgoResolved?.toISOString() ?? null,
    compareDays,
    current,
    monthAgo,
  };
}
