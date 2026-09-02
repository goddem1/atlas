export function formatIndexCompactValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

export function formatIndexChangePercent(changePercent: number): string {
  const sign = changePercent > 0 ? "+" : changePercent < 0 ? "−" : "";
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(changePercent));
  return `${sign}${formatted}%`;
}

export function indexChangeTone(changePercent: number): "pos" | "neg" | "zero" {
  if (changePercent > 0) return "pos";
  if (changePercent < 0) return "neg";
  return "zero";
}
