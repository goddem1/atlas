import { useEffect, useMemo, useState, memo, lazy, Suspense } from "react";
import type { CandleApiRow, CryptocurrencyListItem } from "@atlas-v1/shared";
import { fetchCandles, fetchCryptocurrencies } from "../../../services/api";
import { formatPriceTicker, formatRuDayMonth, percentChangeLast } from "../../../lib/formatChart";
import { GALLERY_PRICE_SPARKLINE } from "../../dashboard/widgetGalleryPreviewData";
import { PriceSparklineCard } from "./PriceSparklineCard";
import "./price-sparkline-widget.css";

const CryptoPickerModal = lazy(() =>
  import("../shared/CryptoPickerModal").then((m) => ({ default: m.CryptoPickerModal })),
);

type LivePriceDirection = "up" | "down";

function pairFor(c: CryptocurrencyListItem): string {
  return (c.pairSymbol?.trim() || `${c.symbol}USDT`).toUpperCase();
}

/** Live candle обновляется через WS на сервере, клиент polling каждые 30с. */
const CANDLES_POLL_MS = 30 * 1000;

type Props = {
  dragHandleClassName?: string;
  /** Сохранённый тикер; если нет в списке — показываем первый актив. */
  preferredSymbol?: string | null;
  /** Вызов при выборе актива в модалке (родитель пишет в localStorage). */
  onPreferredSymbolChange?: (symbol: string) => void;
  onDeleteWidget?: () => void;
  /** Статичное превью для галереи виджетов — без API. */
  galleryPreview?: boolean;
};

function PriceSparklineWidgetGalleryPreview() {
  const demo = GALLERY_PRICE_SPARKLINE;
  return (
    <PriceSparklineCard
      symbol={demo.symbol}
      priceDisplay={demo.priceDisplay}
      changePercent={demo.changePercent}
      liveDirection={demo.liveDirection}
      series={demo.series}
      xLabels={demo.xLabels}
      icon={<img src={demo.iconUrl} alt="" className="price-widget-asset-icon" />}
    />
  );
}

const PriceSparklineWidgetLive = memo(function PriceSparklineWidgetLive({
  dragHandleClassName,
  preferredSymbol,
  onPreferredSymbolChange,
  onDeleteWidget,
}: Omit<Props, "galleryPreview">) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [list, setList] = useState<CryptocurrencyListItem[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [candlesErr, setCandlesErr] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleApiRow[]>([]);
  const [liveDirection, setLiveDirection] = useState<LivePriceDirection | null>(null);

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
      setLiveDirection(null);
      return;
    }
    const pair = pairFor(selected);
    let cancelled = false;
    let previousLiveClose: number | null = null;

    const run = (clearOnPairChange: boolean) => {
      if (cancelled) return;
      if (clearOnPairChange) {
        setCandlesErr(null);
      }
      fetchCandles(pair, 7)
        .then((rows) => {
          if (cancelled) return;
          const nextLiveCloseRaw = rows[rows.length - 1]?.close;
          const nextLiveClose = nextLiveCloseRaw ? Number.parseFloat(nextLiveCloseRaw) : NaN;
          if (Number.isFinite(nextLiveClose)) {
            if (previousLiveClose != null) {
              if (nextLiveClose > previousLiveClose) {
                setLiveDirection("up");
              } else if (nextLiveClose < previousLiveClose) {
                setLiveDirection("down");
              } else {
                setLiveDirection(null);
              }
            } else {
              setLiveDirection(null);
            }
            previousLiveClose = nextLiveClose;
          } else {
            setLiveDirection(null);
          }
          setCandles(rows);
          setCandlesErr(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setCandlesErr(e instanceof Error ? e.message : "Ошибка свечей");
          setLiveDirection(null);
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
        liveDirection={liveDirection}
        series={series}
        xLabels={xLabels}
        icon={iconNode}
        onIconClick={() => setPickerOpen(true)}
        statusText={
          loadErr ?? candlesErr ?? (list.length === 0 && !loadErr ? "Нет активов в справочнике" : null)
        }
      />

      {pickerOpen ? (
        <Suspense fallback={null}>
      <CryptoPickerModal
        open
        items={list}
        loadError={loadErr}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => {
          onPreferredSymbolChange?.(c.symbol);
        }}
      />
        </Suspense>
      ) : null}
    </>
  );
});

export const PriceSparklineWidget = memo(function PriceSparklineWidget({
  galleryPreview = false,
  ...props
}: Props) {
  if (galleryPreview) return <PriceSparklineWidgetGalleryPreview />;
  return <PriceSparklineWidgetLive {...props} />;
});
