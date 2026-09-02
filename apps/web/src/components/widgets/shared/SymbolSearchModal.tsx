import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem, WatchlistListData } from "@atlas-v1/shared";
import { normalizeSymbolList, WATCHLIST_MAX_SYMBOLS } from "@atlas-v1/shared";
import { fetchMarketIndicesLatest, fetchMarketIndexDailyBars, fetchTelegramNewsDailyIndex } from "../../../services/api";
import { pairForCryptocurrency } from "../price-sparkline/atlasCryptoDatafeed";
import { isDashboardDarkTheme } from "../price-sparkline/candleKlineUtils";
import { BTC_DOMINANCE_CHART_SYMBOL } from "../price-sparkline/btcDominanceChartSymbol";
import { NEWS_INDEX_CHART_SYMBOL } from "../price-sparkline/newsIndexChartSymbol";
import { TOTAL_MARKET_CAP_CHART_SYMBOL } from "../price-sparkline/totalMarketCapChartSymbol";
import { TOTAL2_MARKET_CAP_CHART_SYMBOL } from "../price-sparkline/total2MarketCapChartSymbol";
import { TOTAL3_MARKET_CAP_CHART_SYMBOL } from "../price-sparkline/total3MarketCapChartSymbol";
import { FEAR_GREED_CHART_SYMBOL } from "../price-sparkline/fearGreedChartSymbol";
import { DXY_CHART_SYMBOL } from "../price-sparkline/dxyChartSymbol";
import { VIX_CHART_SYMBOL } from "../price-sparkline/vixChartSymbol";
import { formatIndexCompactValue } from "../index/indexFormat";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import "./symbol-search-modal.css";

const EXCHANGE_NAME = "Binance";
const EXCHANGE_LOGO = "https://s3-symbol-logo.tradingview.com/source/BINANCE.svg";
const MARKET_TYPE = "spot crypto";
/** Сколько строк рендерить сразу — полный каталог слишком тяжёлый для первого кадра. */
const LIST_PAGE_SIZE = 48;
const INDEX_CHART_SYMBOLS = new Set([
  NEWS_INDEX_CHART_SYMBOL,
  BTC_DOMINANCE_CHART_SYMBOL,
  TOTAL_MARKET_CAP_CHART_SYMBOL,
  TOTAL2_MARKET_CAP_CHART_SYMBOL,
  TOTAL3_MARKET_CAP_CHART_SYMBOL,
  FEAR_GREED_CHART_SYMBOL,
  DXY_CHART_SYMBOL,
  VIX_CHART_SYMBOL,
]);

type SearchCategory = "index" | "crypto";

type IndexSearchOption = {
  symbol: string;
  ticker: string;
  title: string;
  marketType: string;
  metric: string | null;
  logoLetter: string;
  logoClass: string;
  matches: (query: string) => boolean;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  items: CryptocurrencyListItem[];
  loadError?: string | null;
  activeSymbol?: string | null;
  /** Внутри попапа графика — без портала в body, по центру родителя. */
  embedded?: boolean;
  watchlistLists?: WatchlistListData[];
  onWatchlistListsChange?: (lists: WatchlistListData[]) => void;
  /** Если задан — в поиске появляются вкладки «Индекс» / «Крипто». */
  onSelectNewsIndex?: () => void;
  onSelectBtcDominance?: () => void;
  onSelectTotalMarketCap?: () => void;
  onSelectTotal2MarketCap?: () => void;
  onSelectTotal3MarketCap?: () => void;
  onSelectFearGreed?: () => void;
  onSelectDxy?: () => void;
  onSelectVix?: () => void;
  onClose: () => void;
  onSelect: (c: CryptocurrencyListItem) => void;
};

type SearchRow = {
  crypto: CryptocurrencyListItem;
  pair: string;
  description: string;
};

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <em>{text.slice(index, index + q.length)}</em>
      {text.slice(index + q.length)}
    </>
  );
}

function formatDescription(crypto: CryptocurrencyListItem, pair: string): string {
  const quote = pair.replace(new RegExp(`^${crypto.symbol}`, "i"), "");
  if (quote && quote !== pair) {
    const normalizedQuote = quote === "USDT" ? "TetherUS" : quote;
    return `${crypto.symbol} / ${normalizedQuote}`;
  }
  if (crypto.name && crypto.name !== crypto.symbol) {
    return crypto.name;
  }
  return pair;
}

function symbolInList(list: WatchlistListData, symbol: string): boolean {
  const key = symbol.trim().toUpperCase();
  return list.symbols.some((item) => item.toUpperCase() === key);
}

function toggleSymbolInList(
  lists: WatchlistListData[],
  listId: string,
  symbol: string,
): WatchlistListData[] {
  const key = symbol.trim().toUpperCase();
  return lists.map((list) => {
    if (list.id !== listId) return list;
    if (symbolInList(list, key)) {
      return {
        ...list,
        symbols: list.symbols.filter((item) => item.toUpperCase() !== key),
      };
    }
    if (list.symbols.length >= WATCHLIST_MAX_SYMBOLS) return list;
    return {
      ...list,
      symbols: normalizeSymbolList([...list.symbols, key]),
    };
  });
}

export function SymbolSearchModal({
  open,
  items,
  loadError,
  activeSymbol,
  embedded = false,
  watchlistLists = [],
  onWatchlistListsChange,
  onSelectNewsIndex,
  onSelectBtcDominance,
  onSelectTotalMarketCap,
  onSelectTotal2MarketCap,
  onSelectTotal3MarketCap,
  onSelectFearGreed,
  onSelectDxy,
  onSelectVix,
  onClose,
  onSelect,
}: Props) {
  useBackdropBlurPause(open);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [bookmarkMenuSymbol, setBookmarkMenuSymbol] = useState<string | null>(null);
  const [category, setCategory] = useState<SearchCategory>("crypto");
  const [newsSentiment, setNewsSentiment] = useState<number | null>(null);
  const [btcDominance, setBtcDominance] = useState<string | null>(null);
  const [totalMarketCap, setTotalMarketCap] = useState<string | null>(null);
  const [total2MarketCap, setTotal2MarketCap] = useState<string | null>(null);
  const [total3MarketCap, setTotal3MarketCap] = useState<string | null>(null);
  const [fearGreedScore, setFearGreedScore] = useState<number | null>(null);
  const [dxyValue, setDxyValue] = useState<string | null>(null);
  const [vixValue, setVixValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const bookmarkMenuRef = useRef<HTMLDivElement>(null);

  const bookmarksEnabled = watchlistLists.length > 0 && Boolean(onWatchlistListsChange);
  const categoriesEnabled = Boolean(
    onSelectNewsIndex ||
    onSelectBtcDominance ||
    onSelectTotalMarketCap ||
    onSelectTotal2MarketCap ||
    onSelectTotal3MarketCap ||
    onSelectFearGreed ||
    onSelectDxy ||
    onSelectVix,
  );

  const indexOptions = useMemo<IndexSearchOption[]>(() => {
    const opts: IndexSearchOption[] = [];
    if (onSelectNewsIndex) {
      opts.push({
        symbol: NEWS_INDEX_CHART_SYMBOL,
        ticker: "NEWS",
        title: "Индекс новостей · дневной сентимент",
        marketType: "news index",
        metric: newsSentiment != null ? `${newsSentiment}` : "Atlas",
        logoLetter: "N",
        logoClass: "symbol-search-logo-fallback--news",
        matches: (query) => {
          const labels = ["news", "newsidx", "индекс", "новости", "sentiment", "сентимент"];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectNewsIndex,
      });
    }
    if (onSelectFearGreed) {
      opts.push({
        symbol: FEAR_GREED_CHART_SYMBOL,
        ticker: "FNG",
        title: "Fear & Greed · дневная история",
        marketType: "sentiment index",
        metric: fearGreedScore != null ? `${fearGreedScore}` : "Atlas",
        logoLetter: "F",
        logoClass: "symbol-search-logo-fallback--fear-greed",
        matches: (query) => {
          const labels = [
            "fng",
            "fear",
            "greed",
            "страх",
            "жадность",
            "feargreed",
            "fear-greed",
            "sentiment",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectFearGreed,
      });
    }
    if (onSelectBtcDominance) {
      opts.push({
        symbol: BTC_DOMINANCE_CHART_SYMBOL,
        ticker: "BTCDOM",
        title: "BTC доминация · дневная история",
        marketType: "market index",
        metric: btcDominance != null ? `${btcDominance}%` : "Atlas",
        logoLetter: "B",
        logoClass: "symbol-search-logo-fallback--btc-dom",
        matches: (query) => {
          const labels = [
            "btc",
            "btcdom",
            "btcd",
            "dominance",
            "доминация",
            "доминирование",
            "btc.d",
            "cryptocap",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectBtcDominance,
      });
    }
    if (onSelectTotalMarketCap) {
      opts.push({
        symbol: TOTAL_MARKET_CAP_CHART_SYMBOL,
        ticker: "TOTAL",
        title: "Total market cap · дневная история",
        marketType: "market index",
        metric: totalMarketCap ?? "Atlas",
        logoLetter: "T",
        logoClass: "symbol-search-logo-fallback--total",
        matches: (query) => {
          const labels = [
            "total",
            "total1",
            "market cap",
            "marketcap",
            "капитализация",
            "капитал",
            "cryptocap",
            "cryptocap:total",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectTotalMarketCap,
      });
    }
    if (onSelectTotal2MarketCap) {
      opts.push({
        symbol: TOTAL2_MARKET_CAP_CHART_SYMBOL,
        ticker: "TOTAL2",
        title: "Total 2 · altcoin market cap",
        marketType: "market index",
        metric: total2MarketCap ?? "Atlas",
        logoLetter: "2",
        logoClass: "symbol-search-logo-fallback--total2",
        matches: (query) => {
          const labels = [
            "total2",
            "total 2",
            "altcoin",
            "альткоин",
            "альты",
            "marketcap",
            "капитализация",
            "cryptocap:total2",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectTotal2MarketCap,
      });
    }
    if (onSelectTotal3MarketCap) {
      opts.push({
        symbol: TOTAL3_MARKET_CAP_CHART_SYMBOL,
        ticker: "TOTAL3",
        title: "Total 3 · дневная история",
        marketType: "market index",
        metric: total3MarketCap ?? "Atlas",
        logoLetter: "3",
        logoClass: "symbol-search-logo-fallback--total3",
        matches: (query) => {
          const labels = [
            "total3",
            "total 3",
            "marketcap",
            "капитализация",
            "cryptocap:total3",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectTotal3MarketCap,
      });
    }
    if (onSelectDxy) {
      opts.push({
        symbol: DXY_CHART_SYMBOL,
        ticker: "DXY",
        title: "US Dollar Index · дневная история",
        marketType: "market index",
        metric: dxyValue ?? "Atlas",
        logoLetter: "$",
        logoClass: "symbol-search-logo-fallback--dxy",
        matches: (query) => {
          const labels = [
            "dxy",
            "dollar",
            "usd",
            "доллар",
            "индекс",
            "usdx",
            "tvc:dxy",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectDxy,
      });
    }
    if (onSelectVix) {
      opts.push({
        symbol: VIX_CHART_SYMBOL,
        ticker: "VIX",
        title: "VIX Volatility Index · дневная история",
        marketType: "market index",
        metric: vixValue ?? "Atlas",
        logoLetter: "V",
        logoClass: "symbol-search-logo-fallback--vix",
        matches: (query) => {
          const labels = [
            "vix",
            "volatility",
            "волатильность",
            "страх",
            "индекс",
            "cboe",
            "tvc:vix",
          ];
          return labels.some((label) => label.includes(query) || query.includes(label));
        },
        onSelect: onSelectVix,
      });
    }
    return opts;
  }, [
    onSelectNewsIndex,
    onSelectBtcDominance,
    onSelectTotalMarketCap,
    onSelectTotal2MarketCap,
    onSelectTotal3MarketCap,
    onSelectFearGreed,
    onSelectDxy,
    onSelectVix,
    newsSentiment,
    btcDominance,
    totalMarketCap,
    total2MarketCap,
    total3MarketCap,
    fearGreedScore,
    dxyValue,
    vixValue,
  ]);

  const filteredIndexOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return indexOptions;
    return indexOptions.filter((option) => option.matches(normalized));
  }, [indexOptions, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setVisibleCount(LIST_PAGE_SIZE);
      setBookmarkMenuSymbol(null);
      return;
    }
    const active = activeSymbol?.trim().toUpperCase() ?? "";
    setCategory(INDEX_CHART_SYMBOLS.has(active) ? "index" : "crypto");
  }, [open, activeSymbol]);

  useEffect(() => {
    if (!open || !categoriesEnabled) return;
    let cancelled = false;
    void fetchTelegramNewsDailyIndex({ limit: 2 })
      .then((data) => {
        if (cancelled) return;
        const points = data.points ?? [];
        const last = points[points.length - 1];
        setNewsSentiment(last && Number.isFinite(last.sentiment) ? last.sentiment : null);
      })
      .catch(() => {
        if (!cancelled) setNewsSentiment(null);
      });
    if (
      onSelectBtcDominance ||
      onSelectTotalMarketCap ||
      onSelectTotal2MarketCap ||
      onSelectTotal3MarketCap ||
      onSelectFearGreed
    ) {
      void fetchMarketIndicesLatest()
        .then((data) => {
          if (cancelled) return;
          if (onSelectBtcDominance) {
            const value = Number.parseFloat(data.btcDominance);
            setBtcDominance(Number.isFinite(value) ? value.toFixed(2) : null);
          }
          if (onSelectTotalMarketCap) {
            const value = Number.parseFloat(data.totalMarketCap);
            setTotalMarketCap(Number.isFinite(value) ? formatIndexCompactValue(value) : null);
          }
          if (onSelectTotal2MarketCap) {
            const value = Number.parseFloat(data.altcoinMarketCap);
            setTotal2MarketCap(Number.isFinite(value) ? formatIndexCompactValue(value) : null);
          }
          if (onSelectTotal3MarketCap) {
            const value = Number.parseFloat(data.total3MarketCap);
            setTotal3MarketCap(Number.isFinite(value) ? formatIndexCompactValue(value) : null);
          }
          if (onSelectFearGreed) {
            setFearGreedScore(Number.isFinite(data.fearGreedValue) ? data.fearGreedValue : null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            if (onSelectBtcDominance) setBtcDominance(null);
            if (onSelectTotalMarketCap) setTotalMarketCap(null);
            if (onSelectTotal2MarketCap) setTotal2MarketCap(null);
            if (onSelectTotal3MarketCap) setTotal3MarketCap(null);
            if (onSelectFearGreed) setFearGreedScore(null);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    open,
    categoriesEnabled,
    onSelectBtcDominance,
    onSelectTotalMarketCap,
    onSelectTotal2MarketCap,
    onSelectTotal3MarketCap,
    onSelectFearGreed,
  ]);

  useEffect(() => {
    if (!open || !onSelectDxy) return;
    let cancelled = false;
    void fetchMarketIndexDailyBars({ indexId: "dxy", limit: 1 })
      .then((data) => {
        if (cancelled) return;
        const points = data.points ?? [];
        const last = points[points.length - 1];
        const value = last ? Number.parseFloat(last.close) : Number.NaN;
        setDxyValue(Number.isFinite(value) ? value.toFixed(3) : null);
      })
      .catch(() => {
        if (!cancelled) setDxyValue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, onSelectDxy]);

  useEffect(() => {
    if (!open || !onSelectVix) return;
    let cancelled = false;
    void fetchMarketIndexDailyBars({ indexId: "vix", limit: 1 })
      .then((data) => {
        if (cancelled) return;
        const points = data.points ?? [];
        const last = points[points.length - 1];
        const value = last ? Number.parseFloat(last.close) : Number.NaN;
        setVixValue(Number.isFinite(value) ? value.toFixed(2) : null);
      })
      .catch(() => {
        if (!cancelled) setVixValue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, onSelectVix]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (bookmarkMenuSymbol) {
        setBookmarkMenuSymbol(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, bookmarkMenuSymbol]);

  useEffect(() => {
    if (!bookmarkMenuSymbol) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bookmarkMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".symbol-search-bookmark")) return;
      setBookmarkMenuSymbol(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [bookmarkMenuSymbol]);

  const rows = useMemo<SearchRow[]>(() => {
    return items.map((crypto) => {
      const pair = pairForCryptocurrency(crypto);
      return {
        crypto,
        pair,
        description: formatDescription(crypto, pair),
      };
    });
  }, [items]);

  const filtered = useMemo(() => {
    if (categoriesEnabled && category === "index") return [];
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      ({ crypto, pair, description }) =>
        crypto.symbol.toLowerCase().includes(s) ||
        crypto.name.toLowerCase().includes(s) ||
        pair.toLowerCase().includes(s) ||
        description.toLowerCase().includes(s),
    );
  }, [rows, query, categoriesEnabled, category]);

  const membershipBySymbol = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const list of watchlistLists) {
      for (const symbol of list.symbols) {
        const key = symbol.toUpperCase();
        const current = map.get(key);
        if (current) current.push(list.id);
        else map.set(key, [list.id]);
      }
    }
    return map;
  }, [watchlistLists]);

  useEffect(() => {
    setActiveIndex(0);
    setVisibleCount(LIST_PAGE_SIZE);
  }, [query, filtered.length, filteredIndexOptions.length, category]);

  useEffect(() => {
    if (activeIndex + 8 < visibleCount) return;
    setVisibleCount((prev) => Math.min(filtered.length, Math.max(prev, activeIndex + LIST_PAGE_SIZE)));
  }, [activeIndex, filtered.length, visibleCount]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const visibleRows = filtered.slice(0, visibleCount);

  const handleListScroll = (e: UIEvent<HTMLUListElement>) => {
    if (visibleCount >= filtered.length) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 96) return;
    setVisibleCount((prev) => Math.min(filtered.length, prev + LIST_PAGE_SIZE));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (categoriesEnabled && category === "index") {
      if (filteredIndexOptions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filteredIndexOptions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const option = filteredIndexOptions[activeIndex];
        if (!option) return;
        option.onSelect();
        onClose();
      }
      return;
    }

    if (filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[activeIndex];
      if (row) {
        onSelect(row.crypto);
        onClose();
      }
    }
  };

  const handleBookmarkClick = (event: React.MouseEvent, symbol: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!bookmarksEnabled || !onWatchlistListsChange) return;

    if (watchlistLists.length === 1) {
      const only = watchlistLists[0]!;
      onWatchlistListsChange(toggleSymbolInList(watchlistLists, only.id, symbol));
      setBookmarkMenuSymbol(null);
      return;
    }

    setBookmarkMenuSymbol((prev) => (prev === symbol.toUpperCase() ? null : symbol.toUpperCase()));
  };

  const handleToggleListMembership = (listId: string, symbol: string) => {
    if (!onWatchlistListsChange) return;
    onWatchlistListsChange(toggleSymbolInList(watchlistLists, listId, symbol));
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const activeTicker = activeSymbol?.trim().toUpperCase() ?? "";
  const chartTheme = isDashboardDarkTheme() ? "dark" : "light";

  const modal = (
    <div
      className={`symbol-search-overlay${embedded ? " symbol-search-overlay--embedded" : ""}`}
      role="presentation"
    >
      <button
        type="button"
        className="symbol-search-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-search-title"
        className="symbol-search-dialog"
        data-theme={chartTheme}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="symbol-search-header">
          <h2 id="symbol-search-title" className="symbol-search-title">
            Поиск инструментов
          </h2>
          <button type="button" className="symbol-search-close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                d="m1.5 1.5 11 11m0-11-11 11"
              />
            </svg>
          </button>
        </header>

        <div className="symbol-search-input-wrap">
          <div className="symbol-search-input-box">
            <span className="symbol-search-input-icon" aria-hidden="true">
              <svg viewBox="0 0 28 28" fill="none">
                <path
                  fill="currentColor"
                  d="M12.182 4a8.18 8.18 0 0 1 6.29 13.412l5.526 5.525-1.06 1.06-5.527-5.525A8.182 8.182 0 1 1 12.181 4m0 1.5a6.681 6.681 0 1 0 0 13.363 6.681 6.681 0 0 0 0-13.363"
                />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              role="searchbox"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                categoriesEnabled && category === "index"
                  ? "Поиск индекса"
                  : "Введите название или тикера актива"
              }
              className="symbol-search-input"
            />
            <div className="symbol-search-input-actions">
              {query ? (
                <>
                  <button
                    type="button"
                    className="symbol-search-icon-btn"
                    aria-label="Очистить"
                    title="Очистить"
                    onClick={() => setQuery("")}
                  >
                    <svg viewBox="0 0 18 18">
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm0-9.04L6.04 5 5 6.04 7.96 9 5 11.96 6.04 13 9 10.04 11.96 13 13 11.96 10.04 9 13 6.04 11.96 5 9 7.96Z"
                      />
                    </svg>
                  </button>
                  <span className="symbol-search-input-divider" aria-hidden="true" />
                </>
              ) : null}
            </div>
          </div>
        </div>

        {categoriesEnabled ? (
          <div className="symbol-search-categories" role="tablist" aria-label="Категория">
            <button
              type="button"
              role="tab"
              aria-selected={category === "index"}
              className={`symbol-search-category${category === "index" ? " is-active" : ""}`}
              onClick={() => setCategory("index")}
            >
              Индекс
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={category === "crypto"}
              className={`symbol-search-category${category === "crypto" ? " is-active" : ""}`}
              onClick={() => setCategory("crypto")}
            >
              Крипто
            </button>
          </div>
        ) : null}

        <div className="symbol-search-list-wrap">
          <ul
            ref={listRef}
            className="symbol-search-list"
            role="listbox"
            aria-label="Результаты поиска"
            onScroll={handleListScroll}
          >
            {categoriesEnabled && category === "index" ? (
              filteredIndexOptions.length === 0 ? (
                <li className="symbol-search-message">Ничего не найдено</li>
              ) : (
                filteredIndexOptions.map((option, index) => {
                  const isRowActive = index === activeIndex;
                  const isCurrent = activeTicker === option.symbol;
                  const selectOption = () => {
                    option.onSelect();
                    onClose();
                  };

                  return (
                    <li key={option.symbol} role="presentation" className="symbol-search-row-wrap">
                      <div
                        className={`symbol-search-row${isRowActive ? " is-focused" : ""}${isCurrent ? " is-current" : ""}`}
                        data-index={index}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <div className="symbol-search-row-main">
                          <span className="symbol-search-marker" aria-hidden="true">
                            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
                              <path
                                d="M7 2.5v9M2.5 7h9"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isRowActive}
                            className="symbol-search-row-select"
                            onClick={selectOption}
                          >
                            <span className={`symbol-search-logo-fallback ${option.logoClass}`}>
                              {option.logoLetter}
                            </span>
                            <span className="symbol-search-ticker">
                              {highlightMatch(option.ticker, query)}
                            </span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="symbol-search-row-select symbol-search-row-select--desc"
                          tabIndex={-1}
                          onClick={selectOption}
                        >
                          <span className="symbol-search-desc">
                            {highlightMatch(option.title, query)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="symbol-search-row-select symbol-search-row-select--exchange"
                          tabIndex={-1}
                          onClick={selectOption}
                        >
                          <div className="symbol-search-exchange">
                            <div className="symbol-search-exchange-text">
                              <div className="symbol-search-market-type">{option.marketType}</div>
                              <div className="symbol-search-exchange-name">{option.metric ?? "Atlas"}</div>
                            </div>
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })
              )
            ) : loadError ? (
              <li className="symbol-search-message symbol-search-message-error">
                Не удалось загрузить активы: {loadError}
              </li>
            ) : items.length === 0 ? (
              <li className="symbol-search-message">
                В справочнике нет записей. Запустите API, БД и <code>pnpm db:seed</code>.
              </li>
            ) : filtered.length === 0 ? (
              <li className="symbol-search-message">Ничего не найдено</li>
            ) : (
              visibleRows.map(({ crypto, pair, description }, index) => {
                const isRowActive = index === activeIndex;
                const isCurrent = crypto.symbol.toUpperCase() === activeTicker;
                const symbolKey = crypto.symbol.toUpperCase();
                const memberListIds = membershipBySymbol.get(symbolKey) ?? [];
                const isBookmarked = memberListIds.length > 0;
                const menuOpen = bookmarkMenuSymbol === symbolKey;

                return (
                  <li key={crypto.id} role="presentation" className="symbol-search-row-wrap">
                    <div
                      className={`symbol-search-row${isRowActive ? " is-focused" : ""}${isCurrent ? " is-current" : ""}${isBookmarked ? " is-bookmarked" : ""}`}
                      data-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <div className="symbol-search-row-main">
                        {bookmarksEnabled ? (
                          <span className="symbol-search-bookmark-slot">
                            <button
                              type="button"
                              className={`symbol-search-bookmark${isBookmarked ? " is-active" : ""}${menuOpen ? " is-menu-open" : ""}`}
                              aria-label={
                                isBookmarked
                                  ? "Управление списками для инструмента"
                                  : "Добавить инструмент в список"
                              }
                              aria-haspopup={watchlistLists.length > 1 ? "menu" : undefined}
                              aria-expanded={watchlistLists.length > 1 ? menuOpen : undefined}
                              title={
                                watchlistLists.length > 1
                                  ? "Выбрать списки"
                                  : isBookmarked
                                    ? "Убрать из списка"
                                    : "Добавить в список"
                              }
                              onClick={(event) => handleBookmarkClick(event, crypto.symbol)}
                            >
                              {isBookmarked ? (
                                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden>
                                  <path
                                    d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden>
                                  <path
                                    d="M7 2.5v9M2.5 7h9"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                            </button>

                            {menuOpen ? (
                              <div
                                ref={bookmarkMenuRef}
                                className="symbol-search-bookmark-menu"
                                role="menu"
                                aria-label="Списки"
                              >
                                {watchlistLists.map((list) => {
                                  const checked = symbolInList(list, crypto.symbol);
                                  const full = !checked && list.symbols.length >= WATCHLIST_MAX_SYMBOLS;
                                  return (
                                    <button
                                      key={list.id}
                                      type="button"
                                      role="menuitemcheckbox"
                                      aria-checked={checked}
                                      disabled={full}
                                      className={`symbol-search-bookmark-menu-item${checked ? " is-checked" : ""}`}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleToggleListMembership(list.id, crypto.symbol);
                                      }}
                                    >
                                      <span
                                        className={`symbol-search-bookmark-menu-check${checked ? " is-checked" : ""}`}
                                        aria-hidden
                                      />
                                      <span className="symbol-search-bookmark-menu-label">{list.title}</span>
                                      <span className="symbol-search-bookmark-menu-count">
                                        {list.symbols.length}/{WATCHLIST_MAX_SYMBOLS}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </span>
                        ) : (
                          <span className="symbol-search-marker" aria-hidden="true">
                            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
                              <path
                                d="M7 2.5v9M2.5 7h9"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isRowActive}
                          className="symbol-search-row-select"
                          onClick={() => {
                            onSelect(crypto);
                            onClose();
                          }}
                        >
                          {crypto.iconUrl ? (
                            <img
                              src={crypto.iconUrl}
                              alt=""
                              className="symbol-search-logo"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="symbol-search-logo-fallback">{crypto.symbol.slice(0, 1)}</span>
                          )}
                          <span className="symbol-search-ticker">{highlightMatch(pair, query)}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="symbol-search-row-select symbol-search-row-select--desc"
                        tabIndex={-1}
                        onClick={() => {
                          onSelect(crypto);
                          onClose();
                        }}
                      >
                        <span className="symbol-search-desc">{highlightMatch(description, query)}</span>
                      </button>
                      <button
                        type="button"
                        className="symbol-search-row-select symbol-search-row-select--exchange"
                        tabIndex={-1}
                        onClick={() => {
                          onSelect(crypto);
                          onClose();
                        }}
                      >
                        <div className="symbol-search-exchange">
                          <div className="symbol-search-exchange-text">
                            <div className="symbol-search-market-type">{MARKET_TYPE}</div>
                            <div className="symbol-search-exchange-name">{EXCHANGE_NAME}</div>
                          </div>
                          <img
                            src={EXCHANGE_LOGO}
                            alt=""
                            className="symbol-search-exchange-logo"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );

  if (embedded) return modal;
  return createPortal(modal, document.body);
}
