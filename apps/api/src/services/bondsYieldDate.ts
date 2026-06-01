const MSK_TZ = "Europe/Moscow";

/** Календарный день запроса (MSK) → closeTime в БД (полночь UTC с той же YYYY-MM-DD). */
export function closeTimeForRequestDate(now = new Date()): Date {
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: MSK_TZ });
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid request date: ${ymd}`);
  }
  return d;
}

export function ymdFromDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ymdDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return ymdFromDateUtc(d);
}

/** Доходность: обрезание до 2 знаков после запятой. */
export function formatBondsYieldClose(value: number): string {
  const truncated = Math.trunc(value * 100) / 100;
  return truncated.toFixed(2);
}
