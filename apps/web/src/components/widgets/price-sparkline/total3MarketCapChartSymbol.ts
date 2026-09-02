import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — Total 3 (CRYPTOCAP:TOTAL3). */
export const TOTAL3_MARKET_CAP_CHART_SYMBOL = "TOTAL3";
export const TOTAL3_MARKET_CAP_CHART_PAIR = "TOTAL3";
export const TOTAL3_MARKET_CAP_INDEX_ID = "total-3";

export const TOTAL3_MARKET_CAP_CHART_HISTORY_LIMIT = 3300;

export function isTotal3MarketCapPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === TOTAL3_MARKET_CAP_CHART_SYMBOL ||
    key === TOTAL3_MARKET_CAP_CHART_PAIR ||
    key === "CRYPTOCAP:TOTAL3"
  );
}

export function buildTotal3MarketCapSymbolInfo(): SymbolInfo {
  return {
    ticker: TOTAL3_MARKET_CAP_CHART_PAIR,
    name: "Total 3",
    shortName: "TOTAL3",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "USD",
    type: "index",
    pricePrecision: 2,
    volumePrecision: 0,
  };
}

export function total3MarketCapBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  const rows = points.map((point) => ({
    openTime: point.openTime,
    open: point.open ?? point.close,
    high: point.high ?? point.close,
    low: point.low ?? point.close,
    close: point.close,
    volume: point.volume ?? "0",
  }));
  return candleRowsToKlineBars(rows);
}

export function total3MarketCapBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(total3MarketCapBarsToRawKlineBars(points));
}
