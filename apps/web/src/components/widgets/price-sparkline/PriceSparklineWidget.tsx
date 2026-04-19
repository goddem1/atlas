import { useEffect, useMemo, useState } from "react";
import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";
import { fetchCandles, fetchCryptocurrencies } from "../../../services/api";
import { formatPriceTicker, formatRuDayMonth, percentChangeLast } from "../../../lib/formatChart";
import { CryptoPickerModal } from "../shared/CryptoPickerModal";
import { PriceSparklineCard } from "./PriceSparklineCard";
import "./price-sparkline-widget.css";

function pairFor(c: CryptocurrencyListItem): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}

/** После дневного джоба (23:55 MSK) виджеты подтягивают новые свечи без перезагрузки страницы. */
const CANDLES_POLL_MS = 5 * 60 * 1000;

type Props = {
  dragHandleClassName?: string;
  /** Сохранённый тикер; если нет в списке — показываем первый актив. */
  preferredSymbol?: string | null;
  /** Вызов при выборе актива в модалке (родитель пишет в localStorage). */
  onPreferredSymbolChange?: (symbol: string) => void;
  onDeleteWidget?: () => void;
};

export function PriceSparklineWidget({
  dragHandleClassName,
  preferredSymbol,
  onPreferredSymbolChange,
  onDeleteWidget,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [list, setList] = useState<CryptocurrencyListItem[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [candlesErr, setCandlesErr] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleApiRow[]>([]);

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

  const selected = useMemo(() => {
    if (list.length === 0) return null;
    const pref = preferredSymbol?.trim();
    if (pref) {
      const u = pref.toUpperCase();
      const match = list.find((c) => c.symbol.toUpperCase() === u);
      if (match) return match;
    }
    return list[0] ?? null;
  }, [list, preferredSymbol]);

  useEffect(() => {
    if (!selected) {
      setCandles([]);
      setCandlesErr(null);
      return;
    }
    const pair = pairFor(selected);
    let cancelled = false;

    const run = (clearOnPairChange: boolean) => {
      if (cancelled) return;
      if (clearOnPairChange) {
        setCandlesErr(null);
      }
      fetchCandles(pair, 7)
        .then((rows) => {
          if (cancelled) return;
          setCandles(rows);
          setCandlesErr(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setCandlesErr(e instanceof Error ? e.message : "Ошибка свечей");
          if (clearOnPairChange) {
            setCandles([]);
          }
        });
    };

    run(true);

    const intervalId = window.setInterval(() => run(false), CANDLES_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selected]);

  const { series, xLabels, priceDisplay, changePercent } = useMemo(() => {
    const closes = candles.map((c) => Number.parseFloat(c.close)).filter(Number.isFinite);
    const labels = candles.map((c) => formatRuDayMonth(c.openTime));
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const price =
      last !== undefined ? formatPriceTicker(last) : "—";
    const ch =
      last !== undefined && prev !== undefined
        ? percentChangeLast(prev, last)
        : 0;
    return {
      series: closes,
      xLabels: labels,
      priceDisplay: price,
      changePercent: ch,
    };
  }, [candles]);

  const iconNode =
    selected != null ? (
      <img
        src={selected.iconUrl}
        alt=""
        className="price-widget-asset-icon"
      />
    ) : undefined;

  return (
    <>
      <PriceSparklineCard
        dragHandleClassName={dragHandleClassName}
        onDeleteWidget={onDeleteWidget}
        symbol={selected?.symbol ?? "…"}
        priceDisplay={priceDisplay}
        changePercent={changePercent}
        series={series}
        xLabels={xLabels}
        icon={iconNode}
        onIconClick={() => setPickerOpen(true)}
        statusText={
          loadErr ?? candlesErr ?? (list.length === 0 && !loadErr ? "Нет активов в справочнике" : null)
        }
      />

      <CryptoPickerModal
        open={pickerOpen}
        items={list}
        loadError={loadErr}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => {
          onPreferredSymbolChange?.(c.symbol);
        }}
      />
    </>
  );
}
