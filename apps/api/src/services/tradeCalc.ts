export type TradeDirection = "long" | "short";
export type TradeQuantityUnit = "coins" | "usd";

export type TradePnlInput = {
  direction: string;
  entryPrice: unknown;
  exitPrice: unknown;
  quantity: unknown;
  quantityUnit?: unknown;
  commission?: unknown;
  fundingFee?: unknown;
};

function toNum(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = Number((value as { toNumber: () => number }).toNumber());
    return Number.isFinite(n) ? n : 0;
  }
  const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function parseTradeQuantityUnit(value: unknown): TradeQuantityUnit {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "usd" ? "usd" : "coins";
}

export function resolveTradeCoinQuantity(
  quantity: unknown,
  entryPrice: unknown,
  unit: TradeQuantityUnit = "coins",
): number {
  const qty = toNum(quantity);
  const entry = toNum(entryPrice);
  if (qty <= 0 || entry <= 0) return 0;
  if (unit === "usd") return qty / entry;
  return qty;
}

export function calcTradePnl(input: TradePnlInput): { pnlUsd: number; pnlPercent: number } {
  const entryPrice = toNum(input.entryPrice);
  const exitPrice = toNum(input.exitPrice);
  const quantityRaw = toNum(input.quantity);
  const quantityUnit = parseTradeQuantityUnit(input.quantityUnit);
  const coinQuantity = resolveTradeCoinQuantity(input.quantity, input.entryPrice, quantityUnit);
  const commission = toNum(input.commission);
  const fundingFee = toNum(input.fundingFee);
  const sign = input.direction === "short" ? -1 : 1;
  const pnlUsd = sign * (exitPrice - entryPrice) * coinQuantity - commission - fundingFee;
  const notional = quantityUnit === "usd" ? quantityRaw : entryPrice * coinQuantity;
  const pnlPercent = notional > 0 ? (pnlUsd / notional) * 100 : 0;
  return { pnlUsd, pnlPercent };
}
