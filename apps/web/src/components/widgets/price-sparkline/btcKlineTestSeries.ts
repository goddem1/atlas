import type { CandleApiRow } from "@atlas-v1/shared";

/** Временная заглушка — выключить, когда подключим реальные свечи BTC. */
export const USE_BTC_TEST_KLINE_SERIES = false;

const BTC_TEST_PAIR = "BTCUSDT";
const DAY_MS = 86_400_000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function toMskDayStartMs(input: number): number {
  return Math.floor((input + MSK_OFFSET_MS) / DAY_MS) * DAY_MS - MSK_OFFSET_MS;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0xffffffff;
  };
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatVolume(value: number): string {
  return value.toFixed(3);
}

export function isBtcTestKlinePair(pair: string): boolean {
  return USE_BTC_TEST_KLINE_SERIES && pair.trim().toUpperCase() === BTC_TEST_PAIR;
}

/**
 * Детерминированная дневная серия BTCUSDT (~с 2021) для полноэкранного графика.
 * Поведение похоже на реальный рынок: тренд, волатильность, объём.
 */
export function generateBtcTestCandleRows(dayCount: number): CandleApiRow[] {
  const count = Math.max(30, Math.min(dayCount, 2000));
  const rand = createRng(0x42544321);
  const todayStartMs = toMskDayStartMs(Date.now());
  const rows: CandleApiRow[] = [];

  let close = 28_500 + rand() * 4_500;

  for (let index = 0; index < count; index += 1) {
    const openTimeMs = todayStartMs - (count - 1 - index) * DAY_MS;
    const progress = index / Math.max(count - 1, 1);
    const targetClose = 38_000 + progress * 27_000 + Math.sin(progress * 11) * 4_500;
    const drift = (targetClose - close) / Math.max(count - index, 1);
    const volatility = 0.012 + rand() * 0.016;

    const open = close;
    close = Math.max(12_000, open * (1 + drift / open) + open * (rand() - 0.5) * volatility);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const high = bodyHigh * (1 + rand() * 0.01);
    const low = bodyLow * (1 - rand() * 0.01);
    const volume = 12_000 + rand() * 95_000 + progress * 40_000;

    rows.push({
      openTime: new Date(openTimeMs).toISOString(),
      open: formatPrice(open),
      high: formatPrice(high),
      low: formatPrice(low),
      close: formatPrice(close),
      volume: formatVolume(volume),
    });
  }

  return rows;
}

export function tickBtcTestCandleRow(previous: CandleApiRow, rand = Math.random): CandleApiRow {
  const open = Number.parseFloat(previous.open);
  const close = Number.parseFloat(previous.close);
  const high = Number.parseFloat(previous.high);
  const low = Number.parseFloat(previous.low);
  const volume = Number.parseFloat(previous.volume);

  const wiggle = (rand() - 0.5) * close * 0.0015;
  const nextClose = Math.max(12_000, close + wiggle);

  return {
    openTime: previous.openTime,
    open: previous.open,
    high: formatPrice(Math.max(high, nextClose, open)),
    low: formatPrice(Math.min(low, nextClose, open)),
    close: formatPrice(nextClose),
    volume: formatVolume(volume * (0.98 + rand() * 0.04)),
  };
}
