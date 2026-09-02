import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — дневной US Dollar Index (TVC:DXY). */
export const DXY_CHART_SYMBOL = "DXY";
export const DXY_CHART_PAIR = "DXY";
export const DXY_INDEX_ID = "dxy";

/** Сколько дневных баров запрашивать для полной истории на графике. */
export const DXY_CHART_HISTORY_LIMIT = 3300;

export function isDxyPair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === DXY_CHART_SYMBOL ||
    key === DXY_CHART_PAIR ||
    key === "USDX" ||
    key === "TVC:DXY"
  );
}

export function buildDxySymbolInfo(): SymbolInfo {
  return {
    ticker: DXY_CHART_PAIR,
    name: "US Dollar Index",
    shortName: "DXY",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "IDX",
    type: "index",
    pricePrecision: 3,
    volumePrecision: 0,
  };
}

export function dxyBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
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

export function dxyBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(dxyBarsToRawKlineBars(points));
}
