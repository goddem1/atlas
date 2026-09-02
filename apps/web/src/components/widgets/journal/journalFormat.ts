export function formatTradeDuration(entryAt: string, exitAt: string): string {
  const start = new Date(entryAt).getTime();
  const end = new Date(exitAt).getTime();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}м`);
  return parts.length > 0 ? parts.join(" ") : "<1м";
}

export function tradeDisplayAt(trade: { exitAt: string | null; entryAt: string }): string {
  return trade.exitAt ?? trade.entryAt;
}

export function formatTradeDateTime(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  }).format(dt);
}

export function formatTradeDateShort(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(dt);
}

export function formatTradeBalanceUsd(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

export function formatTradePnlUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatTradePnlUsdCompact(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatTradePnlUsdTable(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (value < 0) return `−$${formatted}`;
  return `$${formatted}`;
}

export function formatTradePnlPercent(value: number): string {
  return `${Math.abs(value).toFixed(0)}%`;
}

export function parseTradeUsdAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : 0;
  const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatTradeFeeUsd(value: number): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs)) return "$0";
  return `$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function pnlTone(value: number): "pos" | "neg" | "zero" {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "zero";
}

export function stripSymbolUsdt(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}

export function resolveTradeCoinQuantity(
  quantity: unknown,
  entryPrice: unknown,
  unit: "usd" | "coins" = "coins",
): number | null {
  const qty = parseTradeUsdAmount(quantity);
  const entry = parseTradeUsdAmount(entryPrice);
  if (qty <= 0 || entry <= 0) return null;
  if (unit === "usd") return qty / entry;
  return qty;
}

export function previewTradePnl(input: {
  direction: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  commission?: string;
  fundingFee?: string;
  quantityUnit?: "usd" | "coins";
}): { pnlUsd: number; pnlPercent: number } | null {
  const entryPrice = Number(input.entryPrice);
  const exitPrice = Number(input.exitPrice);
  const quantityRaw = Number(input.quantity);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(quantityRaw)) {
    return null;
  }
  if (entryPrice <= 0 || exitPrice <= 0 || quantityRaw <= 0) return null;

  const coinQuantity = resolveTradeCoinQuantity(input.quantity, input.entryPrice, input.quantityUnit ?? "coins");
  if (coinQuantity == null || coinQuantity <= 0) return null;

  const commission = parseTradeUsdAmount(input.commission);
  const fundingFee = parseTradeUsdAmount(input.fundingFee);
  const sign = input.direction === "short" ? -1 : 1;
  const pnlUsd = sign * (exitPrice - entryPrice) * coinQuantity - commission - fundingFee;
  const notional =
    input.quantityUnit === "usd" ? quantityRaw : entryPrice * coinQuantity;
  const pnlPercent = notional > 0 ? (pnlUsd / notional) * 100 : 0;
  return { pnlUsd, pnlPercent };
}
