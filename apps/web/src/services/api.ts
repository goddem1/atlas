import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";

function apiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
  const normalized = raw.replace(/\/$/, "");
  if (normalized) return normalized;
  // Dev: см. vite.config proxy /api → 127.0.0.1:3001 (иначе cross-origin часто даёт «Failed to fetch»).
  if (import.meta.env.DEV) return "/api";
  return "";
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCryptocurrencies(): Promise<CryptocurrencyListItem[]> {
  const res = await fetch(`${apiBase()}/cryptocurrencies`, { cache: "no-store" });
  return parseJson<CryptocurrencyListItem[]>(res);
}

export async function fetchCandles(pair: string, days = 7): Promise<CandleApiRow[]> {
  const q = new URLSearchParams({ pair, days: String(days) });
  const res = await fetch(`${apiBase()}/widgets/candles?${q}`, { cache: "no-store" });
  return parseJson<CandleApiRow[]>(res);
}
