import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — дневной VIX (TVC:VIX). */
export const VIX_CHART_SYMBOL = "VIX";
export const VIX_CHART_PAIR = "VIX";
export const VIX_INDEX_ID = "vix";

/** Сколько дневных баров запрашивать для полной истории на графике. */
export const VIX_CHART_HISTORY_LIMIT = 3300;

export function isVixPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === VIX_CHART_SYMBOL ||
    key === VIX_CHART_PAIR ||
    key === "TVC:VIX"
  );
}

export function buildVixSymbolInfo(): SymbolInfo {
  return {
    ticker: VIX_CHART_PAIR,
    name: "VIX Volatility Index",
    shortName: "VIX",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "IDX",
    type: "index",
    pricePrecision: 2,
    volumePrecision: 0,
  };
}

export function vixBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
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

export function vixBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(vixBarsToRawKlineBars(points));
}
