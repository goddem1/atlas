import type { MarketIndexId } from "./marketIndexCatalog";

const KLINE_CHART_INDEX_IDS = new Set<MarketIndexId>([
  "fear-greed",
  "btc-dominance",
  "total-1",
  "total-2",
  "total-3",
  "vix",
  "dxy",
]);

export function hasMarketIndexKlineChart(indexId: MarketIndexId): boolean {
  return KLINE_CHART_INDEX_IDS.has(indexId);
}
