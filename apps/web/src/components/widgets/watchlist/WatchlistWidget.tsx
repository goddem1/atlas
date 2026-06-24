import { useEffect, useMemo, useState, memo, lazy, Suspense } from "react";
import type { CandleApiRow, CryptocurrencyListItem, WatchlistListData } from "@atlas-v1/shared";
import {
  normalizeSymbolList,
  normalizeWatchlistChangeDisplay,
  normalizeWatchlistChangePeriod,
  resolveWatchlistWidgetState,
  WATCHLIST_MAX_SYMBOLS,
  type WatchlistChangeDisplay,
  type WatchlistChangePeriod,
} from "@atlas-v1/shared";
import { percentChangeLast } from "../../../lib/formatChart";
import { fetchCandles, fetchCryptocurrencies } from "../../../services/api";
import { GALLERY_WATCHLIST_ROWS } from "../../dashboard/widgetGalleryPreviewData";
import { WatchlistCard, type WatchlistRow } from "./WatchlistCard";
import type { WatchlistListOption } from "./WatchlistListSelectMenu";
import {
  candleDaysForWatchlistPeriod,
} from "./watchlistSettings";

const WatchlistCryptoPickerModal = lazy(() =>
  import("./WatchlistCryptoPickerModal").then((m) => ({ default: m.WatchlistCryptoPickerModal })),
);
const WatchlistSettingsModal = lazy(() =>
  import("./WatchlistSettingsModal").then((m) => ({ default: m.WatchlistSettingsModal })),
);

const POLL_MS = 30 * 1000;
const EMPTY_SYMBOLS: string[] = [];

function pairFor(c: CryptocurrencyListItem): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}

function rowFromCandles(
  item: CryptocurrencyListItem,
  candles: CandleApiRow[],
  period: WatchlistChangePeriod,
): WatchlistRow {
  const closes = candles.map((c) => Number.parseFloat(c.close)).filter(Number.isFinite);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const first = closes[0];
  const price = last ?? null;
  const changeAbs =
    period === "day"
      ? last !== undefined && prev !== undefined
        ? last - prev
        : 0
      : last !== undefined && first !== undefined
        ? last - first
        : 0;
  const changePercent =
    period === "day"
      ? last !== undefined && prev !== undefined
        ? percentChangeLast(prev, last)
        : 0
      : last !== undefined && first !== undefined
        ? percentChangeLast(first, last)
        : 0;
  return {
    symbol: item.symbol,
    iconUrl: item.iconUrl,
    price,
    changePercent,
    changeAbs,
  };
}

export type WatchlistWidgetState = {
  watchlistLists: WatchlistListData[];
  activeWatchlistListId: string;
  watchlistChangeDisplay: WatchlistChangeDisplay;
  watchlistChangePeriod: WatchlistChangePeriod;
};

type Props = {
  dragHandleClassName?: string;
  watchlistLists?: WatchlistListData[];
  activeWatchlistListId?: string;
  watchlistChangeDisplay?: WatchlistChangeDisplay;
  watchlistChangePeriod?: WatchlistChangePeriod;
  /** Legacy: тикеры одного списка до миграции в `watchlistLists`. */
  symbols?: string[];
  onWatchlistChange?: (state: WatchlistWidgetState) => void;
  onDeleteWidget?: () => void;
  onSettingsOpenChange?: (open: boolean) => void;
  /** Статичное превью для галереи виджетов — без API. */
  galleryPreview?: boolean;
};

function WatchlistWidgetGalleryPreview() {
  return (
    <WatchlistCard
      rows={GALLERY_WATCHLIST_ROWS}
      listOptions={[{ id: "gallery-demo", title: "Список" }]}
      activeListId="gallery-demo"
      onListSelect={() => {}}
      onListRename={() => {}}
      onListAdd={() => {}}
      changeDisplay="both"
    />
  );
}

const WatchlistWidgetLive = memo(function WatchlistWidgetLive({
  dragHandleClassName,
  watchlistLists: watchlistListsProp,
  activeWatchlistListId: activeWatchlistListIdProp,
  watchlistChangeDisplay: watchlistChangeDisplayProp,
  watchlistChangePeriod: watchlistChangePeriodProp,
  symbols: legacySymbols,
  onWatchlistChange,
  onDeleteWidget,
  onSettingsOpenChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [list, setList] = useState<CryptocurrencyListItem[]>([]);
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pricesErr, setPricesErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const legacySymbolsKey = (legacySymbols ?? EMPTY_SYMBOLS).join("\0");

  const { watchlistLists, activeWatchlistListId } = useMemo(
    () =>
      resolveWatchlistWidgetState(
        watchlistListsProp,
        activeWatchlistListIdProp,
        watchlistListsProp ? undefined : (legacySymbols ?? EMPTY_SYMBOLS),
      ),
    [watchlistListsProp, activeWatchlistListIdProp, legacySymbolsKey],
  );

  const activeList = useMemo(
    () =>
      watchlistLists.find((item) => item.id === activeWatchlistListId) ?? watchlistLists[0],
    [watchlistLists, activeWatchlistListId],
  );

  const changeDisplay = useMemo(
    () => normalizeWatchlistChangeDisplay(watchlistChangeDisplayProp),
    [watchlistChangeDisplayProp],
  );
  const changePeriod = useMemo(
    () => normalizeWatchlistChangePeriod(watchlistChangePeriodProp),
    [watchlistChangePeriodProp],
  );

  const normalizedSymbols = useMemo(
    () => normalizeSymbolList(activeList?.symbols ?? EMPTY_SYMBOLS),
    [activeList?.id, activeList?.symbols],
  );

  const symbolsKey = normalizedSymbols.join("\0");
  const candleDays = candleDaysForWatchlistPeriod(changePeriod);

  useEffect(() => {
    onSettingsOpenChange?.(settingsOpen);
  }, [onSettingsOpenChange, settingsOpen]);

  useEffect(() => {
    return () => onSettingsOpenChange?.(false);
  }, [onSettingsOpenChange]);

  const emitWatchlistChange = (
    patch: Partial<Pick<WatchlistWidgetState, "watchlistLists" | "activeWatchlistListId">> & {
      watchlistChangeDisplay?: WatchlistChangeDisplay;
      watchlistChangePeriod?: WatchlistChangePeriod;
    },
  ) => {
    onWatchlistChange?.({
      watchlistLists,
      activeWatchlistListId,
      watchlistChangeDisplay: changeDisplay,
      watchlistChangePeriod: changePeriod,
      ...patch,
    });
  };

  const updateWatchlist = (nextLists: WatchlistListData[], nextActiveId: string) => {
    emitWatchlistChange({
      watchlistLists: nextLists,
      activeWatchlistListId: nextActiveId,
    });
  };

  const listOptions = useMemo(
    () => watchlistLists.map((item) => ({ id: item.id, title: item.title })),
    [watchlistLists],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadErr(null);
    fetchCryptocurrencies()
      .then((rows) => {
        if (cancelled) return;
        setList(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Ошибка загрузки списка");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (normalizedSymbols.length === 0 || list.length === 0) {
      setRows((prev) => (prev.length === 0 ? prev : []));
      setPricesErr((prev) => (prev === null ? prev : null));
      setLoading((prev) => (prev === false ? prev : false));
      return;
    }

    let cancelled = false;
    const bySymbol = new Map(list.map((c) => [c.symbol.toUpperCase(), c]));
    const items = normalizedSymbols
      .map((sym) => bySymbol.get(sym))
      .filter((c): c is CryptocurrencyListItem => c != null);

    if (items.length === 0) {
      setRows((prev) => (prev.length === 0 ? prev : []));
      setPricesErr((prev) => (prev === null ? prev : null));
      setLoading((prev) => (prev === false ? prev : false));
      return;
    }

    const load = (showLoading: boolean) => {
      if (cancelled) return;
      if (showLoading) setLoading(true);

      Promise.all(
        items.map(async (item) => {
          const candles = await fetchCandles(pairFor(item), candleDays);
          return rowFromCandles(item, candles, changePeriod);
        }),
      )
        .then((nextRows) => {
          if (cancelled) return;
          setRows(nextRows);
          setPricesErr(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setPricesErr(e instanceof Error ? e.message : "Ошибка загрузки цен");
          setLoading(false);
        });
    };

    load(true);
    const intervalId = window.setInterval(() => load(false), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbolsKey, list, candleDays, changePeriod]);

  const setActiveListSymbols = (symbols: string[]) => {
    const normalized = normalizeSymbolList(symbols);
    const nextLists = watchlistLists.map((item) =>
      item.id === activeWatchlistListId ? { ...item, symbols: normalized } : item,
    );
    updateWatchlist(nextLists, activeWatchlistListId);
  };

  const handleAdd = (c: CryptocurrencyListItem) => {
    const sym = c.symbol.trim().toUpperCase();
    if (!sym || normalizedSymbols.includes(sym)) return;
    if (normalizedSymbols.length >= WATCHLIST_MAX_SYMBOLS) return;
    setActiveListSymbols([...normalizedSymbols, sym]);
  };

  const handleRemove = (c: CryptocurrencyListItem) => {
    const sym = c.symbol.trim().toUpperCase();
    if (!sym) return;
    setActiveListSymbols(normalizedSymbols.filter((s) => s !== sym));
  };

  const handleListSelect = (id: string) => {
    updateWatchlist(watchlistLists, id);
  };

  const handleListRename = (id: string, title: string) => {
    const nextLists = watchlistLists.map((item) => (item.id === id ? { ...item, title } : item));
    updateWatchlist(nextLists, activeWatchlistListId);
  };

  const handleListAdd = () => {
    const nextIndex = watchlistLists.length + 1;
    const newList: WatchlistListData = {
      id: `list-${nextIndex}`,
      title: `Список ${nextIndex}`,
      symbols: [],
    };
    updateWatchlist([...watchlistLists, newList], newList.id);
  };

  const handleListsReorder = (nextOptions: WatchlistListOption[]) => {
    const byId = new Map(watchlistLists.map((item) => [item.id, item]));
    const nextLists = nextOptions
      .map((opt) => byId.get(opt.id))
      .filter((item): item is WatchlistListData => item != null);
    if (nextLists.length !== watchlistLists.length) return;
    updateWatchlist(nextLists, activeWatchlistListId);
  };

  return (
    <>
      <WatchlistCard
        dragHandleClassName={dragHandleClassName}
        onDeleteWidget={onDeleteWidget}
        onAddAsset={() => setPickerOpen(true)}
        rows={rows}
        loading={loading}
        error={loadErr ?? pricesErr}
        listOptions={listOptions}
        activeListId={activeWatchlistListId}
        onListSelect={handleListSelect}
        onListRename={handleListRename}
        onListAdd={handleListAdd}
        changeDisplay={changeDisplay}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
      />

      {settingsOpen ? (
        <Suspense fallback={null}>
      <WatchlistSettingsModal
        open
        lists={listOptions}
        changeDisplay={changeDisplay}
        changePeriod={changePeriod}
        onClose={() => setSettingsOpen(false)}
        onListsReorder={handleListsReorder}
        onListRename={handleListRename}
        onChangeDisplay={(value) => emitWatchlistChange({ watchlistChangeDisplay: value })}
        onChangePeriod={(value) => emitWatchlistChange({ watchlistChangePeriod: value })}
      />
        </Suspense>
      ) : null}

      {pickerOpen ? (
        <Suspense fallback={null}>
      <WatchlistCryptoPickerModal
        open
        items={list}
        selectedSymbols={normalizedSymbols}
        maxSymbols={WATCHLIST_MAX_SYMBOLS}
        loadError={loadErr}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onReorder={setActiveListSymbols}
      />
        </Suspense>
      ) : null}
    </>
  );
});

export const WatchlistWidget = memo(function WatchlistWidget({
  galleryPreview = false,
  ...props
}: Props) {
  if (galleryPreview) return <WatchlistWidgetGalleryPreview />;
  return <WatchlistWidgetLive {...props} />;
});
