import type { CmcDailySnapshotLatestResponse } from "@atlas-v1/shared";
import cron from "node-cron";
import {
  fetchCmcMarketIndicesBundle,
  resolveCmcSnapshotMskDay,
  type CmcMarketIndicesBundle,
} from "./cmcDailySnapshot.js";

type JobLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

type LiveCache = {
  bundle: CmcMarketIndicesBundle;
  fetchedAt: Date;
};

let cache: LiveCache | null = null;
let inflight: Promise<void> | null = null;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function bundleToLatestResponse(
  bundle: CmcMarketIndicesBundle,
  fetchedAt = new Date(),
): CmcDailySnapshotLatestResponse {
  return {
    day: resolveCmcSnapshotMskDay(fetchedAt),
    fearGreedValue: bundle.fearGreed.value,
    fearGreedClassification: bundle.fearGreed.classification,
    btcDominance: String(bundle.globalMetrics.btcDominance),
    ethDominance: String(bundle.globalMetrics.ethDominance),
    totalMarketCap: String(bundle.globalMetrics.totalMarketCap),
    altcoinMarketCap: String(bundle.globalMetrics.altcoinMarketCap),
    btcMarketCap: String(bundle.btcEthMcap.btcMarketCap),
    ethMarketCap: String(bundle.btcEthMcap.ethMarketCap),
    total3MarketCap: String(bundle.total3MarketCap),
    altcoinSeasonIndex: bundle.altcoinSeason.altcoinSeasonIndex,
    altcoinSeasonMarketCap:
      bundle.altcoinSeason.altcoinSeasonMarketCap == null
        ? null
        : String(bundle.altcoinSeason.altcoinSeasonMarketCap),
    fundingRates: bundle.fundingRates,
    createdAt: fetchedAt.toISOString(),
  };
}

export function getCmcMarketIndicesLiveCache(): LiveCache | null {
  return cache;
}

export async function refreshCmcMarketIndicesLive(log?: JobLog): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const bundle = await fetchCmcMarketIndicesBundle();
      const fetchedAt = new Date();
      cache = { bundle, fetchedAt };
      log?.info(
        {
          day: resolveCmcSnapshotMskDay(fetchedAt),
          fearGreed: bundle.fearGreed.value,
          btcDominance: bundle.globalMetrics.btcDominance,
        },
        "[cmcLive] refreshed",
      );
    } catch (err) {
      log?.warn({ err }, "[cmcLive] refresh failed");
      throw err;
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

const STALE_MS = 65 * 60_000;

/** Актуальные CMC-индексы для виджетов (кэш + при необходимости догрузка). */
export async function getMarketIndicesLatestLive(log?: JobLog): Promise<CmcDailySnapshotLatestResponse | null> {
  const stale =
    !cache || Date.now() - cache.fetchedAt.getTime() > STALE_MS;
  if (stale) {
    try {
      await refreshCmcMarketIndicesLive(log);
    } catch {
      if (cache) {
        return bundleToLatestResponse(cache.bundle, cache.fetchedAt);
      }
      return null;
    }
  }
  return cache ? bundleToLatestResponse(cache.bundle, cache.fetchedAt) : null;
}

export function startCmcMarketIndicesLiveRefresh(log: JobLog): () => void {
  if (process.env.CMC_LIVE_REFRESH_CRON_DISABLED === "true") {
    log.info("[cmcLive] hourly refresh disabled via CMC_LIVE_REFRESH_CRON_DISABLED");
    return () => undefined;
  }

  void refreshCmcMarketIndicesLive(log).catch(() => undefined);

  cronTask = cron.schedule(
    "0 * * * *",
    () => {
      void refreshCmcMarketIndicesLive(log);
    },
    { timezone: "Europe/Moscow" },
  );

  log.info("[cmcLive] hourly refresh scheduled (every hour at :00 Europe/Moscow)");

  return () => {
    cronTask?.stop();
    cronTask = null;
  };
}
