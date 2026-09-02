import { fetch as undiciFetch } from "undici";
import { getRapidApiDispatcher } from "../lib/httpProxy.js";
import { BONDS_TV_RAPIDAPI_HOST } from "./bondsYieldConfig.js";

export type TvHistoryBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type TvRawBar = {
  time?: number;
  open?: number;
  close?: number;
  high?: number;
  low?: number;
  max?: number;
  min?: number;
  volume?: number;
};

type TvPriceHistoryResponse = {
  success?: boolean;
  error?: string;
  data?: {
    symbol?: string;
    current?: TvRawBar;
    history?: TvRawBar[];
  };
};

function tvUsesProxy(): boolean {
  if (process.env.BONDS_TV_DIRECT === "true") return false;
  if (process.env.BONDS_TV_USE_PROXY === "false") return false;
  return Boolean(getRapidApiDispatcher());
}

function normalizeBar(raw: TvRawBar): TvHistoryBar | null {
  if (typeof raw.time !== "number" || !Number.isFinite(raw.time)) return null;
  const close = raw.close;
  if (typeof close !== "number" || !Number.isFinite(close)) return null;

  const open = typeof raw.open === "number" && Number.isFinite(raw.open) ? raw.open : close;
  const high =
    typeof raw.high === "number" && Number.isFinite(raw.high)
      ? raw.high
      : typeof raw.max === "number" && Number.isFinite(raw.max)
        ? raw.max
        : open;
  const low =
    typeof raw.low === "number" && Number.isFinite(raw.low)
      ? raw.low
      : typeof raw.min === "number" && Number.isFinite(raw.min)
        ? raw.min
        : open;
  const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume) ? raw.volume : null;

  return { time: raw.time, open, high, low, close, volume };
}

function dedupeBars(bars: TvHistoryBar[]): TvHistoryBar[] {
  const byTime = new Map<number, TvHistoryBar>();
  for (const bar of bars) {
    byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export async function fetchTradingViewPriceHistory(options: {
  symbol: string;
  timeframe?: string;
  range: number;
  to?: string | number;
  apiKey?: string;
}): Promise<{ symbol: string; bars: TvHistoryBar[] }> {
  const apiKey = options.apiKey?.trim() ?? process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is required for TradingView RapidAPI");
  }

  const url = new URL(`https://${BONDS_TV_RAPIDAPI_HOST}/api/price/${options.symbol}`);
  url.searchParams.set("timeframe", options.timeframe ?? "D");
  url.searchParams.set("range", String(options.range));
  url.searchParams.set("to", String(options.to ?? 0));

  const dispatcher = tvUsesProxy() ? getRapidApiDispatcher() : undefined;
  const res = await undiciFetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(120_000),
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": BONDS_TV_RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TradingView ${options.symbol} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = (await res.json()) as TvPriceHistoryResponse;
  if (!body.success) {
    throw new Error(`TradingView ${options.symbol}: ${body.error ?? "request failed"}`);
  }

  const history = body.data?.history ?? [];
  const current = body.data?.current;
  const bars = dedupeBars(
    [...history, ...(current ? [current] : [])]
      .map(normalizeBar)
      .filter((bar): bar is TvHistoryBar => bar != null),
  );

  return {
    symbol: body.data?.symbol ?? options.symbol,
    bars,
  };
}

export const TV_MARKET_INDEX_SYMBOLS = {
  "btc-dominance": "CRYPTOCAP:BTC.D",
  "total-1": "CRYPTOCAP:TOTAL",
  "total-2": "CRYPTOCAP:TOTAL2",
  "total-3": "CRYPTOCAP:TOTAL3",
  vix: "TVC:VIX",
  dxy: "TVC:DXY",
} as const;

export type TvMarketIndexId = keyof typeof TV_MARKET_INDEX_SYMBOLS;

export function resolveTvMarketIndexSymbol(indexId: string, fallbackSymbol?: string): string {
  if (fallbackSymbol?.trim()) return fallbackSymbol.trim();
  if (indexId in TV_MARKET_INDEX_SYMBOLS) {
    return TV_MARKET_INDEX_SYMBOLS[indexId as TvMarketIndexId];
  }
  throw new Error(`Unknown indexId "${indexId}". Pass --symbol= explicitly.`);
}
