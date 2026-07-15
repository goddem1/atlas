import type { CandleApiRow } from "@atlas-v1/shared";
import type { KLineData } from "klinecharts";

const HISTORY_SINCE_MS = Date.parse("2021-01-01T00:00:00.000Z");

/** Максимум дней дневных свечей для полноэкранного KLineChart. */
export const KLINE_CHART_HISTORY_DAYS = Math.min(
  2000,
  Math.max(30, Math.ceil((Date.now() - HISTORY_SINCE_MS) / 86_400_000)),
);

export function candleRowsToKlineBars(rows: CandleApiRow[]): KLineData[] {
  return rows
    .map((row) => ({
      timestamp: new Date(row.openTime).getTime(),
      open: Number.parseFloat(row.open),
      high: Number.parseFloat(row.high),
      low: Number.parseFloat(row.low),
      close: Number.parseFloat(row.close),
      volume: Number.parseFloat(row.volume),
    }))
    .filter(
      (bar) =>
        Number.isFinite(bar.timestamp) &&
        [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite),
    );
}

export function inferPricePrecision(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 1) return 2;
  if (price >= 0.01) return 4;
  if (price >= 0.0001) return 6;
  return 8;
}

export function mergeLastKlineBar(bars: KLineData[], last: KLineData): KLineData[] {
  if (bars.length === 0) return [last];
  const prev = bars[bars.length - 1]!;
  if (prev.timestamp === last.timestamp) {
    return [...bars.slice(0, -1), last];
  }
  if (last.timestamp > prev.timestamp) {
    return [...bars, last];
  }
  return bars;
}

export function isDashboardDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-dashboard-theme") === "dark";
}
