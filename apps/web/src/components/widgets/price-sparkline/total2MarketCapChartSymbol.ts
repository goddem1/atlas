import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — Total 2 (CRYPTOCAP:TOTAL2, altcoin market cap). */
export const TOTAL2_MARKET_CAP_CHART_SYMBOL = "TOTAL2";
export const TOTAL2_MARKET_CAP_CHART_PAIR = "TOTAL2";
export const TOTAL2_MARKET_CAP_INDEX_ID = "total-2";

export const TOTAL2_MARKET_CAP_CHART_HISTORY_LIMIT = 3300;

export function isTotal2MarketCapPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === TOTAL2_MARKET_CAP_CHART_SYMBOL ||
    key === TOTAL2_MARKET_CAP_CHART_PAIR ||
    key === "CRYPTOCAP:TOTAL2"
  );
}

export function buildTotal2MarketCapSymbolInfo(): SymbolInfo {
  return {
    ticker: TOTAL2_MARKET_CAP_CHART_PAIR,
    name: "Total 2",
    shortName: "TOTAL2",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "USD",
    type: "index",
    pricePrecision: 2,
    volumePrecision: 0,
  };
}

export function total2MarketCapBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
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

export function total2MarketCapBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(total2MarketCapBarsToRawKlineBars(points));
}
