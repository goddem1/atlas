import type { MarketIndexDailyBarPoint } from "@atlas-v1/shared";
import type { SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { candleRowsToKlineBars, colorBarsByPreviousClose } from "./candleKlineUtils";

/** Спецсимвол расширенного графика — дневная BTC-доминация. */
export const BTC_DOMINANCE_CHART_SYMBOL = "BTCDOM";
export const BTC_DOMINANCE_CHART_PAIR = "BTCDOM";
export const BTC_DOMINANCE_INDEX_ID = "btc-dominance";

/** Сколько дневных баров запрашивать для полной истории на графике. */
export const BTC_DOMINANCE_CHART_HISTORY_LIMIT = 3300;

export function isBtcDominancePair(pairOrSymbol: string): boolean {
  const key = pairOrSymbol.trim().toUpperCase();
  return (
    key === BTC_DOMINANCE_CHART_SYMBOL ||
    key === BTC_DOMINANCE_CHART_PAIR ||
    key === "BTCD" ||
    key === "BTC.D"
  );
}

export function buildBtcDominanceSymbolInfo(): SymbolInfo {
  return {
    ticker: BTC_DOMINANCE_CHART_PAIR,
    name: "BTC доминация",
    shortName: "BTCDOM",
    exchange: "ATLAS",
    market: "index",
    priceCurrency: "%",
    type: "index",
    pricePrecision: 2,
    volumePrecision: 0,
  };
}

export function btcDominanceBarsToRawKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
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

export function btcDominanceBarsToKlineBars(points: MarketIndexDailyBarPoint[]): KLineData[] {
  return colorBarsByPreviousClose(btcDominanceBarsToRawKlineBars(points));
}
