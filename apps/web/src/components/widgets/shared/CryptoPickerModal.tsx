import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import "./asset-picker.css";

type Props = {
  open: boolean;
  items: CryptocurrencyListItem[];
  /** Ошибка загрузки списка с API (показывается вместо пустого «ничего не найдено»). */
  loadError?: string | null;
  onClose: () => void;
  onSelect: (c: CryptocurrencyListItem) => void;
};

export function CryptoPickerModal({ open, items, loadError, onClose, onSelect }: Props) {
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
    if (!s) return items;
    return items.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s),
    );
  }, [items, q]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="asset-picker-overlay" role="presentation">
      <button
        type="button"
        className="asset-picker-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crypto-picker-title"
        className="asset-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asset-picker-header">
          <label className="asset-picker-search-label">
            <span className="asset-picker-sr-only" id="crypto-picker-title">
              Поиск актива
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по имени или тикеру…"
              className="asset-picker-search-input"
              autoFocus
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            className="asset-picker-close-button"
            aria-label="Закрыть"
          >
            <img src="/assets/portfolio-ui/close.svg" alt="" className="asset-picker-close-icon" />
          </button>
        </div>

        <ul className="asset-picker-list">
          {loadError ? (
            <li className="asset-picker-message asset-picker-message-error">
              Не удалось загрузить активы: {loadError}
            </li>
          ) : items.length === 0 ? (
            <li className="asset-picker-message">
              В справочнике нет записей. Запустите API, БД и{" "}
              <code className="asset-picker-code">pnpm db:seed</code>.
            </li>
          ) : filtered.length === 0 ? (
            <li className="asset-picker-message">
              Ничего не найдено
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                  className="asset-picker-item-button"
                >
                  <img
                    src={c.iconUrl}
                    alt=""
                    className="asset-picker-item-icon"
                  />
                  <div className="asset-picker-item-text">
                    <p className="asset-picker-item-symbol">
                      {c.symbol}
                    </p>
                    <p className="asset-picker-item-name">
                      {c.name}
                    </p>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
