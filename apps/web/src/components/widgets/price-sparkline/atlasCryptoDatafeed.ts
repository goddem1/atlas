import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";
import type { Datafeed, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { fetchCandles } from "../../../services/api";
import {
  generateBtcTestCandleRows,
  isBtcTestKlinePair,
  tickBtcTestCandleRow,
} from "./btcKlineTestSeries";
import { KLINE_CHART_HISTORY_DAYS, candleRowsToKlineBars, inferPricePrecisionFromBars } from "./candleKlineUtils";

const CANDLES_POLL_MS = 30 * 1000;

export function pairForCryptocurrency(c: Pick<CryptocurrencyListItem, "symbol" | "pairSymbol">): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}

type CatalogEntry = {
  crypto: CryptocurrencyListItem;
  pair: string;
  symbolInfo: SymbolInfo;
};

export type KlineActiveSymbol = {
  symbol: string;
  pair: string;
  iconUrl?: string;
};

function buildKlineCatalog(
  cryptocurrencies: CryptocurrencyListItem[],
  initial: KlineActiveSymbol,
): CatalogEntry[] {
  const byTicker = new Map<string, CatalogEntry>();

  for (const crypto of cryptocurrencies) {
    const symbolInfo = buildKlineSymbolInfo({ symbol: crypto.symbol, iconUrl: crypto.iconUrl });
    byTicker.set(symbolInfo.ticker.toUpperCase(), {
      crypto,
      pair: pairForCryptocurrency(crypto),
      symbolInfo,
    });
  }

  const initialInfo = buildKlineSymbolInfo({ symbol: initial.symbol, iconUrl: initial.iconUrl });
  const initialTicker = initialInfo.ticker.toUpperCase();
  if (!byTicker.has(initialTicker)) {
    byTicker.set(initialTicker, {
      crypto: {
        id: initialTicker,
        symbol: initial.symbol,
        name: initial.symbol,
        iconUrl: initial.iconUrl ?? "",
        pairSymbol: initial.pair,
        createdAt: "",
        updatedAt: "",
      },
      pair: initial.pair.toUpperCase(),
      symbolInfo: initialInfo,
    });
  }

  return [...byTicker.values()].sort((a, b) =>
    a.crypto.symbol.localeCompare(b.crypto.symbol, "en", { sensitivity: "base" }),
  );
}

function resolveCatalogEntry(symbol: SymbolInfo, catalog: CatalogEntry[]): CatalogEntry | null {
  const ticker = symbol.ticker?.trim().toUpperCase();
  if (ticker) {
    const byTicker = catalog.find((entry) => entry.symbolInfo.ticker.toUpperCase() === ticker);
    if (byTicker) return byTicker;
  }

  const shortName = symbol.shortName?.trim().toUpperCase();
  if (shortName) {
    const bySymbol = catalog.find((entry) => entry.crypto.symbol.toUpperCase() === shortName);
    if (bySymbol) return bySymbol;
  }

  const name = symbol.name?.trim().toUpperCase();
  if (name) {
    const byName = catalog.find(
      (entry) =>
        entry.crypto.name.toUpperCase() === name || entry.crypto.symbol.toUpperCase() === name,
    );
    if (byName) return byName;
  }

  return null;
}

function pairForSymbol(symbol: SymbolInfo, catalog: CatalogEntry[]): string {
  return resolveCatalogEntry(symbol, catalog)?.pair ?? symbol.ticker.trim().toUpperCase();
}

export function createAtlasCryptoDatafeed(options: {
  cryptocurrencies: CryptocurrencyListItem[];
  initial: KlineActiveSymbol;
  onActiveSymbolChange?: (active: KlineActiveSymbol) => void;
  onPricePrecision?: (precision: number) => void;
}): Datafeed {
  const catalog = buildKlineCatalog(options.cryptocurrencies, options.initial);
  const barsCache = new Map<string, KLineData[]>();
  const barsPromises = new Map<string, Promise<KLineData[]>>();
  /** Пары, для которых полная история уже отдана в chart (повтор = дубли на шкале). */
  const historyFullyServed = new Set<string>();
  let pollId: number | null = null;
  let lastNotifiedPair = "";
  let lastPrecision = -1;

  const notifyPricePrecision = (bars: KLineData[]) => {
    if (!options.onPricePrecision || bars.length === 0) return;
    const precision = inferPricePrecisionFromBars(bars);
    if (precision === lastPrecision) return;
    lastPrecision = precision;
    options.onPricePrecision(precision);
  };

  const notifyActiveSymbol = (symbol: SymbolInfo) => {
    const entry = resolveCatalogEntry(symbol, catalog);
    if (!entry) return;
    if (entry.pair === lastNotifiedPair) return;
    // Смена символа → Pro пересоздаёт серию; разрешаем снова отдать полный history.
    historyFullyServed.delete(entry.pair);
    lastNotifiedPair = entry.pair;
    lastPrecision = -1;
    options.onActiveSymbolChange?.({
      symbol: entry.crypto.symbol,
      pair: entry.pair,
      iconUrl: entry.crypto.iconUrl || undefined,
    });
  };

  const loadBars = async (pair: string): Promise<KLineData[]> => {
    const cached = barsCache.get(pair);
    if (cached) {
      notifyPricePrecision(cached);
      return cached;
    }

    const pending = barsPromises.get(pair);
    if (pending) return pending;

    const promise = (async () => {
      if (isBtcTestKlinePair(pair)) {
        const bars = candleRowsToKlineBars(generateBtcTestCandleRows(KLINE_CHART_HISTORY_DAYS));
        barsCache.set(pair, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      const rows = await fetchCandles(pair, KLINE_CHART_HISTORY_DAYS);
      const bars = candleRowsToKlineBars(rows);
      barsCache.set(pair, bars);
      notifyPricePrecision(bars);
      return bars;
    })().finally(() => {
      barsPromises.delete(pair);
    });

    barsPromises.set(pair, promise);
    return promise;
  };

  const clearPoll = () => {
    if (pollId != null) {
      window.clearInterval(pollId);
      pollId = null;
    }
  };

  return {
    async searchSymbols(search) {
      const query = (search ?? "").trim().toLowerCase();
      const entries = query
        ? catalog.filter((entry) => {
            const { crypto, pair, symbolInfo } = entry;
            return (
              crypto.symbol.toLowerCase().includes(query) ||
              crypto.name.toLowerCase().includes(query) ||
              pair.toLowerCase().includes(query) ||
              symbolInfo.ticker.toLowerCase().includes(query)
            );
          })
        : catalog;

      return entries.map((entry) => entry.symbolInfo);
    },

    async getHistoryKLineData(symbol, _period, from, to) {
      notifyActiveSymbol(symbol);
      const pair = pairForSymbol(symbol, catalog);

      // Помечаем до await, иначе параллельные вызовы Pro успеют оба отдать полную серию.
      if (historyFullyServed.has(pair)) {
        return [];
      }
      historyFullyServed.add(pair);

      const bars = await loadBars(pair);
      void from;
      void to;
      if (bars.length === 0) {
        historyFullyServed.delete(pair);
        return bars;
      }
      return bars;
    },

    subscribe(symbol, _period, callback) {
      notifyActiveSymbol(symbol);
      const pair = pairForSymbol(symbol, catalog);
      clearPoll();

      const pushLatest = () => {
        if (isBtcTestKlinePair(pair)) {
          const cached = barsCache.get(pair);
          if (!cached || cached.length === 0) return;

          const prevBar = cached[cached.length - 1]!;
          const prevRow: CandleApiRow = {
            openTime: new Date(prevBar.timestamp).toISOString(),
            open: String(prevBar.open),
            high: String(prevBar.high),
            low: String(prevBar.low),
            close: String(prevBar.close),
            volume: String(prevBar.volume ?? 0),
          };
          const nextRow = tickBtcTestCandleRow(prevRow);
          const last = candleRowsToKlineBars([nextRow])[0];
          if (!last) return;

          barsCache.set(pair, [...cached.slice(0, -1), last]);
          callback(last);
          return;
        }

        fetchCandles(pair, 3)
          .then((rows) => {
            const nextBars = candleRowsToKlineBars(rows);
            const last = nextBars[nextBars.length - 1];
            if (!last) return;

            const cached = barsCache.get(pair);
            if (cached && cached.length > 0) {
              const prev = cached[cached.length - 1]!;
              if (prev.timestamp === last.timestamp) {
                barsCache.set(pair, [...cached.slice(0, -1), last]);
              } else if (last.timestamp > prev.timestamp) {
                barsCache.set(pair, [...cached, last]);
              }
            }

            callback(last);
          })
          .catch(() => {
            // polling errors are non-fatal
          });
      };

      pushLatest();
      pollId = window.setInterval(pushLatest, CANDLES_POLL_MS);
    },

    unsubscribe() {
      clearPoll();
    },
  };
}

export const KLINE_DAILY_PERIOD: Period = {
  multiplier: 1,
  timespan: "day",
  text: "Д",
};

export const KLINE_DAILY_PERIODS: Period[] = [KLINE_DAILY_PERIOD];

export function buildKlineSymbolInfo(params: {
  symbol: string;
  iconUrl?: string;
  pricePrecision?: number;
}): SymbolInfo {
  return {
    ticker: `${params.symbol}USDT`,
    name: params.symbol,
    shortName: params.symbol,
    exchange: "BINANCE",
    market: "crypto",
    priceCurrency: "USDT",
    type: "crypto",
    logo: params.iconUrl,
    pricePrecision: params.pricePrecision ?? 2,
    volumePrecision: 0,
  };
}

export type { KLineData };
