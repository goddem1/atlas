import type {
  CandleApiRow,
  CryptocurrencyListItem,
  MacroEventsResponse,
  MacroSeriesResponse,
  PortfolioAssetDetailResponse,
  PortfolioChartResponse,
  PortfolioSummaryResponse,
  PortfolioTimeframe,
  PortfolioTransactionUpsertInput,
} from "@atlas-v1/shared";

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
    let parsedError: string | null = null;
    try {
      const parsed = JSON.parse(t) as { error?: string };
      parsedError = typeof parsed?.error === "string" ? parsed.error : null;
    } catch {
      // ignore JSON parse error and fallback to raw text
    }
    throw new Error(parsedError || t || `HTTP ${res.status}`);
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

export async function fetchMacroEvents(params?: {
  from?: Date;
  to?: Date;
  locale?: string;
}): Promise<MacroEventsResponse> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from.toISOString());
  if (params?.to) q.set("to", params.to.toISOString());
  if (params?.locale) q.set("locale", params.locale);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/events${suffix}`, { cache: "no-store" });
  return parseJson<MacroEventsResponse>(res);
}

export interface MacroReleaseStatusResponse {
  inProgressEventIds: string[];
  serverNowIso: string;
}

export async function fetchMacroReleaseStatus(): Promise<MacroReleaseStatusResponse> {
  const res = await fetch(`${apiBase()}/macro/release-status`, { cache: "no-store" });
  return parseJson<MacroReleaseStatusResponse>(res);
}

export async function fetchMacroSeries(params: {
  indicatorId?: string;
  indicatorName?: string;
  locale?: string;
  compact?: boolean;
}): Promise<MacroSeriesResponse> {
  const q = new URLSearchParams();
  if (params.indicatorId) q.set("indicatorId", params.indicatorId);
  if (params.indicatorName) q.set("indicatorName", params.indicatorName);
  if (params.locale) q.set("locale", params.locale);
  if (params.compact) q.set("compact", "1");
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/series${suffix}`, { cache: "no-store" });
  return parseJson<MacroSeriesResponse>(res);
}

export interface MacroSlotsResponse {
  slots: Record<
    string,
    {
      unit: string;
      tiny: Array<{ label: string; value: number }>;
      year: Array<{ label: string; value: number }>;
    }
  >;
}

export async function fetchMacroSlots(params: {
  indicatorIds: string[];
  locale?: string;
}): Promise<MacroSlotsResponse> {
  const q = new URLSearchParams();
  q.set("indicatorIds", params.indicatorIds.join(","));
  if (params.locale) q.set("locale", params.locale);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/slots${suffix}`, { cache: "no-store" });
  return parseJson<MacroSlotsResponse>(res);
}

export function buildMacroSlotImageUrl(params: {
  indicatorId?: string;
  indicatorName?: string;
  mode?: "tiny" | "preview";
  width?: number;
  height?: number;
}): string {
  const q = new URLSearchParams();
  if (params.indicatorId) q.set("indicatorId", params.indicatorId);
  if (params.indicatorName) q.set("indicatorName", params.indicatorName);
  if (params.mode) q.set("mode", params.mode);
  if (params.width) q.set("width", String(params.width));
  if (params.height) q.set("height", String(params.height));
  const suffix = q.toString() ? `?${q}` : "";
  return `${apiBase()}/macro/slot-image${suffix}`;
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummaryResponse> {
  const res = await fetch(`${apiBase()}/portfolio`, { cache: "no-store" });
  return parseJson<PortfolioSummaryResponse>(res);
}

export async function fetchPortfolioChart(timeframe: PortfolioTimeframe): Promise<PortfolioChartResponse> {
  const q = new URLSearchParams({ timeframe });
  const res = await fetch(`${apiBase()}/portfolio/chart?${q}`, { cache: "no-store" });
  return parseJson<PortfolioChartResponse>(res);
}

export async function createPortfolioTransaction(
  payload: PortfolioTransactionUpsertInput,
): Promise<{ id: string }> {
  const res = await fetch(`${apiBase()}/portfolio/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string }>(res);
}

export async function fetchPortfolioAssetDetail(symbol: string): Promise<PortfolioAssetDetailResponse> {
  const res = await fetch(`${apiBase()}/portfolio/${encodeURIComponent(symbol)}`, { cache: "no-store" });
  return parseJson<PortfolioAssetDetailResponse>(res);
}

export async function updatePortfolioTransaction(
  id: string,
  payload: Omit<PortfolioTransactionUpsertInput, "symbol">,
): Promise<void> {
  const res = await fetch(`${apiBase()}/portfolio/transaction/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function deletePortfolioTransaction(id: string): Promise<void> {
  const res = await fetch(`${apiBase()}/portfolio/transaction/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function createPortfolioGoal(
  symbol: string,
  targetPriceUsd: string,
): Promise<{ id: string }> {
  const res = await fetch(`${apiBase()}/portfolio/goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, targetPriceUsd }),
  });
  return parseJson<{ id: string }>(res);
}

export async function deletePortfolioGoal(id: string): Promise<void> {
  const res = await fetch(`${apiBase()}/portfolio/goal/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}
