import { useState } from "react";
import { formatPriceTicker } from "../../../lib/formatChart";
import "./watchlist-widget.css";

export type WatchlistRow = {
  symbol: string;
  iconUrl: string;
  price: number | null;
  changePercent: number;
  changeAbs: number;
};

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  onAddAsset?: () => void;
  rows: WatchlistRow[];
  loading?: boolean;
  error?: string | null;
  listTitle?: string;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function formatChangePercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return `${abs.toFixed(digits)}%`;
}

function formatChangeAbs(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatPriceTicker(Math.abs(value));
}

export function WatchlistCard({
  dragHandleClassName,
  onDeleteWidget,
  onAddAsset,
  rows,
  loading = false,
  error = null,
  listTitle = "Список 1",
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dragCn = cn("watchlist-head", dragHandleClassName);

  return (
    <div className="watchlist-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen && "is-open")}
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
            className="btn-on-glass"
            onClick={() => {
              setMenuOpen(false);
              onAddAsset?.();
            }}
            aria-label="Добавить актив в список"
          >
            <img
              src="/assets/portfolio-ui/plus.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-add"
            />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img
              src="/assets/portfolio-ui/close.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close"
            />
          </button>
        </div>
      </div>

      <div className="atlas-glass watchlist-card">
        <div className={dragCn}>
          <button type="button" className="watchlist-list-select watchlist-list-header-select" aria-haspopup="listbox">
            <span>{listTitle}</span>
            <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="watchlist-list-select-icon" />
          </button>
        </div>

        <div className="watchlist-divider" />

        {loading ? <p className="watchlist-msg">Загрузка…</p> : null}
        {!loading && error ? <p className="watchlist-msg watchlist-msg--err">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="watchlist-msg">Нет активов в списке</p>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <ul className="watchlist-list">
            {rows.map((row) => {
              const up = row.changePercent > 0;
              const down = row.changePercent < 0;
              const changeClass = up ? "watchlist-change--up" : down ? "watchlist-change--down" : "watchlist-change--flat";
              return (
                <li key={row.symbol} className="watchlist-row">
                  <div className="watchlist-asset">
                    {row.iconUrl ? (
                      <img src={row.iconUrl} alt="" className="watchlist-asset-icon" />
                    ) : (
                      <span className="watchlist-asset-icon watchlist-asset-icon--fallback">{row.symbol.slice(0, 1)}</span>
                    )}
                    <span className="watchlist-symbol">{row.symbol}</span>
                  </div>
                  <span className="watchlist-price">
                    {row.price != null && Number.isFinite(row.price) ? formatPriceTicker(row.price) : "—"}
                  </span>
                  <div className={cn("watchlist-change", changeClass)}>
                    <span>{formatChangePercent(row.changePercent)}</span>
                    <span>{formatChangeAbs(row.changeAbs)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
