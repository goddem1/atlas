import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem, WatchlistListData } from "@atlas-v1/shared";
import { KLineChartPro, type ChartPro } from "@klinecharts/pro";
import "@klinecharts/pro/dist/klinecharts-pro.css";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import { isDashboardDarkTheme } from "./candleKlineUtils";
import { buildKlineChartStyles } from "./priceSparklineKlineTheme";
import {
  KLINE_DAILY_PERIOD,
  KLINE_DAILY_PERIODS,
  buildKlineSymbolInfo,
  createAtlasCryptoDatafeed,
} from "./atlasCryptoDatafeed";
import {
  attachKlineOverlayPersistence,
  clearAllKlineOverlays,
  resolveKlineChartFromProContainer,
} from "./priceKlineOverlayPersistence";
import { attachKlineOverlayContextMenu } from "./priceKlineOverlayContextMenu";
import {
  attachKlineIndicatorPersistence,
  getDefaultStoredKlineIndicators,
  resolveInitialKlineIndicators,
  syncKlineIndicatorsFromStored,
} from "./priceKlineIndicatorPersistence";
import {
  applyKlineCandleType,
  attachKlineCandleTypeControl,
  loadStoredKlineCandleType,
} from "./priceKlineCandleTypeControl";
import { CandleType } from "klinecharts";
import { attachKlineDrawingToolControl } from "./priceKlineDrawingToolControl";
import { attachKlineIndicatorControl } from "./priceKlineIndicatorControl";
import { attachKlineIndicatorTooltipHover } from "./priceKlineIndicatorTooltipHover";
import { attachKlinePeriodBarBlocks } from "./priceKlinePeriodBarBlocks";
import { attachKlineScreenshotToolbar, type KlineScreenshotToolbarHandle } from "./priceKlineScreenshotToolbar";
import { attachKlineSymbolSearch } from "./priceKlineSymbolSearch";
import { ensureKlineRuLocale, KLINE_PRO_LOCALE } from "./priceKlineLocaleRu";
import { ensureKlineHorizontalPriceTagsAlwaysVisible } from "./priceKlineHorizontalPriceTags";
import { PriceKlineCoinList } from "./PriceKlineCoinList";
import {
  BTC_DOMINANCE_CHART_SYMBOL,
  buildBtcDominanceSymbolInfo,
  isBtcDominancePair,
} from "./btcDominanceChartSymbol";
import {
  TOTAL_MARKET_CAP_CHART_SYMBOL,
  buildTotalMarketCapSymbolInfo,
  isTotalMarketCapPair,
} from "./totalMarketCapChartSymbol";
import {
  TOTAL2_MARKET_CAP_CHART_SYMBOL,
  buildTotal2MarketCapSymbolInfo,
  isTotal2MarketCapPair,
} from "./total2MarketCapChartSymbol";
import {
  TOTAL3_MARKET_CAP_CHART_SYMBOL,
  buildTotal3MarketCapSymbolInfo,
  isTotal3MarketCapPair,
} from "./total3MarketCapChartSymbol";
import {
  FEAR_GREED_CHART_SYMBOL,
  buildFearGreedSymbolInfo,
  isFearGreedPair,
} from "./fearGreedChartSymbol";
import {
  DXY_CHART_SYMBOL,
  buildDxySymbolInfo,
  isDxyPair,
} from "./dxyChartSymbol";
import {
  VIX_CHART_SYMBOL,
  buildVixSymbolInfo,
  isVixPair,
} from "./vixChartSymbol";
import {
  NEWS_INDEX_CHART_SYMBOL,
  buildNewsIndexSymbolInfo,
  isNewsIndexPair,
} from "./newsIndexChartSymbol";
import type { MarketIndexId } from "../index/marketIndexCatalog";
import { resolveMarketIndexKlineTarget } from "../index/marketIndexKlineTarget";
import "./price-sparkline-kline-modal.css";

const loadSymbolSearchModal = () =>
  import("../shared/SymbolSearchModal").then((m) => ({ default: m.SymbolSearchModal }));

const SymbolSearchModal = lazy(loadSymbolSearchModal);

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
  pair: string;
  iconUrl?: string;
  /** Полный каталог — для datafeed и поиска символов. */
  cryptocurrencies: CryptocurrencyListItem[];
  /** Списки watchlist — правая панель и закладки в поиске. */
  watchlistLists: WatchlistListData[];
  onWatchlistListsChange?: (lists: WatchlistListData[]) => void;
  isLoggedIn: boolean;
  /** Если задан — график открывается на выбранном рыночном индексе. */
  marketIndexId?: MarketIndexId | null;
};

function clearProContainer(el: HTMLElement) {
  el.innerHTML = "";
  el.classList.remove("klinecharts-pro");
  el.removeAttribute("data-theme");
}

export function PriceSparklineKlineModal({
  open,
  onClose,
  symbol,
  pair,
  iconUrl,
  cryptocurrencies,
  watchlistLists,
  onWatchlistListsChange,
  isLoggedIn,
  marketIndexId = null,
}: Props) {
  useBackdropBlurPause(open);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartPro | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cryptocurrenciesRef = useRef(cryptocurrencies);
  cryptocurrenciesRef.current = cryptocurrencies;
  const requestClose = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onCloseRef.current();
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [symbolSearchReady, setSymbolSearchReady] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState(symbol);
  const [coinListOpen, setCoinListOpen] = useState(true);
  const screenshotToolbarHandleRef = useRef<KlineScreenshotToolbarHandle | null>(null);
  const toggleCoinListRef = useRef(() => {
    setCoinListOpen((value) => !value);
  });
  toggleCoinListRef.current = () => {
    setCoinListOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) {
      setSymbolSearchReady(false);
      setSymbolSearchOpen(false);
      return;
    }
    const indexTarget = marketIndexId ? resolveMarketIndexKlineTarget(marketIndexId) : null;
    setActiveSymbol(indexTarget?.symbol ?? symbol);
    setCoinListOpen(true);
    // После старта графика — подгрузить чанк и прогреть компонент поиска.
    let cancelled = false;
    const warm = () => {
      void loadSymbolSearchModal().then(() => {
        if (!cancelled) setSymbolSearchReady(true);
      });
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(warm, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(warm, 350);
    }
    return () => {
      cancelled = true;
      if (idleId != null) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [open, symbol, marketIndexId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || symbolSearchOpen) return;
      e.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose, symbolSearchOpen]);

  const selectCoin = useCallback((crypto: CryptocurrencyListItem) => {
    setActiveSymbol(crypto.symbol);
    // Не чистим оверлеи здесь: flush текущей пары делает attachPersistenceForPair
    // до clear. Иначе пустой collect уходит в API и затирает линии.
    const chart = chartRef.current;
    chart?.setSymbol(
      buildKlineSymbolInfo({
        symbol: crypto.symbol,
        iconUrl: crypto.iconUrl,
      }),
    );
    const stored = loadStoredKlineCandleType();
    if (chart && stored) applyKlineCandleType(chart, stored, { persist: false });
  }, []);

  const selectNewsIndex = useCallback(() => {
    setActiveSymbol(NEWS_INDEX_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildNewsIndexSymbolInfo());
    if (chart) applyKlineCandleType(chart, "line", { persist: false });
  }, []);

  const selectFearGreed = useCallback(() => {
    setActiveSymbol(FEAR_GREED_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildFearGreedSymbolInfo());
    if (chart) applyKlineCandleType(chart, "line", { persist: false });
  }, []);

  const selectBtcDominance = useCallback(() => {
    setActiveSymbol(BTC_DOMINANCE_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildBtcDominanceSymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  const selectTotalMarketCap = useCallback(() => {
    setActiveSymbol(TOTAL_MARKET_CAP_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildTotalMarketCapSymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  const selectTotal2MarketCap = useCallback(() => {
    setActiveSymbol(TOTAL2_MARKET_CAP_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildTotal2MarketCapSymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  const selectTotal3MarketCap = useCallback(() => {
    setActiveSymbol(TOTAL3_MARKET_CAP_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildTotal3MarketCapSymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  const selectDxy = useCallback(() => {
    setActiveSymbol(DXY_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildDxySymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  const selectVix = useCallback(() => {
    setActiveSymbol(VIX_CHART_SYMBOL);
    const chart = chartRef.current;
    chart?.setSymbol(buildVixSymbolInfo());
    if (chart) applyKlineCandleType(chart, CandleType.CandleSolid, { persist: false });
  }, []);

  useEffect(() => {
    screenshotToolbarHandleRef.current?.syncCoinListOpen(coinListOpen);
  }, [coinListOpen]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const chart = containerRef.current
        ? resolveKlineChartFromProContainer(containerRef.current)
        : null;
      chart?.resize();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [coinListOpen, open]);

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;
    let rafId = 0;
    let themeObserver: MutationObserver | null = null;
    let detachOverlayPersistence: (() => void | Promise<void>) | null = null;
    let detachOverlayContextMenu: (() => void) | null = null;
    let detachIndicatorPersistence: (() => void) | null = null;
    let detachCandleTypeControl: (() => void) | null = null;
    let detachDrawingToolControl: (() => void) | null = null;
    let detachIndicatorControl: (() => void) | null = null;
    let detachIndicatorTooltipHover: (() => void) | null = null;
    let detachPeriodBarBlocks: (() => void) | null = null;
    let detachScreenshotToolbar: (() => void) | null = null;
    let detachSymbolSearch: (() => void) | null = null;
    let overlayAttachRaf = 0;
    let containerEl: HTMLDivElement | null = null;

    const mountChart = () => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el) {
        rafId = window.requestAnimationFrame(mountChart);
        return;
      }
      containerEl = el;

      setLoading(true);
      setError(null);

      void (async () => {
        if (cancelled) return;

        const indexTarget = marketIndexId ? resolveMarketIndexKlineTarget(marketIndexId) : null;
        const initialSymbol = indexTarget?.symbol ?? symbol;
        const initialPair = indexTarget?.pair ?? pair;
        const dark = isDashboardDarkTheme();
        const symbolInfo =
          indexTarget?.symbolInfo ?? buildKlineSymbolInfo({ symbol: initialSymbol, iconUrl });
        const initialIndicators = await resolveInitialKlineIndicators(initialPair, isLoggedIn);
        if (cancelled) return;

        const { mainIndicators, subIndicators } = initialIndicators;
        let activePair = initialPair;
        let persistenceGeneration = 0;

        const attachPersistenceForPair = async (nextPair: string) => {
          const generation = ++persistenceGeneration;
          // Сначала flush текущей пары, затем сразу чистим поле —
          // иначе линии прошлой монеты остаются на том же chart instance.
          const prevDetach = detachOverlayPersistence;
          detachOverlayPersistence = null;
          if (prevDetach) {
            await Promise.resolve(prevDetach());
          }
          detachIndicatorPersistence?.();
          detachIndicatorPersistence = null;
          const liveChartBefore = resolveKlineChartFromProContainer(el);
          if (liveChartBefore) {
            clearAllKlineOverlays(liveChartBefore);
          }

          const nextInitial = await resolveInitialKlineIndicators(nextPair, isLoggedIn);
          if (cancelled || generation !== persistenceGeneration) return;
          const storedForPair = nextInitial.stored ?? getDefaultStoredKlineIndicators();
          const liveChart = resolveKlineChartFromProContainer(el);
          if (liveChart) {
            // На случай, если за время await снова появились чужие линии.
            clearAllKlineOverlays(liveChart);
            try {
              await syncKlineIndicatorsFromStored(liveChart, storedForPair);
            } catch {
              // ignore sync errors; persistence hook still attaches
            }
          }
          if (cancelled || generation !== persistenceGeneration) return;
          detachOverlayPersistence = attachKlineOverlayPersistence({
            container: el,
            pair: nextPair,
            isLoggedIn,
          });
          detachIndicatorPersistence = attachKlineIndicatorPersistence({
            container: el,
            pair: nextPair,
            isLoggedIn,
            stored: nextInitial.stored,
          });
        };

        try {
          ensureKlineRuLocale();
          ensureKlineHorizontalPriceTagsAlwaysVisible();
          const chart = new KLineChartPro({
            container: el,
            theme: dark ? "dark" : "light",
            locale: KLINE_PRO_LOCALE,
            timezone: "Europe/Moscow",
            drawingBarVisible: true,
            watermark: "",
            styles: buildKlineChartStyles(dark),
            symbol: symbolInfo,
            period: KLINE_DAILY_PERIOD,
            periods: KLINE_DAILY_PERIODS,
            mainIndicators,
            subIndicators,
            datafeed: createAtlasCryptoDatafeed({
              cryptocurrencies: cryptocurrenciesRef.current,
              initial: { symbol: initialSymbol, pair: initialPair, iconUrl: indexTarget ? undefined : iconUrl },
              onActiveSymbolChange: (active) => {
                if (cancelled) return;
                setActiveSymbol(active.symbol);
                const liveChart = resolveKlineChartFromProContainer(el);
                if (liveChart) {
                  const chartPro = liveChart as unknown as ChartPro;
                  if (isNewsIndexPair(active.pair) || isFearGreedPair(active.pair)) {
                    applyKlineCandleType(chartPro, "line", { persist: false });
                  } else if (
                    isBtcDominancePair(active.pair) ||
                    isTotalMarketCapPair(active.pair) ||
                    isTotal2MarketCapPair(active.pair) ||
                    isTotal3MarketCapPair(active.pair) ||
                    isDxyPair(active.pair) ||
                    isVixPair(active.pair)
                  ) {
                    applyKlineCandleType(chartPro, CandleType.CandleSolid, { persist: false });
                  } else {
                    const stored = loadStoredKlineCandleType();
                    if (stored) applyKlineCandleType(chartPro, stored, { persist: false });
                  }
                }
                if (active.pair === activePair) return;
                activePair = active.pair;
                void attachPersistenceForPair(active.pair);
              },
              onPricePrecision: (precision) => {
                if (cancelled) return;
                const liveChart = resolveKlineChartFromProContainer(el);
                liveChart?.setPriceVolumePrecision(precision, 0);
              },
            }),
          });
          chartRef.current = chart;

          window.requestAnimationFrame(() => {
            if (!cancelled) {
              chart.setStyles(buildKlineChartStyles(dark));
            }
          });

          if (indexTarget) {
            applyKlineCandleType(chart, indexTarget.candleType, { persist: false });
          } else {
            const storedCandleType = loadStoredKlineCandleType();
            if (storedCandleType) applyKlineCandleType(chart, storedCandleType);
          }

          // Toolbar icons must appear with the chart — attach before deferred overlays.
          detachIndicatorControl = attachKlineIndicatorControl({
            container: el,
            chart,
          });
          detachCandleTypeControl = attachKlineCandleTypeControl({
            container: el,
            chart,
          });
          detachScreenshotToolbar = attachKlineScreenshotToolbar({
            container: el,
            onClose: requestClose,
            onToggleCoinList: () => toggleCoinListRef.current(),
            coinListOpen: true,
            handleRef: screenshotToolbarHandleRef,
          });
          detachPeriodBarBlocks = attachKlinePeriodBarBlocks({ container: el });
          detachSymbolSearch = attachKlineSymbolSearch({
            container: el,
            onOpen: () => {
              if (!cancelled) setSymbolSearchOpen(true);
            },
          });

          overlayAttachRaf = window.requestAnimationFrame(() => {
            if (!cancelled) {
              detachOverlayContextMenu = attachKlineOverlayContextMenu({
                container: el,
              });
              detachDrawingToolControl = attachKlineDrawingToolControl({
                container: el,
                chart,
                isLoggedIn,
              });
              void attachPersistenceForPair(activePair);
              detachIndicatorTooltipHover = attachKlineIndicatorTooltipHover({
                container: el,
                getChart: () => resolveKlineChartFromProContainer(el),
              });
            }
          });
          if (!cancelled) setLoading(false);
        } catch (e: unknown) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Не удалось инициализировать график");
            setLoading(false);
          }
        }

        if (cancelled) return;

        themeObserver = new MutationObserver(() => {
          const nextDark = isDashboardDarkTheme();
          chartRef.current?.setTheme(nextDark ? "dark" : "light");
          chartRef.current?.setStyles(buildKlineChartStyles(nextDark));
        });
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-dashboard-theme"],
        });
      })();
    };

    mountChart();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (overlayAttachRaf) window.cancelAnimationFrame(overlayAttachRaf);
      themeObserver?.disconnect();
      detachOverlayPersistence?.();
      detachOverlayPersistence = null;
      detachOverlayContextMenu?.();
      detachOverlayContextMenu = null;
      detachIndicatorPersistence?.();
      detachIndicatorPersistence = null;
      detachIndicatorControl?.();
      detachIndicatorControl = null;
      detachCandleTypeControl?.();
      detachCandleTypeControl = null;
      detachDrawingToolControl?.();
      detachDrawingToolControl = null;
      detachPeriodBarBlocks?.();
      detachPeriodBarBlocks = null;
      detachIndicatorTooltipHover?.();
      detachIndicatorTooltipHover = null;
      detachScreenshotToolbar?.();
      detachScreenshotToolbar = null;
      detachSymbolSearch?.();
      detachSymbolSearch = null;
      chartRef.current = null;
      if (containerEl) clearProContainer(containerEl);
    };
  }, [open, pair, symbol, iconUrl, requestClose, isLoggedIn, marketIndexId]);

  if (!open) return null;

  return createPortal(
    <div
      className="price-kline-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`price-kline-layout${coinListOpen ? "" : " price-kline-layout--list-collapsed"}`}
        role="dialog"
        aria-modal="true"
        aria-label="График криптовалют"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div className="atlas-glass price-kline-chart-panel">
          <div className="price-kline-chart-stage">
            {loading ? <div className="price-kline-status">Загрузка графика…</div> : null}
            {error ? <div className="price-kline-status price-kline-status--error">{error}</div> : null}
            <div ref={containerRef} className="price-kline-chart price-kline-chart--pro" />
          </div>
        </div>

        <div className="price-kline-coin-list-wrap" aria-hidden={!coinListOpen}>
          <PriceKlineCoinList
            lists={watchlistLists}
            catalog={cryptocurrencies}
            activeSymbol={activeSymbol}
            onSelect={selectCoin}
          />
        </div>
      </div>

      {symbolSearchOpen || symbolSearchReady ? (
        <Suspense fallback={null}>
          <SymbolSearchModal
            open={symbolSearchOpen}
            embedded
            items={cryptocurrencies}
            activeSymbol={activeSymbol}
            watchlistLists={watchlistLists}
            onWatchlistListsChange={onWatchlistListsChange}
            onClose={() => setSymbolSearchOpen(false)}
            onSelectNewsIndex={() => {
              selectNewsIndex();
              setSymbolSearchOpen(false);
            }}
            onSelectFearGreed={() => {
              selectFearGreed();
              setSymbolSearchOpen(false);
            }}
            onSelectBtcDominance={() => {
              selectBtcDominance();
              setSymbolSearchOpen(false);
            }}
            onSelectTotalMarketCap={() => {
              selectTotalMarketCap();
              setSymbolSearchOpen(false);
            }}
            onSelectTotal2MarketCap={() => {
              selectTotal2MarketCap();
              setSymbolSearchOpen(false);
            }}
            onSelectTotal3MarketCap={() => {
              selectTotal3MarketCap();
              setSymbolSearchOpen(false);
            }}
            onSelectDxy={() => {
              selectDxy();
              setSymbolSearchOpen(false);
            }}
            onSelectVix={() => {
              selectVix();
              setSymbolSearchOpen(false);
            }}
            onSelect={(crypto) => {
              selectCoin(crypto);
              setSymbolSearchOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </div>,
    document.body,
  );
}
