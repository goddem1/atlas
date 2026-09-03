import { Prisma, type PrismaClient } from "@prisma/client";
import type { FundingRateEntry } from "@atlas-v1/shared";
import {
  fetchAltcoinSeasonIndex,
  fetchBtcEthMarketCap,
  fetchFearGreedLatest,
  fetchFundingRates,
  fetchGlobalMetrics,
  hasCmcApiKey,
} from "./cmcDailyFetch.js";

export type CmcMarketIndicesBundle = {
  fearGreed: { value: number; classification: string };
  globalMetrics: {
    btcDominance: number;
    ethDominance: number;
    totalMarketCap: number;
    altcoinMarketCap: number;
  };
  altcoinSeason: {
    altcoinSeasonIndex: number;
    altcoinSeasonMarketCap: number | null;
  };
  btcEthMcap: { btcMarketCap: number; ethMarketCap: number };
  fundingRates: FundingRateEntry[];
  total3MarketCap: number;
};

/** Календарный МСК-день в момент запуска (YYYY-MM-DD). */
export function resolveCmcSnapshotMskDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type JobLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

export async function fetchCmcMarketIndicesBundle(): Promise<CmcMarketIndicesBundle> {
  // Fear&Greed / GlobalMetrics / AltcoinSeason — публичные (без ключа).
  // BTC/ETH mcap и funding — только с CMC_API_KEY; без ключа не валим весь bundle.
  const [fearGreed, globalMetrics, altcoinSeason] = await Promise.all([
    fetchFearGreedLatest(),
    fetchGlobalMetrics(),
    fetchAltcoinSeasonIndex(),
  ]);

  let btcEthMcap = {
    btcMarketCap: (globalMetrics.totalMarketCap * globalMetrics.btcDominance) / 100,
    ethMarketCap: (globalMetrics.totalMarketCap * globalMetrics.ethDominance) / 100,
  };
  let fundingRates: FundingRateEntry[] = [];

  if (hasCmcApiKey()) {
    const [quotes, funding] = await Promise.all([fetchBtcEthMarketCap(), fetchFundingRates()]);
    btcEthMcap = quotes;
    fundingRates = funding;
  }

  const total3MarketCap = Math.max(
    0,
    globalMetrics.totalMarketCap - btcEthMcap.btcMarketCap - btcEthMcap.ethMarketCap,
  );

  return {
    fearGreed,
    globalMetrics,
    altcoinSeason,
    btcEthMcap,
    fundingRates,
    total3MarketCap,
  };
}

async function fetchBundle(): Promise<CmcMarketIndicesBundle> {
  return fetchCmcMarketIndicesBundle();
}

export async function computeAndPersistCmcDailySnapshot(
  prisma: PrismaClient,
  log?: JobLog,
  prefetched?: CmcMarketIndicesBundle,
): Promise<{ day: string; skipped: boolean }> {
  const day = resolveCmcSnapshotMskDay();

  const existing = await prisma.cmcDailySnapshot.findUnique({ where: { day } });
  if (existing) {
    log?.info({ day }, "[cmcDailySnapshot] snapshot already exists, skipping");
    return { day, skipped: true };
  }

  const bundle = prefetched ?? (await fetchBundle());

  await prisma.cmcDailySnapshot.create({
    data: {
      day,
      fearGreedValue: bundle.fearGreed.value,
      fearGreedClassification: bundle.fearGreed.classification,
      btcDominance: new Prisma.Decimal(bundle.globalMetrics.btcDominance),
      ethDominance: new Prisma.Decimal(bundle.globalMetrics.ethDominance),
      totalMarketCap: new Prisma.Decimal(bundle.globalMetrics.totalMarketCap),
      altcoinMarketCap: new Prisma.Decimal(bundle.globalMetrics.altcoinMarketCap),
      btcMarketCap: new Prisma.Decimal(bundle.btcEthMcap.btcMarketCap),
      ethMarketCap: new Prisma.Decimal(bundle.btcEthMcap.ethMarketCap),
      total3MarketCap: new Prisma.Decimal(bundle.total3MarketCap),
      altcoinSeasonIndex: bundle.altcoinSeason.altcoinSeasonIndex,
      altcoinSeasonMarketCap:
        bundle.altcoinSeason.altcoinSeasonMarketCap == null
          ? null
          : new Prisma.Decimal(bundle.altcoinSeason.altcoinSeasonMarketCap),
      fundingRates: bundle.fundingRates as unknown as Prisma.InputJsonValue,
    },
  });

  log?.info(
    {
      day,
      fearGreedValue: bundle.fearGreed.value,
      btcDominance: bundle.globalMetrics.btcDominance,
      fundingRateCount: bundle.fundingRates.length,
    },
    "[cmcDailySnapshot] snapshot saved",
  );

  return { day, skipped: false };
}
