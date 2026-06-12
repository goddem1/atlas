import { useEffect, useMemo, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import "./asset-picker-watchlist.css";

type Props = {
  open: boolean;
  items: CryptocurrencyListItem[];
  /** Уже добавленные тикеры (порядок сохраняется — так же вверху списка). */
  selectedSymbols?: string[];
  loadError?: string | null;
  onClose: () => void;
  onAdd: (c: CryptocurrencyListItem) => void;
  onRemove: (c: CryptocurrencyListItem) => void;
  onReorder?: (symbols: string[]) => void;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

type DropIndicator = {
  symbol: string;
  position: "before" | "after";
};

function reorderSymbols(
  order: string[],
  fromSymbol: string,
  toSymbol: string,
  position: "before" | "after",
): string[] | null {
  const fromIndex = order.indexOf(fromSymbol);
  const toIndex = order.indexOf(toSymbol);
  if (fromIndex < 0 || toIndex < 0 || fromSymbol === toSymbol) return null;

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return null;

  let insertAt = position === "before" ? toIndex : toIndex + 1;
  if (fromIndex < insertAt) insertAt -= 1;
  next.splice(insertAt, 0, moved);
  return next;
}

export function WatchlistCryptoPickerModal({
  open,
  items,
  selectedSymbols = [],
  loadError,
  onClose,
  onAdd,
  onRemove,
  onReorder,
}: Props) {
  const [q, setQ] = useState("");
  const [draggingSymbol, setDraggingSymbol] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  const selectedOrder = useMemo(
    () => selectedSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
    [selectedSymbols],
  );

  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDraggingSymbol(null);
      setDropIndicator(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sortedItems = useMemo(() => {
    const bySymbol = new Map(items.map((c) => [c.symbol.toUpperCase(), c]));
    const added = selectedOrder
      .map((sym) => bySymbol.get(sym))
      .filter((c): c is CryptocurrencyListItem => c != null);
    const rest = items.filter((c) => !selectedSet.has(c.symbol.toUpperCase()));
    return [...added, ...rest];
  }, [items, selectedOrder, selectedSet]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sortedItems;
    return sortedItems.filter(
      (c) => c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s),
    );
  }, [sortedItems, q]);

  const finishDrag = () => {
    setDraggingSymbol(null);
    setDropIndicator(null);
  };

  const handleDragStart = (e: DragEvent<HTMLButtonElement>, symbol: string) => {
    const sym = symbol.toUpperCase();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sym);
    setDraggingSymbol(sym);
    setDropIndicator(null);
  };

  const handleDragOver = (e: DragEvent<HTMLLIElement>, symbol: string) => {
    const sym = symbol.toUpperCase();
    if (!selectedSet.has(sym) || !draggingSymbol || draggingSymbol === sym) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const position: DropIndicator["position"] =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropIndicator({ symbol: sym, position });
  };

  const handleDrop = (e: DragEvent<HTMLLIElement>, toSymbol: string) => {
    e.preventDefault();
    const fromSymbol = e.dataTransfer.getData("text/plain").trim().toUpperCase();
    const toSym = toSymbol.trim().toUpperCase();
    if (!fromSymbol || !toSym || !onReorder) {
      finishDrag();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const position: DropIndicator["position"] =
      dropIndicator?.symbol === toSym
        ? dropIndicator.position
        : e.clientY < rect.top + rect.height / 2
          ? "before"
          : "after";

    const next = reorderSymbols(selectedOrder, fromSymbol, toSym, position);
    if (next) onReorder(next);
    finishDrag();
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="asset-picker-overlay-watchlist" role="presentation">
      <button
        type="button"
        className="asset-picker-watchlist-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-crypto-picker-title"
        className="asset-picker-watchlist-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asset-picker-watchlist-header">
          <div className="asset-picker-watchlist-search-panel">
            <label className="asset-picker-watchlist-search-label">
              <span className="asset-picker-watchlist-sr-only" id="watchlist-crypto-picker-title">
                Поиск актива для списка
              </span>
              <span className="asset-picker-watchlist-search-icon" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Введите название или тикер актива"
                className="asset-picker-watchlist-search-input"
                autoFocus
              />
            </label>
          </div>
          <div className="asset-picker-watchlist-close-panel">
            <button
              type="button"
              onClick={onClose}
              className="asset-picker-watchlist-close-button btn-glass"
              aria-label="Закрыть"
            >
              <img src="/assets/portfolio-ui/close.svg" alt="" className="asset-picker-watchlist-close-icon" />
            </button>
          </div>
        </div>

        <div className="asset-picker-watchlist-list-panel">
          <ul className="asset-picker-watchlist-list">
            {loadError ? (
              <li className="asset-picker-watchlist-message asset-picker-watchlist-message-error">
                Не удалось загрузить активы: {loadError}
              </li>
            ) : items.length === 0 ? (
              <li className="asset-picker-watchlist-message">
                В справочнике нет записей. Запустите API, БД и{" "}
                <code className="asset-picker-watchlist-code">pnpm db:seed</code>.
              </li>
            ) : filtered.length === 0 ? (
              <li className="asset-picker-watchlist-message">Ничего не найдено</li>
            ) : (
              filtered.map((c) => {
                const sym = c.symbol.toUpperCase();
                const isSelected = selectedSet.has(sym);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "asset-picker-watchlist-item",
                      isSelected && draggingSymbol === sym && "asset-picker-watchlist-item--dragging",
                      isSelected &&
                        dropIndicator?.symbol === sym &&
                        dropIndicator.position === "before" &&
                        "asset-picker-watchlist-item--drop-before",
                      isSelected &&
                        dropIndicator?.symbol === sym &&
                        dropIndicator.position === "after" &&
                        "asset-picker-watchlist-item--drop-after",
                    )}
                    onDragOver={(e) => {
                      if (isSelected) handleDragOver(e, sym);
                    }}
                    onDrop={(e) => {
                      if (isSelected) handleDrop(e, sym);
                    }}
                    onDragLeave={(e) => {
                      if (dropIndicator?.symbol !== sym) return;
                      const next = e.relatedTarget;
                      if (next instanceof Node && e.currentTarget.contains(next)) return;
                      setDropIndicator(null);
                    }}
                  >
                    {isSelected ? (
                      <button
                        type="button"
                        className="asset-picker-watchlist-item-drag-handle"
                        draggable={Boolean(onReorder)}
                        aria-label={`Переместить ${c.symbol}`}
                        onDragStart={(e) => handleDragStart(e, sym)}
                        onDragEnd={finishDrag}
                      />
                    ) : (
                      <span className="asset-picker-watchlist-item-drag-spacer" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isSelected) onAdd(c);
                      }}
                      className="asset-picker-watchlist-item-button list-on-glass"
                      aria-label={isSelected ? `${c.symbol} уже в списке` : `Добавить ${c.symbol} в список`}
                    >
                      <img src={c.iconUrl} alt="" className="asset-picker-watchlist-item-icon" />
                      <div className="asset-picker-watchlist-item-text">
                        <p className="asset-picker-watchlist-item-symbol">{c.symbol}</p>
                        <p className="asset-picker-watchlist-item-name">{c.name}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="asset-picker-watchlist-item-action btn-on-glass btn-on-glass--soft"
                      aria-label={isSelected ? `Удалить ${c.symbol} из списка` : `Добавить ${c.symbol} в список`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) onRemove(c);
                        else onAdd(c);
                      }}
                    >
                      <img
                        src={isSelected ? "/assets/portfolio-ui/trash.svg" : "/assets/portfolio-ui/plus.svg"}
                        alt=""
                        className={`asset-picker-watchlist-item-action-icon${isSelected ? " asset-picker-watchlist-item-action-icon--trash" : ""}`}
                      />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
