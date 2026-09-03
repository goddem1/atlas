import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRafLayoutSync } from "../../../lib/useRafLayoutSync";

export type WatchlistListOption = {
  id: string;
  title: string;
};

export const DEFAULT_WATCHLIST_OPTIONS: WatchlistListOption[] = [
  { id: "list-1", title: "Список 1" },
];

const PANEL_OFFSET_TOP = -13;
const PANEL_OFFSET_LEFT = -20;

type Props = {
  open: boolean;
  options: WatchlistListOption[];
  activeId: string;
  headerTitle: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onAdd?: () => void;
  onClose: () => void;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function resolveHost(from: HTMLElement | null): HTMLElement | null {
  return from?.closest<HTMLElement>(".dashboard-widget-slot") ?? from?.closest<HTMLElement>(".watchlist-shell") ?? null;
}

export function WatchlistListSelectMenu({
  open,
  options,
  activeId,
  headerTitle,
  onToggle,
  onSelect,
  onRename,
  onAdd,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [triggerPos, setTriggerPos] = useState<{ top: number; left: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const syncLayout = useCallback(() => {
    const trigger = triggerRef.current;
    const nextHost = resolveHost(rootRef.current);
    if (nextHost !== host) setHost(nextHost);
    if (!trigger || !nextHost) return;
    const triggerRect = trigger.getBoundingClientRect();
    const hostRect = nextHost.getBoundingClientRect();
    const top = triggerRect.top - hostRect.top;
    const left = triggerRect.left - hostRect.left;
    setTriggerPos({ top, left });
    setPanelPos({
      top: top + PANEL_OFFSET_TOP,
      left: left + PANEL_OFFSET_LEFT,
    });
  }, [host]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      setTriggerPos(null);
      return;
    }
    syncLayout();
  }, [open, syncLayout]);

  useRafLayoutSync(open, syncLayout);

  useEffect(() => {
    if (!open) return;

    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".watchlist-list-select-overlay")) return;
      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!editingId) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingId]);

  const commitRename = (id: string) => {
    const next = draftTitle.trim();
    if (next && onRename) {
      onRename(id, next);
    }
    setEditingId(null);
    setDraftTitle("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  const startRename = (opt: WatchlistListOption) => {
    setEditingId(opt.id);
    setDraftTitle(opt.title);
  };

  const panel =
    open && panelPos && host
      ? createPortal(
          <div
            ref={panelRef}
            className="watchlist-list-menu-panel watchlist-list-menu-panel--portal"
            role="listbox"
            aria-label="Выбор списка"
            style={{
              top: panelPos.top,
              left: panelPos.left,
            }}
          >
            <div className="watchlist-list-menu-backdrop atlas-glass" aria-hidden="true" />
            <div className="watchlist-list-menu-content">
              <div className="watchlist-list-menu-header-slot" aria-hidden="true" />
              <div className="watchlist-list-menu-divider" />
              <ul className="watchlist-list-menu-options">
                {options.map((opt) => (
                  <li
                    key={opt.id}
                    className={cn(
                      "watchlist-list-menu-option-item",
                      activeId === opt.id && "is-active",
                      editingId === opt.id && "is-editing",
                    )}
                  >
                    {editingId === opt.id ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        className="watchlist-list-menu-option-input"
                        value={draftTitle}
                        aria-label="Название списка"
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => commitRename(opt.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(opt.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeId === opt.id}
                        className={cn(
                          "watchlist-list-menu-option list-on-glass",
                          activeId === opt.id && "active",
                        )}
                        onClick={() => {
                          onSelect(opt.id);
                          onClose();
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startRename(opt);
                        }}
                      >
                        {opt.title}
                      </button>
                    )}
                  </li>
                ))}
                {onAdd ? (
                  <li className="watchlist-list-menu-option-item">
                    <button
                      type="button"
                      className="watchlist-list-menu-option watchlist-list-menu-add list-on-glass"
                      aria-label="Добавить список"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd();
                      }}
                    >
                      <img
                        src="/assets/portfolio-ui/plus.svg"
                        alt=""
                        className="watchlist-list-menu-add-icon"
                      />
                    </button>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>,
          host,
        )
      : null;

  const overlayTrigger =
    open && triggerPos && host
      ? createPortal(
          <button
            type="button"
            className="watchlist-list-select watchlist-list-header-select watchlist-list-select-overlay"
            aria-haspopup="listbox"
            aria-expanded
            style={{ top: triggerPos.top, left: triggerPos.left }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <span>{headerTitle}</span>
            <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="watchlist-list-select-icon" />
          </button>,
          host,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("watchlist-list-select-wrap", open && "is-open")}>
      {panel}
      {overlayTrigger}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "watchlist-list-select watchlist-list-header-select",
          open && "watchlist-list-select--anchor",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={open ? -1 : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span>{headerTitle}</span>
        <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="watchlist-list-select-icon" />
      </button>
    </div>
  );
}
