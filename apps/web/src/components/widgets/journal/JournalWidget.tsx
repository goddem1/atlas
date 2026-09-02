import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import type { TradeRecord } from "../../../services/api";
import { fetchCryptocurrencies, fetchTradeEquityCurve, fetchTrades } from "../../../services/api";
import {
  GALLERY_JOURNAL_CURVE,
  GALLERY_JOURNAL_TRADES,
} from "../../dashboard/widgetGalleryPreviewData";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { EquityCurveChart } from "../../charts/EquityCurveChart";
import "../../charts/equity-curve-chart.css";
import "../portfolio/portfolio-widget.css";
import "../shared/portfolio-menu.css";
import {
  formatTradeBalanceUsd,
  formatTradeDateShort,
  tradeDisplayAt,
  formatTradePnlUsdCompact,
  pnlTone,
  stripSymbolUsdt,
} from "./journalFormat";
import "./journal-widget.css";

const JournalModal = lazy(() => import("./JournalModal").then((m) => ({ default: m.JournalModal })));

const JOURNAL_WIDGET_TRADE_ROWS = 6;

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  onOpenJournal?: (tradeId?: string) => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

export const JournalWidget = memo(function JournalWidget({
  dragHandleClassName,
  onDeleteWidget,
  onOpenJournal,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [trades, setTrades] = useState<TradeRecord[]>(() =>
    galleryPreview ? [...GALLERY_JOURNAL_TRADES] : [],
  );
  const [curve, setCurve] = useState<{ date: string; value: number }[]>(() =>
    galleryPreview
      ? GALLERY_JOURNAL_CURVE.map((p) => ({ date: p.date, value: p.cumulativePnl }))
      : [],
  );
  const [assets, setAssets] = useState<CryptocurrencyListItem[]>([]);
  const [loading, setLoading] = useState(() => !galleryPreview);
  const [err, setErr] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const [localTradeId, setLocalTradeId] = useState<string | null>(null);

  const assetsBySymbol = useMemo(() => new Map(assets.map((a) => [a.symbol, a])), [assets]);
  const totalPnl = useMemo(() => trades.reduce((sum, t) => sum + t.pnlUsd, 0), [trades]);
  const balance = useMemo(() => {
    if (curve.length === 0) return totalPnl;
    return curve[curve.length - 1]?.value ?? totalPnl;
  }, [curve, totalPnl]);
  const visibleTrades = trades.slice(0, JOURNAL_WIDGET_TRADE_ROWS);
  const pnlClass = totalPnl >= 0 ? "journal-widget-pnl-positive" : "journal-widget-pnl-negative";

  const openJournal = useCallback(
    (tradeId?: string) => {
      if (onOpenJournal) {
        onOpenJournal(tradeId);
        return;
      }
      setLocalTradeId(tradeId ?? null);
      setLocalOpen(true);
    },
    [onOpenJournal],
  );

  const load = useCallback(() => {
    if (galleryPreview) return;
    setLoading(true);
    setErr(null);
    void Promise.all([fetchTrades({ period: "all" }), fetchTradeEquityCurve("all"), fetchCryptocurrencies()])
      .then(([nextTrades, nextCurve, nextAssets]) => {
        setTrades(nextTrades);
        setCurve(nextCurve.map((p) => ({ date: p.date, value: p.cumulativePnl })));
        setAssets(nextAssets);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Не удалось загрузить журнал");
        setTrades([]);
        setCurve([]);
      })
      .finally(() => setLoading(false));
  }, [galleryPreview]);

  useEffect(() => {
    if (galleryPreview || overlayOpen) return;
    load();
  }, [load, galleryPreview, overlayOpen]);

  return (
    <div className="journal-widget-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen ? "is-open" : undefined)}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => {
              setMenuOpen(false);
              openJournal();
            }}
            aria-label="Открыть журнал"
          >
            <img
              src="/assets/portfolio-ui/book.svg"
              alt=""
              className="portfolio-menu-circle-icon"
            />
          </button>
          <button type="button" className="btn-on-glass btn-on-glass--soft" onClick={() => onDeleteWidget?.()} aria-label="Удалить виджет">
            <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close" />
          </button>
        </div>
      </div>

      <div className="atlas-glass-elevated journal-widget-card-elevated">
        <button
          type="button"
          className={cn("atlas-glass journal-widget-card", galleryPreview && "journal-widget-card--gallery")}
          onClick={() => openJournal()}
        >
        <div className={cn("journal-widget-left", dragHandleClassName)} onClick={(e) => e.stopPropagation()}>
          <div className="journal-widget-balance">{formatTradeBalanceUsd(balance)}</div>
          <div className={`journal-widget-total-pnl ${pnlClass}`}>{formatTradePnlUsdCompact(totalPnl)}</div>
          <div className="journal-widget-chart-block">
            <div className="journal-widget-chart-wrap">
              <EquityCurveChart points={curve} variant="full" />
            </div>
          </div>
        </div>

        <div className="macro-cal-divider portfolio-widget-divider" aria-hidden />

        <div className="journal-widget-right">
          {loading ? <p className="journal-widget-msg">Загрузка…</p> : null}
          {!loading && err ? <p className="journal-widget-msg journal-widget-msg--err">{err}</p> : null}
          {!loading && !err ? (
            <ul className="journal-widget-list">
              {visibleTrades.map((trade) => {
                const base = stripSymbolUsdt(trade.symbol);
                const asset = assetsBySymbol.get(base);
                const iconUrl = asset?.iconUrl ?? (galleryPreview ? "/assets/crypto/BTC.svg" : undefined);
                return (
                  <li key={trade.id}>
                    <button
                      type="button"
                      className="journal-widget-row"
                      onClick={(e) => {
                        e.stopPropagation();
                        openJournal(trade.id);
                      }}
                    >
                      <span className={`journal-widget-direction journal-widget-direction--${trade.direction}`}>
                        {trade.direction === "short" ? "S" : "L"}
                      </span>
                      <span className="journal-widget-row-date">{formatTradeDateShort(tradeDisplayAt(trade))}</span>
                      <span className="journal-widget-row-symbol">
                        {iconUrl ? <img src={iconUrl} alt="" width={18} height={18} className="journal-widget-row-icon" /> : null}
                        <span>{base}</span>
                      </span>
                      <span className={`journal-widget-row-pnl journal-pnl--${pnlTone(trade.pnlUsd)}`}>
                        {formatTradePnlUsdCompact(trade.pnlUsd)}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className="journal-widget-row journal-widget-row--view-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    openJournal();
                  }}
                >
                  Посмотреть все сделки
                  <span className="journal-widget-row--view-all-arrow" aria-hidden>
                    <svg viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M2 12h22M22 7l6 5-6 5"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
              </li>
            </ul>
          ) : null}
        </div>
        </button>
      </div>

      {!galleryPreview && localOpen && !onOpenJournal ? (
        <Suspense fallback={null}>
          <JournalModal
            open
            initialTradeId={localTradeId}
            onClose={() => {
              setLocalOpen(false);
              setLocalTradeId(null);
              load();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
