import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";
import type { Datafeed, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { fetchCandles, fetchFearGreedDailyBars, fetchMarketIndexDailyBars, fetchTelegramNewsDailyIndex } from "../../../services/api";
import {
  generateBtcTestCandleRows,
  isBtcTestKlinePair,
  tickBtcTestCandleRow,
} from "./btcKlineTestSeries";
import { KLINE_CHART_HISTORY_DAYS, candleRowsToKlineBars, colorBarsByPreviousClose, inferPricePrecisionFromBars, mergeKlineBarsByTimestamp } from "./candleKlineUtils";
import {
  BTC_DOMINANCE_CHART_PAIR,
  BTC_DOMINANCE_CHART_SYMBOL,
  BTC_DOMINANCE_CHART_HISTORY_LIMIT,
  BTC_DOMINANCE_INDEX_ID,
  buildBtcDominanceSymbolInfo,
  btcDominanceBarsToRawKlineBars,
  isBtcDominancePair,
} from "./btcDominanceChartSymbol";
import {
  TOTAL_MARKET_CAP_CHART_PAIR,
  TOTAL_MARKET_CAP_CHART_SYMBOL,
  TOTAL_MARKET_CAP_CHART_HISTORY_LIMIT,
  TOTAL_MARKET_CAP_INDEX_ID,
  buildTotalMarketCapSymbolInfo,
  isTotalMarketCapPair,
  totalMarketCapBarsToRawKlineBars,
} from "./totalMarketCapChartSymbol";
import {
  TOTAL2_MARKET_CAP_CHART_PAIR,
  TOTAL2_MARKET_CAP_CHART_SYMBOL,
  TOTAL2_MARKET_CAP_CHART_HISTORY_LIMIT,
  TOTAL2_MARKET_CAP_INDEX_ID,
  buildTotal2MarketCapSymbolInfo,
  isTotal2MarketCapPair,
  total2MarketCapBarsToRawKlineBars,
} from "./total2MarketCapChartSymbol";
import {
  TOTAL3_MARKET_CAP_CHART_PAIR,
  TOTAL3_MARKET_CAP_CHART_SYMBOL,
  TOTAL3_MARKET_CAP_CHART_HISTORY_LIMIT,
  TOTAL3_MARKET_CAP_INDEX_ID,
  buildTotal3MarketCapSymbolInfo,
  isTotal3MarketCapPair,
  total3MarketCapBarsToRawKlineBars,
} from "./total3MarketCapChartSymbol";
import {
  NEWS_INDEX_CHART_PAIR,
  NEWS_INDEX_CHART_SYMBOL,
  buildNewsIndexSymbolInfo,
  isNewsIndexPair,
  newsIndexPointsToKlineBars,
} from "./newsIndexChartSymbol";
import {
  FEAR_GREED_CHART_PAIR,
  FEAR_GREED_CHART_SYMBOL,
  FEAR_GREED_CHART_HISTORY_LIMIT,
  buildFearGreedSymbolInfo,
  fearGreedBarsToKlineBars,
  isFearGreedPair,
} from "./fearGreedChartSymbol";
import {
  DXY_CHART_PAIR,
  DXY_CHART_SYMBOL,
  DXY_CHART_HISTORY_LIMIT,
  DXY_INDEX_ID,
  buildDxySymbolInfo,
  dxyBarsToRawKlineBars,
  isDxyPair,
} from "./dxyChartSymbol";
import {
  VIX_CHART_PAIR,
  VIX_CHART_SYMBOL,
  VIX_CHART_HISTORY_LIMIT,
  VIX_INDEX_ID,
  buildVixSymbolInfo,
  isVixPair,
  vixBarsToRawKlineBars,
} from "./vixChartSymbol";

const CANDLES_POLL_MS = 30 * 1000;
const INDEX_DAILY_POLL_MS = 5 * 60 * 1000;

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

  return [...byTicker.values()]
    .concat(
      newsIndexCatalogEntry(),
      fearGreedCatalogEntry(),
      btcDominanceCatalogEntry(),
      totalMarketCapCatalogEntry(),
      total2MarketCapCatalogEntry(),
      total3MarketCapCatalogEntry(),
      dxyCatalogEntry(),
      vixCatalogEntry(),
    )
    .sort((a, b) => a.crypto.symbol.localeCompare(b.crypto.symbol, "en", { sensitivity: "base" }));
}

function newsIndexCatalogEntry(): CatalogEntry {
  const symbolInfo = buildNewsIndexSymbolInfo();
  return {
    crypto: {
      id: NEWS_INDEX_CHART_SYMBOL,
      symbol: NEWS_INDEX_CHART_SYMBOL,
      name: "Индекс новостей",
      iconUrl: "",
      pairSymbol: NEWS_INDEX_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: NEWS_INDEX_CHART_PAIR,
    symbolInfo,
  };
}

function fearGreedCatalogEntry(): CatalogEntry {
  const symbolInfo = buildFearGreedSymbolInfo();
  return {
    crypto: {
      id: FEAR_GREED_CHART_SYMBOL,
      symbol: FEAR_GREED_CHART_SYMBOL,
      name: "Fear & Greed",
      iconUrl: "",
      pairSymbol: FEAR_GREED_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: FEAR_GREED_CHART_PAIR,
    symbolInfo,
  };
}

function btcDominanceCatalogEntry(): CatalogEntry {
  const symbolInfo = buildBtcDominanceSymbolInfo();
  return {
    crypto: {
      id: BTC_DOMINANCE_CHART_SYMBOL,
      symbol: BTC_DOMINANCE_CHART_SYMBOL,
      name: "BTC доминация",
      iconUrl: "",
      pairSymbol: BTC_DOMINANCE_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: BTC_DOMINANCE_CHART_PAIR,
    symbolInfo,
  };
}

function totalMarketCapCatalogEntry(): CatalogEntry {
  const symbolInfo = buildTotalMarketCapSymbolInfo();
  return {
    crypto: {
      id: TOTAL_MARKET_CAP_CHART_SYMBOL,
      symbol: TOTAL_MARKET_CAP_CHART_SYMBOL,
      name: "Total market cap",
      iconUrl: "",
      pairSymbol: TOTAL_MARKET_CAP_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: TOTAL_MARKET_CAP_CHART_PAIR,
    symbolInfo,
  };
}

function total2MarketCapCatalogEntry(): CatalogEntry {
  const symbolInfo = buildTotal2MarketCapSymbolInfo();
  return {
    crypto: {
      id: TOTAL2_MARKET_CAP_CHART_SYMBOL,
      symbol: TOTAL2_MARKET_CAP_CHART_SYMBOL,
      name: "Total 2",
      iconUrl: "",
      pairSymbol: TOTAL2_MARKET_CAP_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: TOTAL2_MARKET_CAP_CHART_PAIR,
    symbolInfo,
  };
}

function total3MarketCapCatalogEntry(): CatalogEntry {
  const symbolInfo = buildTotal3MarketCapSymbolInfo();
  return {
    crypto: {
      id: TOTAL3_MARKET_CAP_CHART_SYMBOL,
      symbol: TOTAL3_MARKET_CAP_CHART_SYMBOL,
      name: "Total 3",
      iconUrl: "",
      pairSymbol: TOTAL3_MARKET_CAP_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: TOTAL3_MARKET_CAP_CHART_PAIR,
    symbolInfo,
  };
}

function dxyCatalogEntry(): CatalogEntry {
  const symbolInfo = buildDxySymbolInfo();
  return {
    crypto: {
      id: DXY_CHART_SYMBOL,
      symbol: DXY_CHART_SYMBOL,
      name: "US Dollar Index",
      iconUrl: "",
      pairSymbol: DXY_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: DXY_CHART_PAIR,
    symbolInfo,
  };
}

function vixCatalogEntry(): CatalogEntry {
  const symbolInfo = buildVixSymbolInfo();
  return {
    crypto: {
      id: VIX_CHART_SYMBOL,
      symbol: VIX_CHART_SYMBOL,
      name: "VIX Volatility Index",
      iconUrl: "",
      pairSymbol: VIX_CHART_PAIR,
      createdAt: "",
      updatedAt: "",
    },
    pair: VIX_CHART_PAIR,
    symbolInfo,
  };
}

function resolveCatalogEntry(symbol: SymbolInfo, catalog: CatalogEntry[]): CatalogEntry | null {
  const ticker = symbol.ticker?.trim().toUpperCase();
  if (ticker && isNewsIndexPair(ticker)) {
    return catalog.find((entry) => isNewsIndexPair(entry.pair)) ?? newsIndexCatalogEntry();
  }
  if (ticker && isFearGreedPair(ticker)) {
    return catalog.find((entry) => isFearGreedPair(entry.pair)) ?? fearGreedCatalogEntry();
  }
  if (ticker && isBtcDominancePair(ticker)) {
    return catalog.find((entry) => isBtcDominancePair(entry.pair)) ?? btcDominanceCatalogEntry();
  }
  if (ticker && isTotalMarketCapPair(ticker)) {
    return catalog.find((entry) => isTotalMarketCapPair(entry.pair)) ?? totalMarketCapCatalogEntry();
  }
  if (ticker && isTotal2MarketCapPair(ticker)) {
    return catalog.find((entry) => isTotal2MarketCapPair(entry.pair)) ?? total2MarketCapCatalogEntry();
  }
  if (ticker && isTotal3MarketCapPair(ticker)) {
    return catalog.find((entry) => isTotal3MarketCapPair(entry.pair)) ?? total3MarketCapCatalogEntry();
  }
  if (ticker && isDxyPair(ticker)) {
    return catalog.find((entry) => isDxyPair(entry.pair)) ?? dxyCatalogEntry();
  }
  if (ticker && isVixPair(ticker)) {
    return catalog.find((entry) => isVixPair(entry.pair)) ?? vixCatalogEntry();
  }
  if (ticker) {
    const byTicker = catalog.find((entry) => entry.symbolInfo.ticker.toUpperCase() === ticker);
    if (byTicker) return byTicker;
  }

  const shortName = symbol.shortName?.trim().toUpperCase();
  if (shortName) {
    if (isNewsIndexPair(shortName) || shortName === "NEWS") {
      return catalog.find((entry) => isNewsIndexPair(entry.pair)) ?? newsIndexCatalogEntry();
    }
    if (isFearGreedPair(shortName)) {
      return catalog.find((entry) => isFearGreedPair(entry.pair)) ?? fearGreedCatalogEntry();
    }
    if (isBtcDominancePair(shortName)) {
      return catalog.find((entry) => isBtcDominancePair(entry.pair)) ?? btcDominanceCatalogEntry();
    }
    if (isTotalMarketCapPair(shortName)) {
      return catalog.find((entry) => isTotalMarketCapPair(entry.pair)) ?? totalMarketCapCatalogEntry();
    }
    if (isTotal2MarketCapPair(shortName)) {
      return catalog.find((entry) => isTotal2MarketCapPair(entry.pair)) ?? total2MarketCapCatalogEntry();
    }
    if (isTotal3MarketCapPair(shortName)) {
      return catalog.find((entry) => isTotal3MarketCapPair(entry.pair)) ?? total3MarketCapCatalogEntry();
    }
    if (isDxyPair(shortName)) {
      return catalog.find((entry) => isDxyPair(entry.pair)) ?? dxyCatalogEntry();
    }
    if (isVixPair(shortName)) {
      return catalog.find((entry) => isVixPair(entry.pair)) ?? vixCatalogEntry();
    }
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
  const rawIndexBarsCache = new Map<string, KLineData[]>();
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
      if (isNewsIndexPair(pair)) {
        const data = await fetchTelegramNewsDailyIndex({ limit: 366 });
        const bars = newsIndexPointsToKlineBars(data.points ?? []);
        barsCache.set(NEWS_INDEX_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isFearGreedPair(pair)) {
        const data = await fetchFearGreedDailyBars({ limit: FEAR_GREED_CHART_HISTORY_LIMIT });
        const bars = fearGreedBarsToKlineBars(data.points ?? []);
        barsCache.set(FEAR_GREED_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isBtcDominancePair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: BTC_DOMINANCE_INDEX_ID,
          limit: BTC_DOMINANCE_CHART_HISTORY_LIMIT,
        });
        const raw = btcDominanceBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(BTC_DOMINANCE_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(BTC_DOMINANCE_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isTotalMarketCapPair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: TOTAL_MARKET_CAP_INDEX_ID,
          limit: TOTAL_MARKET_CAP_CHART_HISTORY_LIMIT,
        });
        const raw = totalMarketCapBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(TOTAL_MARKET_CAP_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(TOTAL_MARKET_CAP_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isTotal2MarketCapPair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: TOTAL2_MARKET_CAP_INDEX_ID,
          limit: TOTAL2_MARKET_CAP_CHART_HISTORY_LIMIT,
        });
        const raw = total2MarketCapBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(TOTAL2_MARKET_CAP_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(TOTAL2_MARKET_CAP_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isTotal3MarketCapPair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: TOTAL3_MARKET_CAP_INDEX_ID,
          limit: TOTAL3_MARKET_CAP_CHART_HISTORY_LIMIT,
        });
        const raw = total3MarketCapBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(TOTAL3_MARKET_CAP_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(TOTAL3_MARKET_CAP_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isDxyPair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: DXY_INDEX_ID,
          limit: DXY_CHART_HISTORY_LIMIT,
        });
        const raw = dxyBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(DXY_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(DXY_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

      if (isVixPair(pair)) {
        const data = await fetchMarketIndexDailyBars({
          indexId: VIX_INDEX_ID,
          limit: VIX_CHART_HISTORY_LIMIT,
        });
        const raw = vixBarsToRawKlineBars(data.points ?? []);
        rawIndexBarsCache.set(VIX_CHART_PAIR, raw);
        const bars = colorBarsByPreviousClose(raw);
        barsCache.set(VIX_CHART_PAIR, bars);
        notifyPricePrecision(bars);
        return bars;
      }

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
        if (isNewsIndexPair(pair)) {
          fetchTelegramNewsDailyIndex({ limit: 366 })
            .then((data) => {
              const nextBars = newsIndexPointsToKlineBars(data.points ?? []);
              const last = nextBars[nextBars.length - 1];
              if (!last) return;
              barsCache.set(NEWS_INDEX_CHART_PAIR, nextBars);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isFearGreedPair(pair)) {
          fetchFearGreedDailyBars({ limit: 5 })
            .then((data) => {
              const incoming = fearGreedBarsToKlineBars(data.points ?? []);
              const cached = barsCache.get(FEAR_GREED_CHART_PAIR) ?? [];
              const merged = mergeKlineBarsByTimestamp(cached, incoming);
              const last = merged[merged.length - 1];
              if (!last) return;
              barsCache.set(FEAR_GREED_CHART_PAIR, merged);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isBtcDominancePair(pair)) {
          fetchMarketIndexDailyBars({ indexId: BTC_DOMINANCE_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = btcDominanceBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(BTC_DOMINANCE_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(BTC_DOMINANCE_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(BTC_DOMINANCE_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isTotalMarketCapPair(pair)) {
          fetchMarketIndexDailyBars({ indexId: TOTAL_MARKET_CAP_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = totalMarketCapBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(TOTAL_MARKET_CAP_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(TOTAL_MARKET_CAP_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(TOTAL_MARKET_CAP_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isTotal2MarketCapPair(pair)) {
          fetchMarketIndexDailyBars({ indexId: TOTAL2_MARKET_CAP_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = total2MarketCapBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(TOTAL2_MARKET_CAP_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(TOTAL2_MARKET_CAP_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(TOTAL2_MARKET_CAP_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isTotal3MarketCapPair(pair)) {
          fetchMarketIndexDailyBars({ indexId: TOTAL3_MARKET_CAP_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = total3MarketCapBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(TOTAL3_MARKET_CAP_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(TOTAL3_MARKET_CAP_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(TOTAL3_MARKET_CAP_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isDxyPair(pair)) {
          fetchMarketIndexDailyBars({ indexId: DXY_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = dxyBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(DXY_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(DXY_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(DXY_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

        if (isVixPair(pair)) {
          fetchMarketIndexDailyBars({ indexId: VIX_INDEX_ID, limit: 5 })
            .then((data) => {
              const incoming = vixBarsToRawKlineBars(data.points ?? []);
              const mergedRaw = mergeKlineBarsByTimestamp(rawIndexBarsCache.get(VIX_CHART_PAIR) ?? [], incoming);
              rawIndexBarsCache.set(VIX_CHART_PAIR, mergedRaw);
              const display = colorBarsByPreviousClose(mergedRaw);
              const last = display[display.length - 1];
              if (!last) return;
              barsCache.set(VIX_CHART_PAIR, display);
              callback(last);
            })
            .catch(() => {
              // polling errors are non-fatal
            });
          return;
        }

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
      pollId = window.setInterval(
        pushLatest,
        isNewsIndexPair(pair) ||
          isFearGreedPair(pair) ||
          isBtcDominancePair(pair) ||
          isTotalMarketCapPair(pair) ||
          isTotal2MarketCapPair(pair) ||
          isTotal3MarketCapPair(pair) ||
          isDxyPair(pair) ||
          isVixPair(pair)
          ? INDEX_DAILY_POLL_MS
          : CANDLES_POLL_MS,
      );
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
