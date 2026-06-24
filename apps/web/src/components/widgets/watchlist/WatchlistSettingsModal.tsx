import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useRafLayoutSync } from "../../../lib/useRafLayoutSync";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import type { WatchlistListOption } from "./WatchlistListSelectMenu";
import {
  WATCHLIST_CHANGE_DISPLAY_OPTIONS,
  WATCHLIST_CHANGE_PERIOD_OPTIONS,
  WATCHLIST_SETTINGS_DIALOG_READY_EVENT,
  type WatchlistChangeDisplay,
  type WatchlistChangePeriod,
} from "./watchlistSettings";
import "../portfolio/portfolio-widget.css";
import "./watchlist-settings-modal.css";
type DropIndicator = {
  id: string;
  position: "before" | "after";
};

type Props = {
  open: boolean;
  lists: WatchlistListOption[];
  changeDisplay: WatchlistChangeDisplay;
  changePeriod: WatchlistChangePeriod;
  onClose: () => void;
  onListsReorder: (lists: WatchlistListOption[]) => void;
  onListRename: (id: string, title: string) => void;
  onChangeDisplay: (value: WatchlistChangeDisplay) => void;
  onChangePeriod: (value: WatchlistChangePeriod) => void;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function reorderLists(
  order: WatchlistListOption[],
  fromId: string,
  toId: string,
  position: "before" | "after",
): WatchlistListOption[] | null {
  const fromIndex = order.findIndex((item) => item.id === fromId);
  const toIndex = order.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromId === toId) return null;

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return null;

  let insertAt = position === "before" ? toIndex : toIndex + 1;
  if (fromIndex < insertAt) insertAt -= 1;
  next.splice(insertAt, 0, moved);
  return next;
}

type SettingsComboboxProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideGhostLabel?: boolean;
};

function SettingsCombobox<T extends string>({
  label,
  value,
  options,
  onChange,
  hideGhostLabel = false,
}: SettingsComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const selected = options.find((opt) => opt.value === value);

  useLayoutEffect(() => {
    if (!open) setMenuRect(null);
  }, [open]);

  useRafLayoutSync(open, () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({ left: rect.left, top: rect.bottom + 5, width: rect.width });
  });

  const menu =
    open && menuRect
      ? createPortal(
          <div
            className="portfolio-asset-select-menu watchlist-settings-combobox-menu"
            style={{ left: menuRect.left, top: menuRect.top, width: menuRect.width }}
            role="listbox"
            aria-label={label}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={cn(
                  "portfolio-asset-option list-on-glass",
                  opt.value === value && "active portfolio-asset-option--active",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {menu}
      <label
        className={cn(
          "portfolio-field portfolio-ghost-field watchlist-settings-combobox-field",
          !hideGhostLabel && "is-floated",
        )}
      >
        {hideGhostLabel ? null : <span className="portfolio-ghost-label">{label}</span>}
        <div ref={anchorRef} className="portfolio-asset-combobox">
          <input
            readOnly
            value={selected?.label ?? ""}
            aria-label={label}
            placeholder=" "
            className="portfolio-input-ghost portfolio-asset-combobox-input watchlist-settings-combobox-input"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
          />
          <img
            src="/assets/portfolio-ui/arrow_down.svg"
            alt=""
            aria-hidden="true"
            className="portfolio-asset-combobox-arrow"
          />
        </div>
      </label>
    </>
  );
}

export function WatchlistSettingsModal({
  open,
  lists,
  changeDisplay,
  changePeriod,
  onClose,
  onListsReorder,
  onListRename,
  onChangeDisplay,
  onChangePeriod,
}: Props) {
  useBackdropBlurPause(open);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraftTitles(Object.fromEntries(lists.map((list) => [list.id, list.title])));
  }, [open, lists]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const notifyReady = () => {
      window.dispatchEvent(new CustomEvent(WATCHLIST_SETTINGS_DIALOG_READY_EVENT));
    };

    const onAnimationEnd = (e: AnimationEvent) => {
      if (e.target === dialog && e.animationName === "watchlist-settings-drawer-in") {
        notifyReady();
      }
    };

    dialog.addEventListener("animationend", onAnimationEnd);
    const fallbackTimer = window.setTimeout(notifyReady, 360);

    return () => {
      dialog.removeEventListener("animationend", onAnimationEnd);
      window.clearTimeout(fallbackTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDraggingId(null);
      setDropIndicator(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const finishDrag = () => {
    setDraggingId(null);
    setDropIndicator(null);
  };

  const commitListTitle = (list: WatchlistListOption) => {
    const next = (draftTitles[list.id] ?? list.title).trim();
    if (!next) {
      setDraftTitles((prev) => ({ ...prev, [list.id]: list.title }));
      return;
    }
    if (next !== list.title) onListRename(list.id, next);
  };

  const handleDragStart = (e: DragEvent<HTMLButtonElement>, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDropIndicator(null);
  };

  const handleDragOver = (e: DragEvent<HTMLLIElement>, id: string) => {
    if (!draggingId || draggingId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const position: DropIndicator["position"] =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropIndicator({ id, position });
  };

  const handleDrop = (e: DragEvent<HTMLLIElement>, toId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain").trim();
    if (!fromId || !toId) {
      finishDrag();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position: DropIndicator["position"] =
      dropIndicator?.id === toId
        ? dropIndicator.position
        : e.clientY < rect.top + rect.height / 2
          ? "before"
          : "after";
    const next = reorderLists(lists, fromId, toId, position);
    if (next) onListsReorder(next);
    finishDrag();
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="watchlist-settings-backdrop-layer" role="presentation">
        <button type="button" className="watchlist-settings-backdrop" aria-label="Закрыть" onClick={onClose} />
      </div>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-settings-title"
        className="watchlist-settings-dialog atlas-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="watchlist-settings-header">
          <div className="watchlist-settings-header-backdrop atlas-glass" aria-hidden="true" />
          <h2 id="watchlist-settings-title" className="watchlist-settings-title">
            Список монет
          </h2>
          <button type="button" className="watchlist-settings-close btn-glass" onClick={onClose} aria-label="Закрыть">
            <img src="/assets/portfolio-ui/close.svg" alt="" className="watchlist-settings-close-icon" />
          </button>
        </div>

        <div className="watchlist-settings-body">
          <div className="watchlist-settings-field">
            <p className="watchlist-settings-field-label">Названия списков</p>
            <ul className="watchlist-settings-lists">
              {lists.map((list) => (
                <li
                  key={list.id}
                  className={cn(
                    "watchlist-settings-list-item",
                    draggingId === list.id && "watchlist-settings-list-item--dragging",
                    dropIndicator?.id === list.id &&
                      dropIndicator.position === "before" &&
                      "watchlist-settings-list-item--drop-before",
                    dropIndicator?.id === list.id &&
                      dropIndicator.position === "after" &&
                      "watchlist-settings-list-item--drop-after",
                  )}
                  onDragOver={(e) => handleDragOver(e, list.id)}
                  onDrop={(e) => handleDrop(e, list.id)}
                  onDragLeave={() => {
                    if (dropIndicator?.id === list.id) setDropIndicator(null);
                  }}
                >
                  <button
                    type="button"
                    className="watchlist-settings-list-drag"
                    draggable
                    aria-label={`Переместить ${list.title}`}
                    onDragStart={(e) => handleDragStart(e, list.id)}
                    onDragEnd={finishDrag}
                  >
                    <img
                      src="/assets/portfolio-ui/arrow_move.svg"
                      alt=""
                      className="watchlist-settings-list-drag-icon"
                      aria-hidden
                    />
                  </button>
                  <label
                    className={cn(
                      "watchlist-settings-list-field portfolio-field portfolio-ghost-field",
                      (draftTitles[list.id] ?? list.title) && "is-floated",
                    )}
                  >
                    <span className="portfolio-ghost-label">Название</span>
                    <input
                      type="text"
                      className="portfolio-input-ghost list-on-glass watchlist-settings-list-input"
                      value={draftTitles[list.id] ?? list.title}
                      aria-label={`Название ${list.title}`}
                      placeholder=" "
                      onChange={(e) =>
                        setDraftTitles((prev) => ({ ...prev, [list.id]: e.target.value }))
                      }
                      onBlur={() => commitListTitle(list)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          setDraftTitles((prev) => ({ ...prev, [list.id]: list.title }));
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="watchlist-settings-field">
            <p className="watchlist-settings-field-label">Изменение</p>
            <SettingsCombobox
              label="Изменение"
              value={changeDisplay}
              options={WATCHLIST_CHANGE_DISPLAY_OPTIONS}
              onChange={onChangeDisplay}
              hideGhostLabel
            />
          </div>

          <div className="watchlist-settings-field">
            <p className="watchlist-settings-field-label">Период изменений</p>
            <SettingsCombobox
              label="Период изменений"
              value={changePeriod}
              options={WATCHLIST_CHANGE_PERIOD_OPTIONS}
              onChange={onChangePeriod}
              hideGhostLabel
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
