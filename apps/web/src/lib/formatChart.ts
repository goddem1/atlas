export function formatRuDayMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

export function formatPriceTicker(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
  }
  if (n >= 1) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
}

/** Процент изменения последней цены относительно предпоследней. */
export function percentChangeLast(prev: number, last: number): number {
  if (!Number.isFinite(prev) || !Number.isFinite(last) || prev === 0) return 0;
  return ((last - prev) / prev) * 100;
}
