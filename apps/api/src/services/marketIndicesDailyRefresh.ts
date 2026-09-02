import type { PrismaClient } from "@prisma/client";
import {
  computeAndPersistCmcDailySnapshot,
  fetchCmcMarketIndicesBundle,
  resolveCmcSnapshotMskDay,
  type CmcMarketIndicesBundle,
} from "./cmcDailySnapshot.js";
import { upsertFearGreedDailyBarFromLatest } from "./fearGreedDailyBarImport.js";
import {
  refreshLatestMarketIndexDailyBarFromTv,
  upsertCmcScalarMarketIndexDailyBar,
} from "./marketIndexDailyBarImport.js";

type JobLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

const TV_DAILY_INDEX_IDS = ["vix", "dxy"] as const;

function mskDayOpenTime(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshCmcChartDailyBars(
  prisma: PrismaClient,
  bundle: CmcMarketIndicesBundle,
  log?: JobLog,
): Promise<{ day: string; chartBarsUpdated: number }> {
  const day = resolveCmcSnapshotMskDay();
  const openTime = mskDayOpenTime(day);

  await upsertFearGreedDailyBarFromLatest(prisma, {
    day,
    barTime: openTime,
    score: bundle.fearGreed.value,
    classification: bundle.fearGreed.classification,
  });

  const cmcBars: Array<{ indexId: string; value: number }> = [
    { indexId: "btc-dominance", value: bundle.globalMetrics.btcDominance },
    { indexId: "total-1", value: bundle.globalMetrics.totalMarketCap },
    { indexId: "total-2", value: bundle.globalMetrics.altcoinMarketCap },
    { indexId: "total-3", value: bundle.total3MarketCap },
  ];

  for (const bar of cmcBars) {
    await upsertCmcScalarMarketIndexDailyBar(prisma, bar.indexId, day, openTime, bar.value);
  }

  log?.info(
    {
      day,
      fearGreed: bundle.fearGreed.value,
      btcDominance: bundle.globalMetrics.btcDominance,
      totalMarketCap: bundle.globalMetrics.totalMarketCap,
      fundingRateCount: bundle.fundingRates.length,
    },
    "[marketIndicesDaily] CMC chart bars upserted",
  );

  return { day, chartBarsUpdated: cmcBars.length + 1 };
}

export async function refreshTvMarketIndexDailyBars(
  prisma: PrismaClient,
  log?: JobLog,
): Promise<Array<{ indexId: string; symbol: string; newestDay: string | null }>> {
  const results: Array<{ indexId: string; symbol: string; newestDay: string | null }> = [];
  const delayMs = Number.parseInt(process.env.MARKET_INDEX_TV_REQUEST_DELAY_MS ?? "800", 10);

  for (const indexId of TV_DAILY_INDEX_IDS) {
    try {
      const result = await refreshLatestMarketIndexDailyBarFromTv(prisma, indexId);
      results.push(result);
      log?.info(result, "[marketIndicesDaily] TV bar refreshed");
    } catch (err) {
      log?.warn({ err, indexId }, "[marketIndicesDaily] TV bar refresh failed");
      results.push({ indexId, symbol: indexId, newestDay: null });
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return results;
}

/** Ежедневное обновление всех индексов: CMC snapshot + chart bars + TV (VIX/DXY). */
export async function refreshMarketIndicesDaily(
  prisma: PrismaClient,
  log?: JobLog,
): Promise<{
  day: string;
  snapshotSkipped: boolean;
  chartBarsUpdated: number;
  tv: Array<{ indexId: string; symbol: string; newestDay: string | null }>;
}> {
  const bundle = await fetchCmcMarketIndicesBundle();
  const snapshot = await computeAndPersistCmcDailySnapshot(prisma, log, bundle);
  const charts = await refreshCmcChartDailyBars(prisma, bundle, log);
  const tv = await refreshTvMarketIndexDailyBars(prisma, log);

  return {
    day: charts.day,
    snapshotSkipped: snapshot.skipped,
    chartBarsUpdated: charts.chartBarsUpdated,
    tv,
  };
}

export { fetchCmcMarketIndicesBundle };
