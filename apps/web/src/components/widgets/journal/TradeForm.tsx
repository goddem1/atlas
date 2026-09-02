import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import type { TradeRecord, TradeUpsertPayload } from "../../../services/api";
import { fetchCryptocurrencies } from "../../../services/api";
import { extractPlainText } from "../../notes/noteContentMeta";
import {
  formatTradeDuration,
  formatTradePnlPercent,
  formatTradePnlUsdTable,
  parseTradeUsdAmount,
  pnlTone,
  previewTradePnl,
  stripSymbolUsdt,
} from "./journalFormat";
import "../portfolio/portfolio-widget.css";

type ShellProps = {
  initial?: TradeRecord | null;
  saving?: boolean;
  error?: string | null;
  colSpan?: number;
  onSubmit: (payload: TradeUpsertPayload) => void | Promise<void>;
  onCancel?: () => void;
  children: (parts: { formRow: ReactNode }) => ReactNode;
};

type QtyUnit = "usd" | "coins";

function PortfolioGhostField({
  label,
  floated,
  className,
  children,
}: {
  label: string;
  floated?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`portfolio-field portfolio-ghost-field journal-trade-ghost-field${
        floated ? " is-floated" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <span className="portfolio-ghost-label">{label}</span>
      {children}
    </label>
  );
}

function validateFormValues(values: FormValues, assetQuery: string): string | null {
  const symbol = (values.symbol.trim() || assetQuery.trim()).toUpperCase();
  if (!symbol) return "Укажите символ (например, BTCUSDT)";
  if (!values.entryPrice.trim() || Number(values.entryPrice) <= 0) return "Укажите цену входа";
  if (!values.exitPrice.trim() || Number(values.exitPrice) <= 0) return "Укажите цену выхода";
  if (!values.quantity.trim() || Number(values.quantity) <= 0) return "Укажите объём";
  if (!values.entryAt) return "Укажите время входа";
  const entryAt = fromLocalInputValue(values.entryAt);
  if (!entryAt) return "Некорректная дата и время входа";
  if (values.exitAt) {
    const exitAt = fromLocalInputValue(values.exitAt);
    if (!exitAt) return "Некорректная дата и время выхода";
    if (new Date(exitAt).getTime() <= new Date(entryAt).getTime()) {
      return "Время выхода должно быть позже времени входа";
    }
  }
  return null;
}

type FormValues = {
  symbol: string;
  direction: "long" | "short";
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryAt: string;
  exitAt: string;
  commission: string;
  fundingFee: string;
  reason: string;
  comment: string;
};

function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toISOString();
}

function emptyValues(): FormValues {
  const now = new Date();
  const earlier = new Date(now.getTime() - 60 * 60 * 1000);
  return {
    symbol: "",
    direction: "long",
    entryPrice: "",
    exitPrice: "",
    quantity: "",
    entryAt: toLocalInputValue(earlier.toISOString()),
    exitAt: "",
    commission: "0",
    fundingFee: "0",
    reason: "",
    comment: "",
  };
}

function fromTrade(trade: TradeRecord): FormValues {
  return {
    symbol: trade.symbol,
    direction: trade.direction === "short" ? "short" : "long",
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    entryAt: toLocalInputValue(trade.entryAt),
    exitAt: trade.exitAt ? toLocalInputValue(trade.exitAt) : "",
    commission: trade.commission,
    fundingFee: trade.fundingFee,
    reason: trade.reason ?? "",
    comment: extractPlainText(trade.comment),
  };
}

function AutoResizeTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 50)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      placeholder=" "
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TradeFormShell({
  initial,
  saving = false,
  error,
  colSpan = 10,
  onSubmit,
  onCancel,
  children,
}: ShellProps) {
  const [values, setValues] = useState<FormValues>(() => (initial ? fromTrade(initial) : emptyValues()));
  const [assets, setAssets] = useState<CryptocurrencyListItem[]>([]);
  const [assetQuery, setAssetQuery] = useState(() => initial?.symbol ?? "");
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [qtyUnit, setQtyUnit] = useState<QtyUnit>("coins");
  const [validationError, setValidationError] = useState<string | null>(null);
  const symbolWrapRef = useRef<HTMLDivElement>(null);
  const isEditing = Boolean(initial);

  useEffect(() => {
    void fetchCryptocurrencies().then(setAssets).catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    const next = initial ? fromTrade(initial) : emptyValues();
    setValues(next);
    setAssetQuery(next.symbol);
    setQtyUnit(initial?.quantityUnit === "usd" ? "usd" : "coins");
    setValidationError(null);
  }, [initial]);

  useEffect(() => {
    if (!assetMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (symbolWrapRef.current?.contains(event.target)) return;
      setAssetMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [assetMenuOpen]);

  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    if (!q) return assets.slice(0, 12);
    return assets
      .filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [assetQuery, assets]);

  const selectedAsset = useMemo(() => {
    const symbol = (values.symbol.trim() || assetQuery.trim()).toUpperCase();
    if (!symbol) return null;
    const base = stripSymbolUsdt(symbol);
    return assets.find((a) => a.symbol.toUpperCase() === base) ?? null;
  }, [assetQuery, assets, values.symbol]);

  const patchField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const preview = useMemo(
    () => previewTradePnl({ ...values, quantityUnit: qtyUnit }),
    [values, qtyUnit],
  );

  const durationPreview = useMemo(() => {
    if (!values.entryAt || !values.exitAt) return "—";
    return formatTradeDuration(fromLocalInputValue(values.entryAt), fromLocalInputValue(values.exitAt));
  }, [values.entryAt, values.exitAt]);

  const submitTrade = () => {
    const validationMessage = validateFormValues(values, assetQuery);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    const symbol = (values.symbol.trim() || assetQuery.trim()).toUpperCase();
    void onSubmit({
      symbol,
      direction: values.direction,
      entryPrice: values.entryPrice,
      exitPrice: values.exitPrice,
      quantity: values.quantity,
      quantityUnit: qtyUnit,
      entryAt: fromLocalInputValue(values.entryAt),
      exitAt: values.exitAt ? fromLocalInputValue(values.exitAt) : null,
      commission: String(parseTradeUsdAmount(values.commission)),
      fundingFee: String(parseTradeUsdAmount(values.fundingFee)),
      reason: values.reason.trim() || null,
      comment: values.comment.trim() || null,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitTrade();
  };

  const formRow = (
    <>
      <tr className={`journal-table-form-row portfolio-transaction-body${isEditing ? " is-editing" : ""}`}>
        <td className="journal-table-form-cell journal-col-entryAt">
          <div className="journal-table-form-stack">
            <PortfolioGhostField label="Вход" floated={Boolean(values.entryAt)}>
              <input
                type="datetime-local"
                className="portfolio-input-ghost"
                value={values.entryAt}
                onChange={(e) => patchField("entryAt", e.target.value)}
                placeholder=" "
              />
            </PortfolioGhostField>
            <PortfolioGhostField label="Выход" floated={Boolean(values.exitAt)}>
              <input
                type="datetime-local"
                className="portfolio-input-ghost"
                value={values.exitAt}
                onChange={(e) => patchField("exitAt", e.target.value)}
                placeholder=" "
              />
            </PortfolioGhostField>
            <span className="journal-trade-form-duration">{durationPreview}</span>
          </div>
        </td>

        <td className="journal-table-form-cell journal-col-symbol">
          <div className="journal-trade-form-asset" ref={symbolWrapRef}>
            <PortfolioGhostField
              label="Монета"
              floated={assetMenuOpen || Boolean(assetQuery) || Boolean(values.symbol)}
            >
              <div className="portfolio-asset-combobox">
                {selectedAsset ? <img src={selectedAsset.iconUrl} alt="" className="portfolio-inline-coin" /> : null}
                <input
                  name="symbol"
                  value={assetQuery}
                  onChange={(e) => {
                    setAssetQuery(e.target.value);
                    patchField("symbol", e.target.value.trim().toUpperCase());
                    setAssetMenuOpen(true);
                  }}
                  onFocus={() => setAssetMenuOpen(true)}
                  className={`portfolio-input-ghost${selectedAsset ? " portfolio-input-ghost-select-active" : ""}`}
                  placeholder=" "
                />
                <img
                  src="/assets/portfolio-ui/arrow_down.svg"
                  alt=""
                  aria-hidden="true"
                  className="portfolio-asset-combobox-arrow"
                />
              </div>
              {assetMenuOpen && filteredAssets.length > 0 ? (
                <div className="portfolio-asset-select-menu">
                  {filteredAssets.map((asset) => (
                    <button
                      key={asset.symbol}
                      type="button"
                      className="portfolio-asset-option list-on-glass"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const symbol = `${asset.symbol}USDT`;
                        setAssetQuery(symbol);
                        patchField("symbol", symbol);
                        setAssetMenuOpen(false);
                      }}
                    >
                      <img src={asset.iconUrl} alt="" className="portfolio-inline-coin" />
                      <span>{asset.symbol}USDT</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </PortfolioGhostField>

            <PortfolioGhostField label="Цена входа" floated={Boolean(values.entryPrice)}>
              <input
                inputMode="decimal"
                className="portfolio-input-ghost"
                value={values.entryPrice}
                onChange={(e) => patchField("entryPrice", e.target.value)}
                placeholder=" "
              />
            </PortfolioGhostField>

            <PortfolioGhostField label="Цена выхода" floated={Boolean(values.exitPrice)}>
              <input
                inputMode="decimal"
                className="portfolio-input-ghost"
                value={values.exitPrice}
                onChange={(e) => patchField("exitPrice", e.target.value)}
                placeholder=" "
              />
            </PortfolioGhostField>

            <div className="portfolio-amount-line journal-trade-form-amount-line">
              <PortfolioGhostField
                label={qtyUnit === "usd" ? "Объём ($)" : "Объём (монет)"}
                floated={Boolean(values.quantity)}
              >
                <input
                  inputMode="decimal"
                  className="portfolio-input-ghost"
                  value={values.quantity}
                  onChange={(e) => patchField("quantity", e.target.value)}
                  placeholder=" "
                />
              </PortfolioGhostField>
              <div className="portfolio-currency-switch">
                <button
                  type="button"
                  className={`portfolio-currency-btn${qtyUnit === "usd" ? " active" : ""}`}
                  onClick={() => setQtyUnit("usd")}
                >
                  $
                </button>
                <button
                  type="button"
                  className={`portfolio-currency-btn${qtyUnit === "coins" ? " active" : ""}`}
                  onClick={() => setQtyUnit("coins")}
                >
                  {selectedAsset ? (
                    <img src={selectedAsset.iconUrl} alt="" className="portfolio-currency-asset-icon" />
                  ) : (
                    <span className="portfolio-currency-empty-dot" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </td>

        <td className="journal-table-form-cell journal-col-pnlUsd">
          {preview ? (
            <span className={`journal-pnl journal-pnl--${pnlTone(preview.pnlUsd)}`}>
              {formatTradePnlUsdTable(preview.pnlUsd)}
            </span>
          ) : (
            <span className="journal-table-form-placeholder">—</span>
          )}
        </td>

        <td className="journal-table-form-cell journal-col-pnlPercent">
          {preview ? (
            <span className={`journal-pnl journal-pnl--${pnlTone(preview.pnlPercent)}`}>
              {formatTradePnlPercent(preview.pnlPercent)}
            </span>
          ) : (
            <span className="journal-table-form-placeholder">—</span>
          )}
        </td>

        <td className="journal-table-form-cell journal-col-commission">
          <PortfolioGhostField
            label="Сумма комиссии"
            floated={Boolean(values.commission)}
            className="journal-trade-form-commission"
          >
            <input
              inputMode="decimal"
              className="portfolio-input-ghost"
              value={values.commission}
              onChange={(e) => patchField("commission", e.target.value)}
              placeholder=" "
            />
          </PortfolioGhostField>
        </td>

        <td className="journal-table-form-cell journal-col-fundingFee">
          <PortfolioGhostField
            label="Фандинг"
            floated={Boolean(values.fundingFee)}
            className="journal-trade-form-funding"
          >
            <input
              inputMode="decimal"
              className="portfolio-input-ghost"
              value={values.fundingFee}
              onChange={(e) => patchField("fundingFee", e.target.value)}
              placeholder=" "
            />
          </PortfolioGhostField>
        </td>

        <td className="journal-table-form-cell journal-col-direction">
          <div className="portfolio-buy-sell-toggle journal-trade-form-direction">
            <button
              type="button"
              className={`portfolio-buy-sell-btn${values.direction === "long" ? " active" : ""}`}
              onClick={() => patchField("direction", "long")}
            >
              L
            </button>
            <button
              type="button"
              className={`portfolio-buy-sell-btn${values.direction === "short" ? " active" : ""}`}
              onClick={() => patchField("direction", "short")}
            >
              S
            </button>
          </div>
        </td>

        <td className="journal-table-form-cell journal-col-reason">
          <PortfolioGhostField
            label="Основание"
            floated={Boolean(values.reason)}
            className="journal-trade-form-reason"
          >
            <input
              className="portfolio-input-ghost"
              value={values.reason}
              onChange={(e) => patchField("reason", e.target.value)}
              placeholder=" "
            />
          </PortfolioGhostField>
        </td>

        <td className="journal-table-form-cell journal-col-commentPreview">
          <PortfolioGhostField
            label="Комментарий"
            floated={Boolean(values.comment)}
            className="journal-trade-form-comment"
          >
            <AutoResizeTextarea
              className="portfolio-input-ghost journal-trade-form-comment-input"
              value={values.comment}
              onChange={(value) => patchField("comment", value)}
            />
          </PortfolioGhostField>
        </td>

        <td className="journal-table-form-cell journal-col-expand journal-table-form-expand-col">
          <div className="journal-trade-form-actions">
            {onCancel ? (
              <button
                type="button"
                className="journal-trade-form-icon-btn journal-trade-form-icon-btn--ghost"
                aria-label="Отмена"
                onClick={onCancel}
              >
                <CloseIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="journal-trade-form-icon-btn journal-trade-form-icon-btn--primary"
              disabled={saving}
              aria-label={saving ? "Сохранение…" : isEditing ? "Сохранить" : "Добавить"}
              onClick={submitTrade}
            >
              <CheckIcon />
            </button>
          </div>
        </td>
      </tr>

      {validationError || error ? (
        <tr className="journal-table-form-error-row">
          <td colSpan={colSpan} className="journal-table-form-error-cell">
            <p className="trade-form-error journal-trade-form-error">{validationError ?? error}</p>
          </td>
        </tr>
      ) : null}
    </>
  );

  return (
    <form className="journal-trade-form" onSubmit={handleSubmit} noValidate>
      {children({ formRow })}
    </form>
  );
}

/** @deprecated use TradeFormShell */
export const TradeTableFormRow = TradeFormShell;
export const TradeForm = TradeFormShell;
