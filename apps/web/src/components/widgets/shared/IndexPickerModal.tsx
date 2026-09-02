import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import {
  MARKET_INDEX_CATALOG,
  type MarketIndexId,
  type MarketIndexMeta,
} from "../index/marketIndexCatalog";
import "./asset-picker.css";

type Props = {
  open: boolean;
  activeIndexId?: MarketIndexId | null;
  onClose: () => void;
  onSelect: (index: MarketIndexMeta) => void;
};

export function IndexPickerModal({ open, activeIndexId, onClose, onSelect }: Props) {
  useBackdropBlurPause(open);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return MARKET_INDEX_CATALOG;
    return MARKET_INDEX_CATALOG.filter((item) => item.label.toLowerCase().includes(s));
  }, [q]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="asset-picker-overlay" role="presentation">
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="index-picker-title"
        className="asset-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asset-picker-header">
          <div className="asset-picker-search-panel">
            <label className="asset-picker-search-label">
              <span className="asset-picker-sr-only" id="index-picker-title">
                Поиск индекса
              </span>
              <span className="asset-picker-search-icon" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Введите название индекса"
                className="asset-picker-search-input"
                autoFocus
              />
            </label>
          </div>
          <div className="asset-picker-close-panel">
            <button
              type="button"
              onClick={onClose}
              className="asset-picker-close-button btn-glass"
              aria-label="Закрыть"
            >
              <img src="/assets/portfolio-ui/close.svg" alt="" className="asset-picker-close-icon" />
            </button>
          </div>
        </div>

        <div className="asset-picker-list-panel">
          <ul className="asset-picker-list">
            {filtered.length === 0 ? (
              <li className="asset-picker-message">Ничего не найдено</li>
            ) : (
              filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className={`asset-picker-item-button list-on-glass${activeIndexId === item.id ? " active" : ""}`}
                  >
                    <div className="asset-picker-item-text asset-picker-item-text--solo">
                      <p className="asset-picker-item-symbol">{item.label}</p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
