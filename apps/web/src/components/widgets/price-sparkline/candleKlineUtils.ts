import type { CandleApiRow } from "@atlas-v1/shared";
import type { KLineData } from "klinecharts";

const HISTORY_SINCE_MS = Date.parse("2021-01-01T00:00:00.000Z");

/** Максимум дней дневных свечей для полноэкранного KLineChart. */
export const KLINE_CHART_HISTORY_DAYS = Math.min(
  2000,
  Math.max(30, Math.ceil((Date.now() - HISTORY_SINCE_MS) / 86_400_000)),
);

export function candleRowsToKlineBars(rows: CandleApiRow[]): KLineData[] {
  const byTimestamp = new Map<number, KLineData>();

  for (const row of rows) {
    const timestamp = new Date(row.openTime).getTime();
    const open = Number.parseFloat(row.open);
    const high = Number.parseFloat(row.high);
    const low = Number.parseFloat(row.low);
    const close = Number.parseFloat(row.close);
    const volume = Number.parseFloat(row.volume);
    if (
      !Number.isFinite(timestamp) ||
      ![open, high, low, close].every(Number.isFinite)
    ) {
      continue;
    }
    // Последняя строка с тем же openTime побеждает (live поверх history).
    byTimestamp.set(timestamp, { timestamp, open, high, low, close, volume });
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * TradingView CRYPTOCAP: тело свечи от close предыдущего дня до close текущего,
 * цвет — по направлению close относительно prev close (не open vs close).
 */
export function colorBarsByPreviousClose(bars: KLineData[]): KLineData[] {
  if (bars.length <= 1) return bars;

  const out: KLineData[] = [{ ...bars[0]! }];
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    const prevClose = bars[i - 1]!.close;
    out.push({
      ...bar,
      open: prevClose,
      high: Math.max(bar.high, prevClose, bar.close),
      low: Math.min(bar.low, prevClose, bar.close),
    });
  }
  return out;
}

export function mergeKlineBarsByTimestamp(existing: KLineData[], incoming: KLineData[]): KLineData[] {
  const byTimestamp = new Map<number, KLineData>();
  for (const bar of existing) byTimestamp.set(bar.timestamp, bar);
  for (const bar of incoming) byTimestamp.set(bar.timestamp, bar);
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function inferPricePrecision(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 1) return 2;

  // Держим ~4–5 значащих цифр для мелких монет (PEPE и т.п.).
  const order = Math.floor(Math.log10(Math.abs(price)));
  return Math.max(2, Math.min(12, 4 - order));
}

/** Точность по последним барам серии (берём минимум close/low/high). */
export function inferPricePrecisionFromBars(bars: Array<{ close: number; high: number; low: number }>): number {
  if (bars.length === 0) return 2;
  const sample = bars.slice(-40);
  let precision = 2;
  for (const bar of sample) {
    for (const price of [bar.close, bar.high, bar.low]) {
      precision = Math.max(precision, inferPricePrecision(price));
    }
  }
  return precision;
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
