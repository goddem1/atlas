import type { TelegramNewsDailyIndexPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";

/** Спецсимвол расширенного графика — дневной индекс новостей. */
export const NEWS_INDEX_CHART_SYMBOL = "NEWSIDX";
export const NEWS_INDEX_CHART_PAIR = "NEWSIDX";

export function isNewsIndexPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return key === NEWS_INDEX_CHART_SYMBOL || key === NEWS_INDEX_CHART_PAIR || key === "NEWS";
}

export function buildNewsIndexSymbolInfo(): SymbolInfo {
  return {
    ticker: NEWS_INDEX_CHART_PAIR,
    name: "Индекс новостей",
    shortName: "NEWS",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "IDX",
    type: "index",
    pricePrecision: 0,
    volumePrecision: 0,
  };
}

function dayToTimestampMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d);
}

/** Дневные точки индекса → бары KLine (линия по close). */
export function newsIndexPointsToKlineBars(points: TelegramNewsDailyIndexPoint[]): KLineData[] {
  const out: KLineData[] = [];
  for (const point of points) {
    const timestamp = dayToTimestampMs(point.day);
    if (!timestamp) continue;
    const value = Math.round(Math.min(100, Math.max(0, point.sentiment)));
    out.push({
      timestamp,
      open: value,
      high: value,
      low: value,
      close: value,
      volume: point.candidateCount,
    });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}
