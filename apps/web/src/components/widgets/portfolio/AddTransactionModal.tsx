import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem, PortfolioTransactionUpsertInput } from "@atlas-v1/shared";

type AmountMode = "coins" | "usd";
type GoalPart = "all" | "half" | "third" | "quarter";
type GoalRow = {
  id: string;
  persistedId?: string;
  targetUsd: string;
  sellCoins: string;
};

type Draft = {
  persistedId?: string;
  symbol: string;
  type: "BUY" | "SELL";
  date: string;
  priceUsd: string;
  amountMode: AmountMode;
  amountCoins: string;
  amountUsd: string;
  assetInput: string;
};

type Props = {
  open: boolean;
  assets: CryptocurrencyListItem[];
  submitting: boolean;
  errorText?: string | null;
  mode?: "create" | "edit";
  initial?: Partial<PortfolioTransactionUpsertInput>;
  initialDrafts?: Array<Partial<PortfolioTransactionUpsertInput> & { id?: string }>;
  initialActiveDraftIndex?: number;
  initialGoals?: Array<{ id?: string; targetPriceUsd: string; sellCoins: string }>;
  onClose: () => void;
  onSubmit: (payload: PortfolioTransactionUpsertInput) => Promise<void>;
  onSubmitEdit?: (transactionId: string, payload: Omit<PortfolioTransactionUpsertInput, "symbol">) => Promise<void>;
  onDeleteTransaction?: (transactionId: string) => Promise<boolean>;
  onDeleteGoal?: (goalId: string) => Promise<boolean>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeDraft(initial?: Partial<PortfolioTransactionUpsertInput>): Draft {
  return {
    persistedId: undefined,
    symbol: initial?.symbol ?? "",
    type: ((initial?.type as "BUY" | "SELL") ?? "BUY"),
    date: initial?.date ?? todayIsoDate(),
    priceUsd: initial?.priceUsd ?? "",
    amountMode: "usd",
    amountCoins: initial?.amountCoins ?? "",
    amountUsd: initial?.amountUsd ?? "",
    assetInput: initial?.symbol ? `${initial.symbol}USDT` : "",
  };
}

export function AddTransactionModal({
  open,
  assets,
  submitting,
  errorText,
  mode = "create",
  initial,
  initialDrafts,
  initialActiveDraftIndex,
  initialGoals,
  onClose,
  onSubmit,
  onSubmitEdit,
  onDeleteTransaction,
  onDeleteGoal,
}: Props) {
  const lastInitSignatureRef = useRef<string | null>(null);
  const [createDrafts, setCreateDrafts] = useState<Draft[]>([makeDraft()]);
  const [editDrafts, setEditDrafts] = useState<Draft[]>([makeDraft(initial)]);
  const [createActiveDraftIndex, setCreateActiveDraftIndex] = useState(0);
  const [editActiveDraftIndex, setEditActiveDraftIndex] = useState(0);
  const [hoverDraftIndex, setHoverDraftIndex] = useState<number | null>(null);
  const draftsRef = useRef<Draft[]>(mode === "edit" ? editDrafts : createDrafts);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const assetAnchorRef = useRef<HTMLDivElement | null>(null);
  const [assetMenuRect, setAssetMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [goalRows, setGoalRows] = useState<GoalRow[]>([{ id: "goal-1", targetUsd: "", sellCoins: "" }]);
  const [goalPartOpenIndex, setGoalPartOpenIndex] = useState<number | null>(null);
  const [activeGoalIndex, setActiveGoalIndex] = useState(0);
  const [hoverGoalIndex, setHoverGoalIndex] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const goalsSectionRef = useRef<HTMLDivElement | null>(null);
  const [formSectionHeight, setFormSectionHeight] = useState(0);
  const [goalsSectionHeight, setGoalsSectionHeight] = useState(0);
  const drafts = mode === "edit" ? editDrafts : createDrafts;
  const activeDraftIndex = mode === "edit" ? editActiveDraftIndex : createActiveDraftIndex;
  const activeDraft = drafts[activeDraftIndex] ?? makeDraft();

  const filtered = useMemo(() => {
    const s = activeDraft.assetInput.trim().toLowerCase();
    if (!s) return assets;
    return assets.filter(
      (x) => x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s),
    );
  }, [activeDraft.assetInput, assets]);

  useEffect(() => {
    if (!open) {
      lastInitSignatureRef.current = null;
      return;
    }
    const initSignature = JSON.stringify({
      mode,
      initial,
      initialDrafts,
      initialActiveDraftIndex,
      initialGoals,
    });
    if (lastInitSignatureRef.current === initSignature) return;
    lastInitSignatureRef.current = initSignature;
    const preparedDrafts =
      Array.isArray(initialDrafts) && initialDrafts.length > 0
        ? initialDrafts.map((d) => makeDraft(d))
        : [makeDraft(initial)];
    if (Array.isArray(initialDrafts) && initialDrafts.length > 0) {
      preparedDrafts.forEach((d, i) => {
        d.persistedId = initialDrafts[i]?.id;
      });
    }
    const nextActive = Math.max(0, Math.min(initialActiveDraftIndex ?? 0, preparedDrafts.length - 1));
    if (mode === "edit") {
      setEditDrafts(preparedDrafts);
      setEditActiveDraftIndex(nextActive);
    } else {
      setCreateDrafts(preparedDrafts);
      setCreateActiveDraftIndex(nextActive);
    }
    setHoverDraftIndex(null);
    setAssetMenuOpen(false);
    setGoalRows(
      Array.isArray(initialGoals) && initialGoals.length > 0
        ? initialGoals.map((g, i) => ({
            id: `goal-${i + 1}`,
            persistedId: g.id,
            targetUsd: g.targetPriceUsd,
            sellCoins: g.sellCoins,
          }))
        : [{ id: "goal-1", targetUsd: "", sellCoins: "" }],
    );
    setGoalPartOpenIndex(null);
    setActiveGoalIndex(0);
    setHoverGoalIndex(null);
    setLocalError(null);
  }, [initial, initialActiveDraftIndex, initialDrafts, initialGoals, mode, open]);

  useEffect(() => {
    if (!open) return;
    if (!assetMenuOpen) {
      setAssetMenuRect(null);
      return;
    }
    const el = assetAnchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setAssetMenuRect({ left: r.left, top: r.bottom + 5, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [assetMenuOpen, open]);

  useEffect(() => {
    if (!open) return;
    const el = goalsSectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setGoalsSectionHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    setGoalsSectionHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = formSectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setFormSectionHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    setFormSectionHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const setActiveDraft = (updater: (current: Draft) => Draft) => {
    const updateDrafts = mode === "edit" ? setEditDrafts : setCreateDrafts;
    updateDrafts((prev) => prev.map((d, i) => (i === activeDraftIndex ? updater(d) : d)));
  };

  const onPriceChange = (v: string) => {
    setActiveDraft((current) => {
      const next: Draft = { ...current, priceUsd: v };
      const p = Number(v);
      if (!Number.isFinite(p) || p <= 0) return next;
      if (current.amountMode === "coins") {
        const c = Number(current.amountCoins);
        if (Number.isFinite(c) && c > 0) next.amountUsd = (c * p).toFixed(8);
        return next;
      }
      const u = Number(current.amountUsd);
      if (Number.isFinite(u) && u > 0) next.amountCoins = (u / p).toFixed(8);
      return next;
    });
  };

  const onAmountChange = (v: string) => {
    setActiveDraft((current) => {
      const next: Draft = { ...current };
      const price = Number(current.priceUsd);
      if (current.amountMode === "coins") {
        next.amountCoins = v;
        const c = Number(v);
        if (Number.isFinite(c) && c > 0 && Number.isFinite(price) && price > 0) {
          next.amountUsd = (c * price).toFixed(8);
        }
        return next;
      }
      next.amountUsd = v;
      const u = Number(v);
      if (Number.isFinite(u) && u > 0 && Number.isFinite(price) && price > 0) {
        next.amountCoins = (u / price).toFixed(8);
      }
      return next;
    });
  };

  const submit = async () => {
    setLocalError(null);
    const items = mode === "edit" ? [draftsRef.current[activeDraftIndex]!].filter(Boolean) : draftsRef.current;
    for (let i = 0; i < items.length; i += 1) {
      const d = items[i]!;
      const p = Number(d.priceUsd);
      if (!d.symbol) return setLocalError(`Транзакция ${i + 1}: выберите актив.`);
      if (!d.date) return setLocalError(`Транзакция ${i + 1}: укажите дату.`);
      if (!Number.isFinite(p) || p <= 0) return setLocalError(`Транзакция ${i + 1}: цена должна быть больше 0.`);
      if (!Number.isFinite(Number(d.amountCoins)) || Number(d.amountCoins) <= 0) {
        return setLocalError(`Транзакция ${i + 1}: количество монет должно быть больше 0.`);
      }
      if (!Number.isFinite(Number(d.amountUsd)) || Number(d.amountUsd) <= 0) {
        return setLocalError(`Транзакция ${i + 1}: сумма в USD должна быть больше 0.`);
      }
      if (mode === "edit") {
        if (!d.persistedId) return setLocalError(`Транзакция ${i + 1}: не найден ID для обновления.`);
        if (!onSubmitEdit) return setLocalError("Редактирование недоступно.");
        // eslint-disable-next-line no-await-in-loop
        await onSubmitEdit(d.persistedId, {
          type: d.type,
          date: d.date,
          priceUsd: d.priceUsd,
          amountCoins: d.amountCoins,
          amountUsd: d.amountUsd,
          goals: [],
        });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await onSubmit({
          symbol: d.symbol,
          type: d.type,
          date: d.date,
          priceUsd: d.priceUsd,
          amountCoins: d.amountCoins,
          amountUsd: d.amountUsd,
          goals:
            i === 0
              ? goalRows
                  .filter(
                    (g) =>
                      Number.isFinite(Number(g.targetUsd)) &&
                      Number(g.targetUsd) > 0 &&
                      Number.isFinite(Number(g.sellCoins)) &&
                      Number(g.sellCoins) > 0,
                  )
                  .map((g) => ({ targetPriceUsd: g.targetUsd, sellCoins: g.sellCoins }))
              : undefined,
        });
      }
    }
  };

  const selectedAsset = assets.find((a) => a.symbol === activeDraft.symbol) ?? null;
  const aggregate = drafts.reduce(
    (acc, d) => {
      const p = Number(d.priceUsd);
      const coinsRaw = Number(d.amountCoins);
      const usdRaw = Number(d.amountUsd);
      const coins =
        Number.isFinite(coinsRaw) && coinsRaw > 0
          ? coinsRaw
          : Number.isFinite(usdRaw) && Number.isFinite(p) && p > 0
            ? usdRaw / p
            : 0;
      const usd =
        Number.isFinite(usdRaw) && usdRaw > 0
          ? usdRaw
          : Number.isFinite(p) && Number.isFinite(coins) && coins > 0
            ? p * coins
            : 0;
      if (!(Number.isFinite(coins) && coins > 0 && Number.isFinite(usd) && usd > 0)) return acc;
      if (d.type === "SELL") {
        acc.totalCoins -= coins;
        acc.totalUsd -= usd;
      } else {
        acc.totalCoins += coins;
        acc.totalUsd += usd;
      }
      return acc;
    },
    { totalCoins: 0, totalUsd: 0 },
  );
  const totalCoinsAllTx = Math.max(0, aggregate.totalCoins);
  const avgBuyPriceAllTx = totalCoinsAllTx > 0 ? Math.max(0, aggregate.totalUsd) / totalCoinsAllTx : 0;
  const partValue = (part: GoalPart | null): number =>
    part === "all" ? 1 : part === "half" ? 0.5 : part === "third" ? 1 / 3 : part === "quarter" ? 1 / 4 : 0;
  const totalPlannedCoins = goalRows.reduce((acc, row) => {
    const v = Number(row.sellCoins);
    return acc + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const remainingCoinsTotal = Math.max(0, totalCoinsAllTx - totalPlannedCoins);
  const canAddMoreGoals = remainingCoinsTotal > 1e-8;
  const totalPotentialProfit = goalRows.reduce((acc, row) => {
    const rowTargetNum = Number(row.targetUsd);
    const rowSellCoinsRaw = Number(row.sellCoins);
    const rowSellCoins =
      Number.isFinite(rowSellCoinsRaw) && rowSellCoinsRaw > 0 ? Math.min(rowSellCoinsRaw, totalCoinsAllTx) : 0;
    const rowPotentialProfit =
      Number.isFinite(rowTargetNum) && Number.isFinite(avgBuyPriceAllTx)
        ? (rowTargetNum - avgBuyPriceAllTx) * rowSellCoins
        : 0;
    return acc + (Number.isFinite(rowPotentialProfit) ? rowPotentialProfit : 0);
  }, 0);

  const setGoalTarget = (idx: number, value: string) => {
    setGoalRows((prev) => prev.map((g, i) => (i === idx ? { ...g, targetUsd: value } : g)));
  };

  const setGoalSellCoins = (idx: number, value: string) => {
    setGoalRows((prev) => prev.map((g, i) => (i === idx ? { ...g, sellCoins: value } : g)));
  };

  const applyGoalPreset = (idx: number, part: GoalPart) => {
    const coins = totalCoinsAllTx * partValue(part);
    setGoalRows((prev) =>
      prev.map((g, i) =>
        i === idx
          ? {
              ...g,
              sellCoins: Number.isFinite(coins) && coins > 0 ? coins.toFixed(8).replace(/\.?0+$/, "") : "",
            }
          : g,
      ),
    );
  };

  const addGoalRow = () => {
    if (!canAddMoreGoals) return;
    setGoalRows((prev) => {
      const next = [...prev, { id: `goal-${prev.length + 1}`, targetUsd: "", sellCoins: "" }];
      setActiveGoalIndex(next.length - 1);
      return next;
    });
  };

  const deleteGoalRow = async (idx: number) => {
    const target = goalRows[idx];
    if (mode === "edit" && target?.persistedId && onDeleteGoal) {
      try {
        const deleted = await onDeleteGoal(target.persistedId);
        if (!deleted) return;
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Ошибка удаления цели");
        return;
      }
    }
    setGoalRows((prev) => {
      if (prev.length <= 1) {
        return [{ id: "goal-1", targetUsd: "", sellCoins: "" }];
      }
      const next = prev.filter((_, i) => i !== idx);
      setActiveGoalIndex((current) => {
        if (next.length <= 1) return 0;
        if (idx > current) return current;
        if (idx === current) return Math.max(0, current - 1);
        return Math.max(0, current - 1);
      });
      return next;
    });
    setGoalPartOpenIndex((prev) => {
      if (prev === null) return null;
      if (prev === idx) return null;
      if (prev > idx) return prev - 1;
      return prev;
    });
    setHoverGoalIndex(null);
  };

  const addDraft = () => {
    if (mode === "edit") return;
    const base = draftsRef.current[activeDraftIndex] ?? makeDraft();
    const next: Draft = {
      ...makeDraft(),
      // Keep selected asset across drafts.
      symbol: base.symbol,
      assetInput: base.assetInput,
    };
    setCreateDrafts((prev) => {
      const nextIndex = prev.length;
      setCreateActiveDraftIndex(nextIndex);
      return [...prev, next];
    });
  };

  const deleteDraft = (idx: number) => {
    if (mode === "edit") {
      const target = draftsRef.current[idx];
      if (!target?.persistedId || !onDeleteTransaction) return;
      void onDeleteTransaction(target.persistedId)
        .then((deleted) => {
          if (!deleted) return;
          setEditDrafts((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            if (next.length === 0) {
              onClose();
              return [makeDraft()];
            }
            setEditActiveDraftIndex((current) => {
              if (idx > current) return current;
              if (idx === current) return Math.max(0, current - 1);
              return Math.max(0, current - 1);
            });
            return next;
          });
        })
        .catch((e) => setLocalError(e instanceof Error ? e.message : "Ошибка удаления транзакции"));
      return;
    }
    setCreateDrafts((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      const safe = next.length === 0 ? [makeDraft()] : next;
      setCreateActiveDraftIndex((current) => {
        if (safe.length <= 1) return 0;
        if (idx > current) return current;
        if (idx === current) return Math.max(0, current - 1);
        return Math.max(0, current - 1);
      });
      return safe;
    });
    setHoverDraftIndex(null);
  };

  const goalMenu = useMemo(() => {
    const plusSize = 54;
    const gap = 10;
    const count = goalRows.length;
    const available = Math.max(0, goalsSectionHeight - plusSize - gap * Math.max(0, count)); // gaps between numbers + gap before plus
    const per = count > 0 ? Math.floor(available / count) : 54;
    const size = Math.max(28, Math.min(54, per));
    const fontSize = Math.max(14, Math.min(24, Math.floor(size * 0.45)));
    const radius = Math.max(10, Math.min(18, Math.floor(size / 3)));
    return { size, fontSize, radius, plusSize };
  }, [goalRows.length, goalsSectionHeight]);

  const txMenu = useMemo(() => {
    const plusSize = 54;
    const gap = 10;
    const count = drafts.length;
    const available = Math.max(0, formSectionHeight - plusSize - gap * Math.max(0, count));
    const per = count > 0 ? Math.floor(available / count) : 54;
    const size = Math.max(28, Math.min(54, per));
    const fontSize = Math.max(14, Math.min(24, Math.floor(size * 0.45)));
    const radius = Math.max(10, Math.min(18, Math.floor(size / 3)));
    return { size, fontSize, radius, plusSize };
  }, [drafts.length, formSectionHeight]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="asset-picker-overlay portfolio-transaction-overlay" role="presentation">
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="asset-picker-dialog portfolio-modal portfolio-transaction-modal" role="dialog" aria-modal="true">
        {assetMenuOpen && assetMenuRect
          ? createPortal(
              <div
                className="portfolio-asset-select-menu portfolio-asset-select-menu-portal"
                style={{ left: assetMenuRect.left, top: assetMenuRect.top, width: assetMenuRect.width }}
              >
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`portfolio-asset-option${a.symbol === activeDraft.symbol ? " active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setActiveDraft((d) => ({ ...d, symbol: a.symbol, assetInput: `${a.symbol}USDT` }));
                      setAssetMenuOpen(false);
                    }}
                  >
                    <img src={a.iconUrl} alt="" className="portfolio-inline-coin" />
                    <span>{a.symbol}USDT</span>
                  </button>
                ))}
                {filtered.length === 0 ? <div className="portfolio-asset-option-empty">Ничего не найдено</div> : null}
              </div>,
              document.body,
            )
          : null}
        <div className="portfolio-modal-body portfolio-transaction-body">
          <div className="portfolio-transaction-section">
            <div className="portfolio-transaction-header">
              <h2 className="portfolio-transaction-title">
                {mode === "edit" ? "Редактировать транзакцию" : "Добавить транзакцию"}
              </h2>
              <button type="button" onClick={onClose} className="portfolio-icon-circle-btn" aria-label="Закрыть">
                <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-ui-icon" />
              </button>
            </div>

            <label
              className={`portfolio-field portfolio-ghost-field${
                assetMenuOpen || activeDraft.assetInput || activeDraft.symbol ? " is-floated" : ""
              }`}
            >
              <span className="portfolio-ghost-label">Выберите актив</span>
              <div ref={assetAnchorRef} className="portfolio-asset-combobox">
                {selectedAsset ? <img src={selectedAsset.iconUrl} alt="" className="portfolio-inline-coin" /> : null}
                <input
                  value={activeDraft.assetInput}
                  onFocus={() => setAssetMenuOpen(true)}
                  onClick={() => setAssetMenuOpen(true)}
                  onChange={(e) => {
                    const next = e.target.value;
                    setActiveDraft((d) => ({
                      ...d,
                      assetInput: next,
                      symbol: d.symbol && next.toUpperCase() !== `${d.symbol}USDT` ? "" : d.symbol,
                    }));
                    if (!assetMenuOpen) setAssetMenuOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setAssetMenuOpen(false), 120);
                  }}
                  placeholder=" "
                  className="portfolio-input portfolio-input-ghost portfolio-asset-combobox-input"
                  disabled={mode === "edit"}
                />
                <img
                  src="/assets/portfolio-ui/arrow_down.svg"
                  alt=""
                  aria-hidden="true"
                  className="portfolio-asset-combobox-arrow"
                />
              </div>
            </label>
          </div>

          <div ref={formSectionRef} className="portfolio-transaction-section portfolio-transaction-section-form">
            <div className="portfolio-buy-sell-toggle">
              <button
                type="button"
                className={`portfolio-buy-sell-btn${activeDraft.type === "BUY" ? " active" : ""}`}
                onClick={() => setActiveDraft((d) => ({ ...d, type: "BUY" }))}
              >
                Покупка
              </button>
              <button
                type="button"
                className={`portfolio-buy-sell-btn${activeDraft.type === "SELL" ? " active" : ""}`}
                onClick={() => setActiveDraft((d) => ({ ...d, type: "SELL" }))}
              >
                Продажа
              </button>
            </div>

            <label className={`portfolio-field portfolio-ghost-field${activeDraft.date ? " is-floated" : ""}`}>
              <span className="portfolio-ghost-label">Дата</span>
              <input
                type="date"
                value={activeDraft.date}
                max={todayIsoDate()}
                onChange={(e) => setActiveDraft((d) => ({ ...d, date: e.target.value }))}
                className="portfolio-input portfolio-input-ghost"
                placeholder=" "
              />
            </label>

            <label className={`portfolio-field portfolio-ghost-field${activeDraft.priceUsd ? " is-floated" : ""}`}>
              <span className="portfolio-ghost-label">Цена покупки</span>
              <input
                value={activeDraft.priceUsd}
                onChange={(e) => onPriceChange(e.target.value)}
                className="portfolio-input portfolio-input-ghost"
                placeholder=" "
              />
            </label>

            <div className="portfolio-amount-line">
              <label
                className={`portfolio-field portfolio-ghost-field${
                  (activeDraft.amountMode === "usd" ? activeDraft.amountUsd : activeDraft.amountCoins)
                    ? " is-floated"
                    : ""
                }`}
              >
                <span className="portfolio-ghost-label">
                  Сумма покупки {activeDraft.amountMode === "usd" ? "(долларов)" : "(монет)"}
                </span>
                <input
                  value={activeDraft.amountMode === "usd" ? activeDraft.amountUsd : activeDraft.amountCoins}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="portfolio-input portfolio-input-ghost"
                  placeholder=" "
                />
              </label>
              <div className="portfolio-currency-switch">
                <button
                  type="button"
                  className={`portfolio-currency-btn${activeDraft.amountMode === "usd" ? " active" : ""}`}
                  onClick={() => setActiveDraft((d) => ({ ...d, amountMode: "usd" }))}
                >
                  $
                </button>
                <button
                  type="button"
                  className={`portfolio-currency-btn${activeDraft.amountMode === "coins" ? " active" : ""}`}
                  onClick={() => setActiveDraft((d) => ({ ...d, amountMode: "coins" }))}
                >
                  {selectedAsset ? (
                    <img src={selectedAsset.iconUrl} alt="" className="portfolio-currency-asset-icon" />
                  ) : (
                    <span className="portfolio-currency-empty-dot" />
                  )}
                </button>
              </div>
            </div>

            {mode !== "edit" || drafts.length > 1 ? (
              <div className="portfolio-tx-multi-menu" aria-label="Несколько транзакций">
                {drafts.map((_, idx) => {
                  const isActive = idx === activeDraftIndex;
                  const canDelete = isActive && hoverDraftIndex === idx && (mode === "edit" ? true : drafts.length > 1);
                  return (
                    <button
                      key={`draft-${idx + 1}`}
                      type="button"
                      className={`portfolio-tx-multi-btn${isActive ? " active" : ""}`}
                      style={{
                        height: `${txMenu.size}px`,
                        borderRadius: `${txMenu.radius}px`,
                        fontSize: `${txMenu.fontSize}px`,
                      }}
                      onMouseEnter={() => setHoverDraftIndex(idx)}
                      onMouseLeave={() => setHoverDraftIndex(null)}
                      onClick={() => {
                        if (canDelete) {
                          deleteDraft(idx);
                          return;
                        }
                        if (mode === "edit") {
                          setEditActiveDraftIndex(idx);
                        } else {
                          setCreateActiveDraftIndex(idx);
                        }
                      }}
                      aria-label={canDelete ? `Удалить транзакцию ${idx + 1}` : `Переключить на транзакцию ${idx + 1}`}
                    >
                      {canDelete ? (
                        <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-tx-multi-icon" />
                      ) : (
                        String(idx + 1)
                      )}
                    </button>
                  );
                })}
                {mode !== "edit" ? (
                  <button
                    type="button"
                    className="portfolio-tx-multi-btn portfolio-tx-multi-plus"
                    style={{ height: `${txMenu.plusSize}px` }}
                    onClick={addDraft}
                    aria-label="Добавить транзакцию"
                  >
                    <img src="/assets/portfolio-ui/plus.svg" alt="" className="portfolio-tx-multi-icon" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div ref={goalsSectionRef} className="portfolio-transaction-section portfolio-transaction-section-goals">
            <div className="portfolio-goal-rows">
              {goalRows
                .filter((_, idx) => idx === activeGoalIndex)
                .map((row) => {
                  const idx = activeGoalIndex;
              const usedWithoutCurrent = goalRows.reduce((acc, g, i) => {
                if (i === idx) return acc;
                const v = Number(g.sellCoins);
                return acc + (Number.isFinite(v) && v > 0 ? v : 0);
              }, 0);
              const remainingForRow = Math.max(0, totalCoinsAllTx - usedWithoutCurrent);
              const allowed = {
                all: totalCoinsAllTx * 1 <= remainingForRow + 1e-8,
                half: totalCoinsAllTx * 0.5 <= remainingForRow + 1e-8,
                third: totalCoinsAllTx * (1 / 3) <= remainingForRow + 1e-8,
                quarter: totalCoinsAllTx * 0.25 <= remainingForRow + 1e-8,
              };
              const rowTargetNum = Number(row.targetUsd);
              const rowSellCoinsRaw = Number(row.sellCoins);
              const rowSellCoins =
                Number.isFinite(rowSellCoinsRaw) && rowSellCoinsRaw > 0
                  ? Math.min(rowSellCoinsRaw, remainingForRow)
                  : 0;
              const rowPotentialProfit =
                Number.isFinite(rowTargetNum) && Number.isFinite(avgBuyPriceAllTx)
                  ? rowTargetNum * rowSellCoins - avgBuyPriceAllTx * rowSellCoins
                  : 0;
              const usedUntilRow = goalRows.slice(0, idx + 1).reduce((acc, g, i) => {
                const v = Number(i === idx ? rowSellCoins : g.sellCoins);
                return acc + (Number.isFinite(v) && v > 0 ? v : 0);
              }, 0);
              const rowRemainingCoins = Math.max(0, totalCoinsAllTx - usedUntilRow);
              return (
                <div key={row.id} className="portfolio-goal-row">
                  <label className={`portfolio-field portfolio-ghost-field${row.targetUsd ? " is-floated" : ""}`}>
                        <span className="portfolio-ghost-label">Цель {idx + 1}</span>
                    <input
                      value={row.targetUsd}
                      onChange={(e) => setGoalTarget(idx, e.target.value)}
                      className="portfolio-input portfolio-input-ghost"
                      placeholder=" "
                    />
                  </label>
                  <div className={`portfolio-goal-part-wrap portfolio-field portfolio-ghost-field${goalPartOpenIndex === idx || row.sellCoins ? " is-floated" : ""}`}>
                    <span className="portfolio-ghost-label">Объем</span>
                    <div className="portfolio-asset-combobox">
                      <input
                        className="portfolio-input portfolio-input-ghost portfolio-asset-combobox-input portfolio-goal-part-btn"
                        value={row.sellCoins}
                        onFocus={() => setGoalPartOpenIndex(idx)}
                        onClick={() => setGoalPartOpenIndex(idx)}
                        onChange={(e) => setGoalSellCoins(idx, e.target.value.replace(",", "."))}
                        onBlur={() => window.setTimeout(() => setGoalPartOpenIndex((prev) => (prev === idx ? null : prev)), 120)}
                        placeholder=" "
                      />
                      <img
                        src="/assets/portfolio-ui/arrow_down.svg"
                        alt=""
                        aria-hidden="true"
                        className="portfolio-asset-combobox-arrow"
                      />
                    </div>
                    {goalPartOpenIndex === idx ? (
                      <div className="portfolio-asset-select-menu portfolio-goal-part-menu">
                        <button
                          type="button"
                          disabled={!allowed.all}
                          className="portfolio-asset-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { if (allowed.all) applyGoalPreset(idx, "all"); setGoalPartOpenIndex(null); }}
                        >
                          <span>Все</span>
                          <span className="portfolio-goal-part-fraction">1/1</span>
                        </button>
                        <button
                          type="button"
                          disabled={!allowed.half}
                          className="portfolio-asset-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { if (allowed.half) applyGoalPreset(idx, "half"); setGoalPartOpenIndex(null); }}
                        >
                          <span>Половина</span>
                          <span className="portfolio-goal-part-fraction">1/2</span>
                        </button>
                        <button
                          type="button"
                          disabled={!allowed.third}
                          className="portfolio-asset-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { if (allowed.third) applyGoalPreset(idx, "third"); setGoalPartOpenIndex(null); }}
                        >
                          <span>Треть</span>
                          <span className="portfolio-goal-part-fraction">1/3</span>
                        </button>
                        <button
                          type="button"
                          disabled={!allowed.quarter}
                          className="portfolio-asset-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { if (allowed.quarter) applyGoalPreset(idx, "quarter"); setGoalPartOpenIndex(null); }}
                        >
                          <span>Четверть</span>
                          <span className="portfolio-goal-part-fraction">1/4</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className={`portfolio-goal-potential portfolio-goal-potential-profit ${rowPotentialProfit >= 0 ? "portfolio-asset-pnl-positive" : "portfolio-asset-pnl-negative"}`}>
                    Потенциальная прибыль: {rowPotentialProfit >= 0 ? "+" : "-"}${Math.abs(rowPotentialProfit).toFixed(0)}
                  </p>
                  <p className="portfolio-goal-potential portfolio-goal-potential-remaining portfolio-asset-pnl-positive">
                    Остаток: {rowRemainingCoins.toFixed(2)}
                  </p>
                </div>
              );
              })}
            </div>

            <div className="portfolio-goal-multi-menu" aria-label="Цели">
              {goalRows.map((_, idx) => {
                const isActive = idx === activeGoalIndex;
                const canDelete = isActive && hoverGoalIndex === idx && goalRows.length > 1;
                return (
                  <button
                    key={`goal-${idx + 1}`}
                    type="button"
                    className={`portfolio-tx-multi-btn${isActive ? " active" : ""}`}
                    style={{
                      height: `${goalMenu.size}px`,
                      borderRadius: `${goalMenu.radius}px`,
                      fontSize: `${goalMenu.fontSize}px`,
                    }}
                    onMouseEnter={() => setHoverGoalIndex(idx)}
                    onMouseLeave={() => setHoverGoalIndex(null)}
                    onClick={() => {
                      if (canDelete) {
                        void deleteGoalRow(idx);
                        return;
                      }
                      setActiveGoalIndex(idx);
                    }}
                    aria-label={canDelete ? `Удалить цель ${idx + 1}` : `Переключить на цель ${idx + 1}`}
                  >
                    {canDelete ? (
                      <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-tx-multi-icon" />
                    ) : (
                      String(idx + 1)
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className="portfolio-tx-multi-btn portfolio-tx-multi-plus"
                style={{ height: `${goalMenu.plusSize}px` }}
                onClick={addGoalRow}
                disabled={!canAddMoreGoals}
                aria-label="Добавить цель"
              >
                <img src="/assets/portfolio-ui/plus.svg" alt="" className="portfolio-tx-multi-icon" />
              </button>
            </div>
          </div>

          {(localError || errorText) && <p className="portfolio-error">{localError ?? errorText}</p>}

          <div className="portfolio-transaction-section portfolio-transaction-summary">
            <div className="portfolio-transaction-summary-text">
              <div className="portfolio-transaction-summary-remaining">Остаток: {remainingCoinsTotal.toFixed(3)}</div>
              <div
                className={`portfolio-transaction-summary-profit ${
                  totalPotentialProfit >= 0 ? "portfolio-pnl-positive" : "portfolio-pnl-negative"
                }`}
              >
                Общая чистая прибыль: {totalPotentialProfit >= 0 ? "+" : "-"}${Math.abs(totalPotentialProfit).toFixed(0)}
              </div>
            </div>
            <div className="portfolio-modal-actions">
              <button type="button" className="portfolio-button-primary" onClick={() => void submit()} disabled={submitting}>
                {submitting ? "Сохранение..." : mode === "edit" ? "Сохранить изменения" : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
