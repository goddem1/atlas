import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  fetchTradingViewPriceHistory,
  resolveTvMarketIndexSymbol,
  type TvHistoryBar,
} from "./tradingViewPriceFetch.js";

const BATCH_SIZE = 100;

function dayFromUnixSeconds(timeSec: number): string {
  return new Date(timeSec * 1000).toISOString().slice(0, 10);
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export async function importMarketIndexDailyBars(
  prisma: PrismaClient,
  options: {
    indexId: string;
    symbol?: string;
    range?: number;
    timeframe?: string;
    to?: string | number;
  },
): Promise<{
  indexId: string;
  symbol: string;
  fetched: number;
  upserted: number;
  oldestDay: string | null;
  newestDay: string | null;
}> {
  const range = options.range ?? 3300;
  const symbol = resolveTvMarketIndexSymbol(options.indexId, options.symbol);
  const { bars } = await fetchTradingViewPriceHistory({
    symbol,
    range,
    timeframe: options.timeframe,
    to: options.to,
  });

  if (bars.length === 0) {
    return {
      indexId: options.indexId,
      symbol,
      fetched: 0,
      upserted: 0,
      oldestDay: null,
      newestDay: null,
    };
  }

  let upserted = 0;
  for (let offset = 0; offset < bars.length; offset += BATCH_SIZE) {
    const chunk = bars.slice(offset, offset + BATCH_SIZE);
    await prisma.$transaction(
      chunk.map((bar) => upsertBar(prisma, options.indexId, bar)),
    );
    upserted += chunk.length;
  }

  const oldest = bars[0]!;
  const newest = bars[bars.length - 1]!;

  return {
    indexId: options.indexId,
    symbol,
    fetched: bars.length,
    upserted,
    oldestDay: dayFromUnixSeconds(oldest.time),
    newestDay: dayFromUnixSeconds(newest.time),
  };
}

function upsertBar(prisma: PrismaClient, indexId: string, bar: TvHistoryBar) {
  const openTime = new Date(bar.time * 1000);
  const day = dayFromUnixSeconds(bar.time);

  return prisma.marketIndexDailyBar.upsert({
    where: {
      indexId_interval_openTime: {
        indexId,
        interval: "1d",
        openTime,
      },
    },
    create: {
      indexId,
      interval: "1d",
      day,
      openTime,
      open: toDecimal(bar.open),
      high: toDecimal(bar.high),
      low: toDecimal(bar.low),
      close: toDecimal(bar.close),
      volume: bar.volume == null ? null : toDecimal(bar.volume),
    },
    update: {
      day,
      open: toDecimal(bar.open),
      high: toDecimal(bar.high),
      low: toDecimal(bar.low),
      close: toDecimal(bar.close),
      volume: bar.volume == null ? null : toDecimal(bar.volume),
    },
  });
}

export async function upsertMarketIndexDailyBarByDay(
  prisma: PrismaClient,
  indexId: string,
  bar: TvHistoryBar,
): Promise<void> {
  const openTime = new Date(bar.time * 1000);
  const day = dayFromUnixSeconds(bar.time);
  const data = {
    day,
    openTime,
    open: toDecimal(bar.open),
    high: toDecimal(bar.high),
    low: toDecimal(bar.low),
    close: toDecimal(bar.close),
    volume: bar.volume == null ? null : toDecimal(bar.volume),
  };

  const existing = await prisma.marketIndexDailyBar.findFirst({
    where: { indexId, interval: "1d", day },
  });

  if (existing) {
    await prisma.marketIndexDailyBar.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.marketIndexDailyBar.create({
    data: {
      indexId,
      interval: "1d",
      ...data,
    },
  });
}

export async function upsertCmcScalarMarketIndexDailyBar(
  prisma: PrismaClient,
  indexId: string,
  day: string,
  openTime: Date,
  value: number,
): Promise<void> {
  const dec = toDecimal(value);
  const data = {
    day,
    openTime,
    open: dec,
    high: dec,
    low: dec,
    close: dec,
    volume: null as null,
  };

  const existing = await prisma.marketIndexDailyBar.findFirst({
    where: { indexId, interval: "1d", day },
  });

  if (existing) {
    await prisma.marketIndexDailyBar.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.marketIndexDailyBar.create({
    data: {
      indexId,
      interval: "1d",
      ...data,
    },
  });
}

export async function refreshLatestMarketIndexDailyBarFromTv(
  prisma: PrismaClient,
  indexId: string,
): Promise<{ indexId: string; symbol: string; newestDay: string | null }> {
  const symbol = resolveTvMarketIndexSymbol(indexId);
  const { bars } = await fetchTradingViewPriceHistory({
    symbol,
    range: 1,
  });

  for (const bar of bars) {
    await upsertMarketIndexDailyBarByDay(prisma, indexId, bar);
  }

  const newest = bars[bars.length - 1];
  return {
    indexId,
    symbol,
    newestDay: newest ? dayFromUnixSeconds(newest.time) : null,
  };
}
