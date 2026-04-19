import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { DashboardWidgetType } from "../../lib/dashboardWidgets";
import { WIDGET_CATALOG } from "../../lib/dashboardWidgets";
import "../widgets/shared/asset-picker.css";
import "../widgets/shared/widget-gallery.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (type: DashboardWidgetType) => void;
};

export function WidgetGalleryModal({ open, onClose, onPick }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="asset-picker-overlay" role="presentation">
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-gallery-title"
        className="asset-picker-dialog widget-gallery-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asset-picker-header">
          <h2 id="widget-gallery-title" className="widget-gallery-title">
            Добавить виджет
          </h2>
          <button type="button" onClick={onClose} className="asset-picker-close-button" aria-label="Закрыть">
            <img src="/assets/portfolio-ui/close.svg" alt="" className="asset-picker-close-icon" />
          </button>
        </div>

        <div className="widget-gallery-body">
          <ul className="widget-gallery-grid">
            {WIDGET_CATALOG.map((item) => (
              <li key={item.type}>
                <button
                  type="button"
                  className="widget-gallery-card"
                  onClick={() => {
                    onPick(item.type);
                    onClose();
                  }}
                >
                  <div className="widget-gallery-card-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 17l6-6 4 4 8-8M14 7h7v7"
                      />
                    </svg>
                  </div>
                  <div className="widget-gallery-card-text">
                    <p className="widget-gallery-card-title">{item.title}</p>
                    <p className="widget-gallery-card-desc">{item.description}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
