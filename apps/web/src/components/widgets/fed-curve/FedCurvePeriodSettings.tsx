import { useEffect, useRef } from "react";
import {
  FED_CURVE_COMPARE_PERIOD_OPTIONS,
  type FedCurveCompareDays,
} from "../../../lib/fedCurveComparePeriod";

type Props = {
  open: boolean;
  compareDays: FedCurveCompareDays;
  onSelect: (days: FedCurveCompareDays) => void;
  onClose: () => void;
};

export function FedCurvePeriodSettings({ open, compareDays, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="atlas-glass fed-curve-settings-popover"
      role="dialog"
      aria-label="Период сравнения для серой линии"
    >
      <p className="fed-curve-settings-popover-title">Период серой линии</p>
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
}
