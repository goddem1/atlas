import type { FearGreedDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";

/** Спецсимвол расширенного графика — Fear & Greed Index (CMC). */
export const FEAR_GREED_CHART_SYMBOL = "FNG";
export const FEAR_GREED_CHART_PAIR = "FNG";

export const FEAR_GREED_CHART_HISTORY_LIMIT = 2000;

export function isFearGreedPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === FEAR_GREED_CHART_SYMBOL ||
    key === FEAR_GREED_CHART_PAIR ||
    key === "FEARGREED" ||
    key === "FEAR-GREED"
  );
}

export function buildFearGreedSymbolInfo(): SymbolInfo {
  return {
    ticker: FEAR_GREED_CHART_PAIR,
    name: "Fear & Greed",
    shortName: "FNG",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "IDX",
    type: "index",
    pricePrecision: 0,
    volumePrecision: 0,
  };
}

/** Дневные точки F&G → бары KLine (линия по score). */
export function fearGreedBarsToKlineBars(points: FearGreedDailyBarPoint[]): KLineData[] {
  const out: KLineData[] = [];
  for (const point of points) {
    const timestamp = new Date(point.barTime).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const value = Math.round(Math.min(100, Math.max(0, point.score)));
    out.push({
      timestamp,
      open: value,
      high: value,
      low: value,
      close: value,
      volume: 0,
    });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}
