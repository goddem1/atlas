import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRafLayoutSync } from "../../../lib/useRafLayoutSync";

export type WatchlistListOption = {
  id: string;
  title: string;
};

export const DEFAULT_WATCHLIST_OPTIONS: WatchlistListOption[] = [
  { id: "list-1", title: "Список 1" },
];

const PANEL_OFFSET_TOP = 10;
const PANEL_OFFSET_LEFT = 10;
const TRIGGER_OFFSET_TOP = 23;
const TRIGGER_OFFSET_LEFT = 30;

type PanelPos = {
  top: number;
  left: number;
};

type TriggerRect = {
  top: number;
  left: number;
  height: number;
};

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
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

function readPanelPos(anchor: HTMLElement): PanelPos {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.top + PANEL_OFFSET_TOP,
    left: rect.left + PANEL_OFFSET_LEFT,
  };
}

function readTriggerPosFromAnchor(anchor: HTMLElement, height: number): TriggerRect {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.top + anchor.clientTop + TRIGGER_OFFSET_TOP,
    left: rect.left + anchor.clientLeft + TRIGGER_OFFSET_LEFT,
    height,
  };
}

function readTriggerRect(button: HTMLElement): TriggerRect {
  const rect = button.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    height: rect.height,
  };
}

export function WatchlistListSelectMenu({
  open,
  anchorRef,
  options,
  activeId,
  headerTitle,
  onToggle,
  onSelect,
  onRename,
  onAdd,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const [triggerRect, setTriggerRect] = useState<TriggerRect | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const handleToggle = () => {
    if (!open && triggerRef.current && anchorRef.current) {
      setTriggerRect(readTriggerRect(triggerRef.current));
      setPanelPos(readPanelPos(anchorRef.current));
    }
    onToggle();
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      setTriggerRect(null);
    }
  }, [open]);

  useRafLayoutSync(open, () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPanelPos(readPanelPos(anchor));
    setTriggerRect((prev) => {
      const height = prev?.height ?? 25;
      return readTriggerPosFromAnchor(anchor, height);
    });
  });

  useEffect(() => {
    if (!open) return;

    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".watchlist-list-select, .watchlist-list-header-select")) return;
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

  const headerSlotHeight =
    panelPos && triggerRect
      ? Math.max(0, Math.round(triggerRect.top - panelPos.top + triggerRect.height + 6))
      : 0;

  const triggerOffsetInPanel =
    panelPos && triggerRect
      ? {
          top: triggerRect.top - panelPos.top,
          left: triggerRect.left - panelPos.left,
        }
      : null;

  const triggerButton = (
    <button
      ref={!open ? triggerRef : undefined}
      type="button"
      className={cn(
        "watchlist-list-select watchlist-list-header-select",
        open && "watchlist-list-select--floating",
      )}
      aria-haspopup="listbox"
      aria-expanded={open}
      style={
        open && triggerOffsetInPanel
          ? { top: triggerOffsetInPanel.top, left: triggerOffsetInPanel.left }
          : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
    >
      <span>{headerTitle}</span>
      <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="watchlist-list-select-icon" />
    </button>
  );

  const panel =
    open && panelPos && triggerRect
      ? createPortal(
          <div
            className="watchlist-list-menu-portal-root"
            style={{
              top: panelPos.top,
              left: panelPos.left,
            }}
          >
            <div
              ref={panelRef}
              className="watchlist-list-menu-panel watchlist-list-menu-panel--portal"
              role="listbox"
              aria-label="Выбор списка"
            >
              <div className="watchlist-list-menu-backdrop atlas-glass" aria-hidden="true" />
              <div className="watchlist-list-menu-content">
                <div
                  className="watchlist-list-menu-header-slot"
                  style={{ height: headerSlotHeight }}
                  aria-hidden="true"
                />
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
            </div>
            {triggerButton}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {panel}
      {!open ? triggerButton : null}
    </>
  );
}
