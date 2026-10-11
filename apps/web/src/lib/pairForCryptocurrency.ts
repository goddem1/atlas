import type { CryptocurrencyListItem } from "@atlas-v1/shared";

export function pairForCryptocurrency(c: Pick<CryptocurrencyListItem, "symbol" | "pairSymbol">): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}
