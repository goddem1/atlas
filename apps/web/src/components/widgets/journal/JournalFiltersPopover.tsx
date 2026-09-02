import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

export type JournalFilterState = {
  symbol: string;
  direction: "" | "long" | "short";
  from: string;
  to: string;
  pnlMin: string;
  pnlMax: string;
};

type PopoverPos = {
  top: number;
  left: number;
};

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  filters: JournalFilterState;
  onChange: (filters: JournalFilterState) => void;
  onClose: () => void;
};

const POPOVER_WIDTH = 280;
const VIEWPORT_GAP = 12;

function computePopoverPos(anchor: HTMLElement): PopoverPos {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
  let left = rect.right - width;
  left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - width - VIEWPORT_GAP));

  return {
    top: rect.bottom + 8,
    left,
  };
}

export function JournalFiltersPopover({ open, anchorRef, filters, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    setPos(computePopoverPos(anchorRef.current));
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      if (!anchorRef.current) return;
      setPos(computePopoverPos(anchorRef.current));
    };

    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="atlas-glass journal-filters-popover"
      role="dialog"
      aria-label="Фильтры"
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="journal-filters-popover-title">Фильтры</p>

      <label className="journal-filters-popover-field">
        Символ
        <input
          value={filters.symbol}
          onChange={(e) => onChange({ ...filters, symbol: e.target.value.toUpperCase() })}
        />
      </label>

      <label className="journal-filters-popover-field">
        Направление
        <select
          value={filters.direction}
          onChange={(e) =>
            onChange({ ...filters, direction: e.target.value as JournalFilterState["direction"] })
          }
        >
          <option value="">Все</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
      </label>

      <div className="journal-filters-popover-dates">
        <label className="journal-filters-popover-field">
          С
          <input
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </label>
        <label className="journal-filters-popover-field">
          По
          <input
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </label>
      </div>

      <div className="journal-filters-popover-dates">
        <label className="journal-filters-popover-field">
          PnL от, $
          <input
            inputMode="decimal"
            value={filters.pnlMin}
            onChange={(e) => onChange({ ...filters, pnlMin: e.target.value })}
            placeholder=" "
          />
        </label>
        <label className="journal-filters-popover-field">
          PnL до, $
          <input
            inputMode="decimal"
            value={filters.pnlMax}
            onChange={(e) => onChange({ ...filters, pnlMax: e.target.value })}
            placeholder=" "
          />
        </label>
      </div>
    </div>,
    document.body,
  );
}
