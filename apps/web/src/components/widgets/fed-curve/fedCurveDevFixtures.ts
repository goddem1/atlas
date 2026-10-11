/**
 * Тестовая кривая ФРС для локальной вёрстки виджета.
 * Подключается только при `import.meta.env.DEV`.
 * Перед/при выкладке на прод файл можно удалить (в production Vite их не использует).
 */
import type { BondsYieldCurveResponse } from "@atlas-v1/shared";

const DEV_TENORS = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"] as const;

/** Текущая кривая — слегка инвертированная на коротком конце. */
const DEV_CURRENT_CLOSES = ["5.28", "5.22", "5.15", "4.95", "4.72", "4.58", "4.42", "4.38", "4.35", "4.58", "4.52"];

/** Кривая N дней назад — чуть выше по всей длине. */
const DEV_COMPARE_CLOSES = ["5.36", "5.30", "5.24", "5.05", "4.85", "4.70", "4.52", "4.48", "4.45", "4.68", "4.62"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function getDevFedCurve(compareDays: number): BondsYieldCurveResponse {
  return {
    tenors: [...DEV_TENORS],
    asOfDate: isoDaysAgo(0),
    monthAgoDate: isoDaysAgo(compareDays),
    compareDays,
    current: DEV_TENORS.map((symbol, i) => ({
      symbol,
      close: DEV_CURRENT_CLOSES[i] ?? null,
    })),
    monthAgo: DEV_TENORS.map((symbol, i) => ({
      symbol,
      close: DEV_COMPARE_CLOSES[i] ?? null,
    })),
  };
}
