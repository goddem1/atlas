import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceTicker } from "../../../lib/formatChart";
import { useRafLayoutSync } from "../../../lib/useRafLayoutSync";
import { WatchlistListSelectMenu, type WatchlistListOption } from "./WatchlistListSelectMenu";
import type { WatchlistChangeDisplay } from "./watchlistSettings";
import { WATCHLIST_SETTINGS_DIALOG_READY_EVENT } from "./watchlistSettings";
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
  listOptions: WatchlistListOption[];
  activeListId: string;
  onListSelect: (id: string) => void;
  onListRename: (id: string, title: string) => void;
  onListAdd: () => void;
  changeDisplay?: WatchlistChangeDisplay;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
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

const WATCHLIST_SETTINGS_GAP_PX = 20;
const WATCHLIST_SETTINGS_BOARD_PADDING_PX = 8;

function rectsOverlapVertically(a: DOMRect, b: DOMRect): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}

function watchlistSettingsShiftPx(
  slotRect: DOMRect,
  dialogRect: DOMRect,
  boardRect: DOMRect | null,
): number {
  if (dialogRect.width < 48 || dialogRect.height < 48) {
    return 0;
  }
  if (slotRect.right <= dialogRect.left || slotRect.left >= dialogRect.right) {
    return 0;
  }
  if (!rectsOverlapVertically(slotRect, dialogRect)) {
    return 0;
  }

  const targetRight = dialogRect.left - WATCHLIST_SETTINGS_GAP_PX;
  const shift = slotRect.right - targetRight;
  if (shift <= 0) {
    return 0;
  }

  const minLeft = (boardRect?.left ?? 0) + WATCHLIST_SETTINGS_BOARD_PADDING_PX;
  const maxShift = Math.max(0, slotRect.left - minLeft);
  return Math.min(shift, maxShift);
}

export function WatchlistCard({
  dragHandleClassName,
  onDeleteWidget,
  onAddAsset,
  rows,
  loading = false,
  error = null,
  listOptions,
  activeListId,
  onListSelect,
  onListRename,
  onListAdd,
  changeDisplay = "both",
  onOpenSettings,
  settingsOpen = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [settingsShiftPx, setSettingsShiftPx] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const baselineSlotRectRef = useRef<DOMRect | null>(null);
  const dragCn = cn("watchlist-head", !settingsOpen && dragHandleClassName, settingsOpen && "watchlist-head--settings-open");

  const measureSettingsOverlap = useCallback(() => {
    const slot = shellRef.current?.closest(".dashboard-widget-slot");
    const board = slot?.parentElement;
    const dialog = document.querySelector<HTMLElement>(".watchlist-settings-dialog");
    if (!slot || !dialog) {
      setSettingsShiftPx(0);
      return;
    }

    const slotRect = baselineSlotRectRef.current ?? slot.getBoundingClientRect();
    setSettingsShiftPx(
      watchlistSettingsShiftPx(slotRect, dialog.getBoundingClientRect(), board?.getBoundingClientRect() ?? null),
    );
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    setMenuOpen(false);
    setListMenuOpen(false);
  }, [settingsOpen]);

  useEffect(() => {
    const slot = shellRef.current?.closest(".dashboard-widget-slot");
    if (!slot) return;
    slot.classList.toggle("dashboard-widget-slot--watchlist-settings-open", settingsOpen);
    return () => slot.classList.remove("dashboard-widget-slot--watchlist-settings-open");
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) {
      baselineSlotRectRef.current = null;
      setSettingsShiftPx(0);
      return;
    }

    const slot = shellRef.current?.closest(".dashboard-widget-slot");
    if (slot) {
      baselineSlotRectRef.current = slot.getBoundingClientRect();
    }

    const onDialogReady = () => measureSettingsOverlap();
    window.addEventListener(WATCHLIST_SETTINGS_DIALOG_READY_EVENT, onDialogReady);
    return () => window.removeEventListener(WATCHLIST_SETTINGS_DIALOG_READY_EVENT, onDialogReady);
  }, [measureSettingsOverlap, settingsOpen]);

  useRafLayoutSync(settingsOpen, () => {
    baselineSlotRectRef.current = null;
    measureSettingsOverlap();
  });

  const activeListTitle = useMemo(() => {
    const found = listOptions.find((opt) => opt.id === activeListId);
    return found?.title ?? "Список 1";
  }, [activeListId, listOptions]);

  return (
    <div
      ref={shellRef}
      className={cn("watchlist-shell", settingsOpen && "watchlist-shell--settings-open")}
      style={
        settingsShiftPx > 0
          ? { transform: `translateX(-${settingsShiftPx}px)` }
          : undefined
      }
    >
      <div
        className={cn("portfolio-menu-wrap", menuOpen && !settingsOpen && "is-open")}
        onMouseEnter={() => {
          if (!settingsOpen) setMenuOpen(true);
        }}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => {
            if (settingsOpen) return;
            setMenuOpen((v) => !v);
          }}
          aria-label="Меню виджета"
          aria-expanded={menuOpen && !settingsOpen}
          disabled={settingsOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen || settingsOpen}>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft watchlist-settings-trigger"
            onClick={() => {
              setMenuOpen(false);
              onOpenSettings?.();
            }}
            aria-label="Настройки списка"
          >
            <img src="/assets/portfolio-ui/settings.svg" alt="" className="portfolio-menu-circle-icon" />
          </button>
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

      <div
        ref={cardRef}
        className={cn("atlas-glass watchlist-card", listMenuOpen && !settingsOpen && "watchlist-card--list-menu-open")}
      >
        <div className={dragCn}>
          <div className="watchlist-list-select-spacer" aria-hidden="true">
            <span className="watchlist-list-select-spacer-label">{activeListTitle}</span>
          </div>
        </div>

        <div className="watchlist-divider" />

        {loading ? <p className="watchlist-msg">Загрузка…</p> : null}
        {!loading && error ? <p className="watchlist-msg watchlist-msg--err">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="watchlist-msg">Нет активов в списке</p>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <ul className={cn("watchlist-list", changeDisplay === "none" && "watchlist-list--no-change")}>
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
                  {changeDisplay !== "none" ? (
                    <div className={cn("watchlist-change", changeClass)}>
                      {changeDisplay !== "points" ? (
                        <span>{formatChangePercent(row.changePercent)}</span>
                      ) : null}
                      {changeDisplay !== "percent" ? (
                        <span>{formatChangeAbs(row.changeAbs)}</span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="watchlist-list-popover-layer">
          <WatchlistListSelectMenu
            open={settingsOpen ? false : listMenuOpen}
            anchorRef={cardRef}
            options={listOptions}
            activeId={activeListId}
            headerTitle={activeListTitle}
            onToggle={() => {
              if (settingsOpen) return;
              setListMenuOpen((open) => !open);
            }}
            onSelect={onListSelect}
            onRename={onListRename}
            onAdd={onListAdd}
            onClose={() => setListMenuOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
