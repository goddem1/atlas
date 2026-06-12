import { useEffect, useMemo, useState } from "react";
import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";
import { percentChangeLast } from "../../../lib/formatChart";
import { fetchCandles, fetchCryptocurrencies } from "../../../services/api";
import { WatchlistCard, type WatchlistRow } from "./WatchlistCard";
import { WatchlistCryptoPickerModal } from "./WatchlistCryptoPickerModal";

const POLL_MS = 30 * 1000;

function pairFor(c: CryptocurrencyListItem): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}

function rowFromCandles(item: CryptocurrencyListItem, candles: CandleApiRow[]): WatchlistRow {
  const closes = candles.map((c) => Number.parseFloat(c.close)).filter(Number.isFinite);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const price = last ?? null;
  const changeAbs = last !== undefined && prev !== undefined ? last - prev : 0;
  const changePercent =
    last !== undefined && prev !== undefined ? percentChangeLast(prev, last) : 0;
  return {
    symbol: item.symbol,
    iconUrl: item.iconUrl,
    price,
    changePercent,
    changeAbs,
  };
}

type Props = {
  dragHandleClassName?: string;
  symbols?: string[];
  onSymbolsChange?: (symbols: string[]) => void;
  onDeleteWidget?: () => void;
};

export function WatchlistWidget({
  dragHandleClassName,
  symbols = [],
  onSymbolsChange,
  onDeleteWidget,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [list, setList] = useState<CryptocurrencyListItem[]>([]);
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pricesErr, setPricesErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedSymbols = useMemo(
    () => symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
    [symbols],
  );

  const watchItems = useMemo(() => {
    if (list.length === 0 || normalizedSymbols.length === 0) return [];
    const bySymbol = new Map(list.map((c) => [c.symbol.toUpperCase(), c]));
    return normalizedSymbols
      .map((sym) => bySymbol.get(sym))
      .filter((c): c is CryptocurrencyListItem => c != null);
  }, [list, normalizedSymbols]);

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
    if (watchItems.length === 0) {
      setRows([]);
      setPricesErr(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = (showLoading: boolean) => {
      if (cancelled) return;
      if (showLoading) setLoading(true);

      Promise.all(
        watchItems.map(async (item) => {
          const candles = await fetchCandles(pairFor(item), 2);
          return rowFromCandles(item, candles);
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
  }, [watchItems]);

  const handleAdd = (c: CryptocurrencyListItem) => {
    const sym = c.symbol.trim().toUpperCase();
    if (!sym || normalizedSymbols.includes(sym)) return;
    onSymbolsChange?.([...normalizedSymbols, sym]);
  };

  const handleRemove = (c: CryptocurrencyListItem) => {
    const sym = c.symbol.trim().toUpperCase();
    if (!sym) return;
    onSymbolsChange?.(normalizedSymbols.filter((s) => s !== sym));
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
      />

      <WatchlistCryptoPickerModal
        open={pickerOpen}
        items={list}
        selectedSymbols={normalizedSymbols}
        loadError={loadErr}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onReorder={(nextSymbols) => onSymbolsChange?.(nextSymbols)}
      />
    </>
  );
}
