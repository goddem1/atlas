import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import type { TradeRecord, TradeUpsertPayload } from "../../../services/api";
import {
  createTrade,
  fetchCryptocurrencies,
  fetchTradeEquityCurve,
  fetchTrades,
  updateTrade,
} from "../../../services/api";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import { EquityCurveChart } from "../../charts/EquityCurveChart";
import "../../charts/equity-curve-chart.css";
import { JournalTradesTable } from "./JournalTradesTable";
import type { JournalFilterState } from "./JournalFiltersPopover";
import "./journal-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTradeId?: string | null;
};

export function JournalModal({ open, onClose, initialTradeId = null }: Props) {
  useBackdropBlurPause(open);
  const tableRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [curve, setCurve] = useState<{ date: string; value: number }[]>([]);
  const [assets, setAssets] = useState<CryptocurrencyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<JournalFilterState>({
    symbol: "",
    direction: "",
    from: "",
    to: "",
    pnlMin: "",
    pnlMax: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);

  const assetsBySymbol = useMemo(() => new Map(assets.map((a) => [a.symbol, a])), [assets]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [nextTrades, nextCurve, nextAssets] = await Promise.all([
        fetchTrades({
          period: "all",
          symbol: filters.symbol || undefined,
          direction: filters.direction || undefined,
          from: filters.from ? new Date(filters.from).toISOString() : undefined,
          to: filters.to ? new Date(filters.to).toISOString() : undefined,
          pnlMin: filters.pnlMin || undefined,
          pnlMax: filters.pnlMax || undefined,
        }),
        fetchTradeEquityCurve("all"),
        fetchCryptocurrencies(),
      ]);
      setTrades(nextTrades);
      setCurve(nextCurve.map((p) => ({ date: p.date, value: p.cumulativePnl })));
      setAssets(nextAssets);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить журнал");
      setTrades([]);
      setCurve([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (open) return;
    setAddFormOpen(false);
    setEditingTrade(null);
    setFormErr(null);
  }, [open]);

  useEffect(() => {
    if (!open || !initialTradeId) return;
    setExpandedId(initialTradeId);
  }, [open, initialTradeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (filtersOpen) {
          setFiltersOpen(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, filtersOpen]);

  const handleSave = async (payload: TradeUpsertPayload) => {
    setSaving(true);
    setFormErr(null);
    const wasEditing = Boolean(editingTrade);
    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, payload);
      } else {
        await createTrade(payload);
      }
      setEditingTrade(null);
      setAddFormOpen(false);
      if (!wasEditing) setFormResetKey((key) => key + 1);
      await load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Не удалось сохранить сделку");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (trade: TradeRecord) => {
    setEditingTrade(trade);
    setAddFormOpen(false);
    setFormErr(null);
    setExpandedId(null);
  };

  const handleOpenAddForm = () => {
    setEditingTrade(null);
    setFormErr(null);
    setAddFormOpen(true);
    tableRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCloseForm = () => {
    setEditingTrade(null);
    setAddFormOpen(false);
    setFormErr(null);
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="journal-modal-overlay" role="presentation">
      <button type="button" className="journal-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="journal-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="journal-modal-chart-card atlas-glass">
          <EquityCurveChart points={curve} variant="full" showTotalPnlLine />
        </div>

        {err ? <p className="journal-modal-error">{err}</p> : null}
        {loading ? <p className="journal-modal-loading">Загрузка…</p> : null}

        <div ref={tableRef} className="journal-modal-table-card atlas-glass">
          {!loading ? (
            <JournalTradesTable
              trades={trades}
              assetsBySymbol={assetsBySymbol}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
              onEdit={handleEdit}
              filters={filters}
              onFiltersChange={setFilters}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              editingTrade={editingTrade}
              saving={saving}
              formError={formErr}
              formResetKey={formResetKey}
              formOpen={addFormOpen}
              onOpenForm={handleOpenAddForm}
              onSubmitTrade={handleSave}
              onCancelEdit={handleCloseForm}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
