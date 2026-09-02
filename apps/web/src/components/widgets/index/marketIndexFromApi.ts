import type {
  CmcDailySnapshotHistoryField,
  CmcDailySnapshotHistoryPoint,
  CmcDailySnapshotLatestResponse,
  MarketIndexDailyBarPoint,
} from "@atlas-v1/shared";
import {
  MARKET_INDEX_MOCK,
  type MarketIndexId,
  type MarketIndexSnapshot,
} from "./marketIndexCatalog";

const TV_BOARD_INDEX_IDS = ["vix", "dxy"] as const satisfies readonly MarketIndexId[];

const CMC_INDEX_HISTORY_FIELD: Partial<Record<MarketIndexId, CmcDailySnapshotHistoryField>> = {
  "fear-greed": "fearGreedValue",
  "btc-dominance": "btcDominance",
  "total-1": "totalMarketCap",
  "total-2": "altcoinMarketCap",
  "total-3": "total3MarketCap",
};

const CMC_INDEX_IDS = Object.keys(CMC_INDEX_HISTORY_FIELD) as MarketIndexId[];

export const CMC_MARKET_INDEX_HISTORY_FIELDS = Array.from(
  new Set(Object.values(CMC_INDEX_HISTORY_FIELD)),
) as CmcDailySnapshotHistoryField[];

function parseNumeric(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentChange(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function changeFromHistory(
  points: CmcDailySnapshotHistoryPoint[],
  current: number,
  todayDay?: string,
): number {
  const baseline = todayDay
    ? points.filter((point) => point.day < todayDay)
    : points.slice(0, Math.max(0, points.length - 1));
  if (baseline.length === 0) return 0;
  const previous = parseNumeric(baseline[baseline.length - 1]?.value ?? null);
  if (previous == null) return 0;
  return percentChange(current, previous);
}

function btcFundingPercent(latest: CmcDailySnapshotLatestResponse): number {
  const btc = latest.fundingRates.find((entry) => entry.symbol === "BTC");
  if (!btc) return 0;
  return btc.fundingRate * 100;
}

function buildCmcSnapshot(
  indexId: MarketIndexId,
  latest: CmcDailySnapshotLatestResponse,
  historyByField: Partial<Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>>,
): MarketIndexSnapshot | null {
  const todayDay = latest.day;
  switch (indexId) {
    case "fear-greed": {
      const value = latest.fearGreedValue;
      return {
        value,
        changePercent: changeFromHistory(historyByField.fearGreedValue ?? [], value, todayDay),
      };
    }
    case "btc-dominance": {
      const value = parseNumeric(latest.btcDominance);
      if (value == null) return null;
      return {
        value,
        changePercent: changeFromHistory(historyByField.btcDominance ?? [], value, todayDay),
      };
    }
    case "total-1": {
      const value = parseNumeric(latest.totalMarketCap);
      if (value == null) return null;
      return {
        value,
        changePercent: changeFromHistory(historyByField.totalMarketCap ?? [], value, todayDay),
      };
    }
    case "total-2": {
      const value = parseNumeric(latest.altcoinMarketCap);
      if (value == null) return null;
      return {
        value,
        changePercent: changeFromHistory(historyByField.altcoinMarketCap ?? [], value, todayDay),
      };
    }
    case "total-3": {
      const value = parseNumeric(latest.total3MarketCap);
      if (value == null) return null;
      return {
        value,
        changePercent: changeFromHistory(historyByField.total3MarketCap ?? [], value, todayDay),
      };
    }
    case "funding":
      return {
        value: btcFundingPercent(latest),
        changePercent: 0,
      };
    default:
      return null;
  }
}

export function buildMarketIndexSnapshots(
  latest: CmcDailySnapshotLatestResponse,
  historyByField: Partial<Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>>,
): Partial<Record<MarketIndexId, MarketIndexSnapshot>> {
  const snapshots: Partial<Record<MarketIndexId, MarketIndexSnapshot>> = {};

  for (const indexId of CMC_INDEX_IDS) {
    const snapshot = buildCmcSnapshot(indexId, latest, historyByField);
    if (snapshot) snapshots[indexId] = snapshot;
  }

  const fundingSnapshot = buildCmcSnapshot("funding", latest, historyByField);
  if (fundingSnapshot) snapshots.funding = fundingSnapshot;

  return snapshots;
}

function parseBarClose(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildMarketIndexSnapshotFromDailyBars(
  points: MarketIndexDailyBarPoint[],
): MarketIndexSnapshot | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1]!;
  const value = parseBarClose(last.close);
  if (value == null) return null;

  if (points.length < 2) {
    return { value, changePercent: 0 };
  }

  const previous = parseBarClose(points[points.length - 2]?.close ?? null);
  if (previous == null) {
    return { value, changePercent: 0 };
  }

  return {
    value,
    changePercent: percentChange(value, previous),
  };
}

export function buildTvMarketIndexSnapshots(
  barsByIndexId: Partial<Record<(typeof TV_BOARD_INDEX_IDS)[number], MarketIndexDailyBarPoint[]>>,
): Partial<Record<MarketIndexId, MarketIndexSnapshot>> {
  const snapshots: Partial<Record<MarketIndexId, MarketIndexSnapshot>> = {};
  for (const indexId of TV_BOARD_INDEX_IDS) {
    const snapshot = buildMarketIndexSnapshotFromDailyBars(barsByIndexId[indexId] ?? []);
    if (snapshot) snapshots[indexId] = snapshot;
  }
  return snapshots;
}

export function resolveMarketIndexSnapshot(
  indexId: MarketIndexId,
  snapshots: Partial<Record<MarketIndexId, MarketIndexSnapshot>> | null,
): MarketIndexSnapshot {
  return snapshots?.[indexId] ?? MARKET_INDEX_MOCK[indexId];
}

export function isCmcBackedMarketIndex(indexId: MarketIndexId): boolean {
  return indexId !== "vix" && indexId !== "dxy";
}
