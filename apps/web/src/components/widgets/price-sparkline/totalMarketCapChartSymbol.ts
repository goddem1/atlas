import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — дневная капитализация рынка (CRYPTOCAP:TOTAL). */
export const TOTAL_MARKET_CAP_CHART_SYMBOL = "TOTAL";
export const TOTAL_MARKET_CAP_CHART_PAIR = "TOTAL";
export const TOTAL_MARKET_CAP_INDEX_ID = "total-1";

/** Сколько дневных баров запрашивать для полной истории на графике. */
export const TOTAL_MARKET_CAP_CHART_HISTORY_LIMIT = 3300;

export function isTotalMarketCapPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === TOTAL_MARKET_CAP_CHART_SYMBOL ||
    key === TOTAL_MARKET_CAP_CHART_PAIR ||
    key === "TOTAL1" ||
    key === "CRYPTOCAP:TOTAL"
  );
}

export function buildTotalMarketCapSymbolInfo(): SymbolInfo {
  return {
    ticker: TOTAL_MARKET_CAP_CHART_PAIR,
    name: "Total market cap",
    shortName: "TOTAL",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "USD",
    type: "index",
    pricePrecision: 2,
    volumePrecision: 0,
  };
}

export function totalMarketCapBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
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

export function totalMarketCapBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(totalMarketCapBarsToRawKlineBars(points));
}
