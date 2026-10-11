import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FED_CURVE_COMPARE_PERIOD_OPTIONS,
  type FedCurveCompareDays,
} from "../../../lib/fedCurveComparePeriod";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";

type Props = {
  open: boolean;
  compareDays: FedCurveCompareDays;
  onSelect: (days: FedCurveCompareDays) => void;
  onClose: () => void;
};

function useMaxWidth(px: number): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(max-width: ${px}px)`).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [px]);

  return matches;
}

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

export function FedCurvePeriodSettings({ open, compareDays, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useMaxWidth(430);
  useBackdropBlurPause(open && isMobile);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".fed-curve-settings-trigger")) return;
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
  }, [open, onClose, isMobile]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, isMobile]);

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "atlas-glass fed-curve-settings-popover",
        isMobile && "fed-curve-settings-popover--sheet",
      )}
      role="dialog"
      aria-label="Период сравнения для серой линии"
    >
      {isMobile ? <span className="fed-curve-settings-sheet-handle" aria-hidden /> : null}
      <div className="fed-curve-settings-popover-head">
        <p className="fed-curve-settings-popover-title">Период серой линии</p>
        {isMobile ? (
          <button
            type="button"
            className="fed-curve-settings-sheet-close btn-glass"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <img
              src="/assets/portfolio-ui/close.svg"
              alt=""
              className="fed-curve-settings-sheet-close-icon"
            />
          </button>
        ) : null}
      </div>
      <ul className="fed-curve-settings-period-list">
        {FED_CURVE_COMPARE_PERIOD_OPTIONS.map((opt) => (
          <li key={opt.days}>
            <button
              type="button"
              className={`fed-curve-settings-period-btn list-on-glass${
                compareDays === opt.days ? " active" : ""
              }`}
              onClick={() => {
                onSelect(opt.days);
                onClose();
              }}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (isMobile) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <div className="fed-curve-settings-sheet-root" role="presentation">
        <button
          type="button"
          className="fed-curve-settings-sheet-backdrop"
          aria-label="Закрыть"
          onClick={onClose}
        />
        {panel}
      </div>,
      document.body,
    );
  }

  return panel;
}
