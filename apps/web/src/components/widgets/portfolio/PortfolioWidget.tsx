import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem, PortfolioTimeframe } from "@atlas-v1/shared";
import {
  createPortfolioGoal,
  createPortfolioTransaction,
  deletePortfolioGoal,
  deletePortfolioTransaction,
  fetchCryptocurrencies,
  fetchPortfolioAssetDetail,
  fetchPortfolioChart,
  fetchPortfolioSummary,
  updatePortfolioTransaction,
} from "../../../services/api";
import "../shared/asset-picker.css";
import "./portfolio-widget.css";
import { AddTransactionModal } from "./AddTransactionModal";
import { AssetDetailPopup } from "./AssetDetailPopup";
import { PortfolioChart } from "./PortfolioChart";

const POLL_MS = 5 * 60 * 1000;

type MenuAction = "settings" | "add" | "all-assets";

function asNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(s: string): string {
  return `$${Math.round(asNum(s)).toLocaleString("en-US")}`;
}

type Props = {
  onDeleteWidget?: () => void;
};

export function PortfolioWidget({ onDeleteWidget }: Props) {
  const [assetsRef, setAssetsRef] = useState<CryptocurrencyListItem[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchPortfolioSummary>> | null>(null);
  const [chart, setChart] = useState<Awaited<ReturnType<typeof fetchPortfolioChart>> | null>(null);
  const [timeframe, setTimeframe] = useState<PortfolioTimeframe>("d");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [allAssetsQuery, setAllAssetsQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchPortfolioAssetDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const requestConfirm = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmMessage(message);
    });

  const finishConfirm = (ok: boolean) => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmMessage(null);
    if (resolve) resolve(ok);
  };

  const loadData = async (tf: PortfolioTimeframe) => {
    const [nextSummary, nextChart] = await Promise.all([
      fetchPortfolioSummary(),
      fetchPortfolioChart(tf),
    ]);
    setSummary(nextSummary);
    setChart(nextChart);
  };

  useEffect(() => {
    void fetchCryptocurrencies().then(setAssetsRef).catch(() => setAssetsRef([]));
  }, []);

  useEffect(() => {
    void loadData(timeframe).catch(() => {
      setSummary({ totalValueUsd: "0.00", totalPnlUsd: "0.00", assets: [] });
      setChart({ timeframe, points: [] });
    });
  }, [timeframe]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData(timeframe).catch(() => null);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadData(timeframe).catch(() => null);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeframe]);

  const assets = summary?.assets ?? [];
  const visibleAssets = assets.slice(0, 4);
  const hiddenCount = Math.max(0, assets.length - visibleAssets.length);
  const totalPnl = asNum(summary?.totalPnlUsd ?? "0");
  const filteredAllAssets = useMemo(() => {
    const q = allAssetsQuery.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (asset) => asset.symbol.toLowerCase().includes(q) || asset.name.toLowerCase().includes(q),
    );
  }, [allAssetsQuery, assets]);

  const triggerMenu = (action: MenuAction) => {
    setMenuOpen(false);
    if (action === "all-assets") {
      setAllAssetsQuery("");
      setShowAllAssets(true);
    }
    if (action === "add") setShowAddModal(true);
  };

  const pnlClass = totalPnl >= 0 ? "portfolio-pnl-positive" : "portfolio-pnl-negative";

  const selectedTx = useMemo(
    () => detail?.transactions.find((tx) => tx.id === editTxId) ?? null,
    [detail, editTxId],
  );

  const openAssetDetail = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const next = await fetchPortfolioAssetDetail(symbol);
      setDetail(next);
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAll = async () => {
    await loadData(timeframe);
    if (selectedSymbol) {
      const next = await fetchPortfolioAssetDetail(selectedSymbol);
      setDetail(next);
    }
  };

  return (
    <>
      <div className="portfolio-widget-card drag-handle">
        <div
          className={`portfolio-menu-wrap${menuOpen ? " is-open" : ""}`}
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            className="portfolio-menu-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Меню портфеля"
            aria-expanded={menuOpen}
          >
            <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
          </button>
          <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
            <button
              type="button"
              className="portfolio-menu-circle-btn disabled"
              disabled
              aria-label="Настройки (скоро)"
            >
              <img src="/assets/portfolio-ui/settings.svg" alt="" className="portfolio-menu-circle-icon" />
            </button>
            <button
              type="button"
              className="portfolio-menu-circle-btn"
              onClick={() => triggerMenu("all-assets")}
              aria-label="Открыть список всех монет"
            >
              <img
                src="/assets/portfolio-ui/arrow_line_top.svg"
                alt=""
                className="portfolio-menu-circle-icon portfolio-menu-circle-icon-arrow"
              />
            </button>
            <button
              type="button"
              className="portfolio-menu-circle-btn"
              onClick={() => triggerMenu("add")}
              aria-label="Добавить транзакцию"
            >
              <img src="/assets/portfolio-ui/plus.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-add" />
            </button>
            <button
              type="button"
              className="portfolio-menu-circle-btn"
              onClick={() => onDeleteWidget?.()}
              aria-label="Удалить виджет"
            >
              <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close" />
            </button>
          </div>
        </div>

        <div className="portfolio-widget-left">
          <div className="portfolio-total">{money(summary?.totalValueUsd ?? "0")}</div>
          <div className={`portfolio-total-pnl ${pnlClass}`}>
            {totalPnl >= 0 ? "+" : "-"}
            {money(Math.abs(totalPnl).toString())}
          </div>
          <PortfolioChart
            points={chart?.points ?? []}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
          />
        </div>

        <div className="portfolio-widget-right">
          <ul className="portfolio-asset-list">
            {visibleAssets.map((asset) => {
              const pnl = asNum(asset.pnlUsd);
              const positive = pnl >= 0;
              return (
                <li
                  key={asset.symbol}
                  className="portfolio-asset-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => void openAssetDetail(asset.symbol)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") void openAssetDetail(asset.symbol);
                  }}
                >
                  <img src={asset.iconUrl} alt="" className="portfolio-asset-icon" />
                  <div className="portfolio-asset-symbol">{asset.symbol}</div>
                  <div className="portfolio-asset-values">
                    <div className={positive ? "portfolio-asset-value-positive" : "portfolio-asset-value-negative"}>
                      {money(asset.currentValueUsd)}
                    </div>
                    <div className={positive ? "portfolio-asset-pnl-positive" : "portfolio-asset-pnl-negative"}>
                      {positive ? "+" : "-"}
                      {money(Math.abs(pnl).toString())}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {visibleAssets.length === 0 ? <p>Активов пока нет. Добавьте первую транзакцию.</p> : null}

          {hiddenCount > 0 ? (
            <button type="button" className="portfolio-more-button" onClick={() => setShowAllAssets(true)}>
              еще {hiddenCount} актива →
            </button>
          ) : null}
        </div>
      </div>

      <AddTransactionModal
        open={showAddModal || Boolean(editTxId)}
        mode={editTxId ? "edit" : "create"}
        initialDrafts={
          editTxId && detail
            ? detail.transactions.map((tx) => ({
                id: tx.id,
                symbol: detail.symbol,
                type: tx.type,
                date: tx.date,
                priceUsd: tx.priceUsd,
                amountCoins: tx.amountCoins,
                amountUsd: tx.amountUsd,
              }))
            : undefined
        }
        initialActiveDraftIndex={
          editTxId && detail
            ? Math.max(
                0,
                detail.transactions.findIndex((tx) => tx.id === editTxId),
              )
            : 0
        }
        initialGoals={
          detail?.goals?.map((g) => ({
            id: g.id,
            targetPriceUsd: g.targetPriceUsd,
            sellCoins: g.sellCoins,
          })) ?? undefined
        }
        initial={
          editTxId && selectedTx && selectedSymbol
            ? {
                symbol: selectedSymbol,
                type: selectedTx.type,
                date: selectedTx.date,
                priceUsd: selectedTx.priceUsd,
                amountCoins: selectedTx.amountCoins,
                amountUsd: selectedTx.amountUsd,
              }
            : undefined
        }
        assets={assetsRef}
        submitting={submitting}
        errorText={addError}
        onClose={() => {
          setShowAddModal(false);
          setEditTxId(null);
          setAddError(null);
        }}
        onSubmit={async (payload) => {
          setSubmitting(true);
          setAddError(null);
          try {
            await createPortfolioTransaction(payload);
            await refreshAll();
            setShowAddModal(false);
          } catch (e) {
            setAddError(e instanceof Error ? e.message : "Ошибка сохранения транзакции");
          } finally {
            setSubmitting(false);
          }
        }}
        onSubmitEdit={async (transactionId, payload) => {
          setSubmitting(true);
          setAddError(null);
          try {
            await updatePortfolioTransaction(transactionId, payload);
            await refreshAll();
            setEditTxId(null);
            setShowAddModal(false);
          } catch (e) {
            setAddError(e instanceof Error ? e.message : "Ошибка сохранения транзакции");
          } finally {
            setSubmitting(false);
          }
        }}
        onDeleteTransaction={async (transactionId) => {
          const ok = await requestConfirm("Вы уверены, что хотите удалить эту транзакцию? Действие нельзя отменить.");
          if (!ok) return false;
          setSubmitting(true);
          setAddError(null);
          try {
            await deletePortfolioTransaction(transactionId);
            await refreshAll();
            if (detail && detail.transactions.length <= 1) {
              setEditTxId(null);
              setShowAddModal(false);
            }
            return true;
          } catch (e) {
            setAddError(e instanceof Error ? e.message : "Ошибка удаления транзакции");
            return false;
          } finally {
            setSubmitting(false);
          }
        }}
        onDeleteGoal={async (goalId) => {
          const ok = await requestConfirm("Вы уверены, что хотите удалить эту цель?");
          if (!ok) return false;
          setSubmitting(true);
          setAddError(null);
          try {
            await deletePortfolioGoal(goalId);
            await refreshAll();
            return true;
          } catch (e) {
            setAddError(e instanceof Error ? e.message : "Ошибка удаления цели");
            return false;
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <AssetDetailPopup
        open={Boolean(selectedSymbol)}
        detail={detail}
        loading={detailLoading}
        errorText={detailError}
        onClose={() => {
          setSelectedSymbol(null);
          setDetail(null);
          setDetailError(null);
          setEditTxId(null);
        }}
        onEditTransaction={(txId) => {
          setEditTxId(txId);
          setShowAddModal(true);
        }}
        onDeleteAsset={async (symbol) => {
          const ok = await requestConfirm(`Вы уверены, что хотите удалить актив ${symbol} и все его транзакции?`);
          if (!ok) return false;
          const list = detail?.transactions ?? [];
          for (const tx of list) {
            // sequential delete keeps backend state consistent
            // eslint-disable-next-line no-await-in-loop
            await deletePortfolioTransaction(tx.id);
          }
          await refreshAll();
          return true;
        }}
        onDeleteTransaction={async (id) => {
          const ok = await requestConfirm("Вы уверены, что хотите удалить эту транзакцию? Действие нельзя отменить.");
          if (!ok) return;
          await deletePortfolioTransaction(id);
          await refreshAll();
        }}
        onAddGoal={async (targetPriceUsd) => {
          if (!selectedSymbol) return;
          await createPortfolioGoal(selectedSymbol, targetPriceUsd);
          await refreshAll();
        }}
        onDeleteGoal={async (goalId) => {
          const ok = await requestConfirm("Вы уверены, что хотите удалить эту цель?");
          if (!ok) return;
          await deletePortfolioGoal(goalId);
          await refreshAll();
        }}
      />

      {confirmMessage
        ? createPortal(
            <div className="asset-picker-overlay portfolio-confirm-overlay" role="presentation">
              <button
                type="button"
                className="asset-picker-backdrop"
                aria-label="Закрыть подтверждение"
                onClick={() => finishConfirm(false)}
              />
              <div className="asset-picker-dialog portfolio-confirm-dialog" role="dialog" aria-modal="true">
                <div className="portfolio-confirm-text">{confirmMessage}</div>
                <div className="portfolio-confirm-actions">
                  <button type="button" className="portfolio-button-muted" onClick={() => finishConfirm(false)}>
                    Отмена
                  </button>
                  <button type="button" className="portfolio-button-primary" onClick={() => finishConfirm(true)}>
                    Удалить
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {showAllAssets && typeof document !== "undefined"
        ? createPortal(
            <div className="asset-picker-overlay portfolio-all-assets-overlay" role="presentation">
              <button
                type="button"
                className="asset-picker-backdrop"
                onClick={() => {
                  setShowAllAssets(false);
                  setAllAssetsQuery("");
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="portfolio-all-assets-title"
                className="asset-picker-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="asset-picker-header">
                  <label className="asset-picker-search-label">
                    <span className="asset-picker-sr-only" id="portfolio-all-assets-title">
                      Поиск по портфельным активам
                    </span>
                    <input
                      type="search"
                      className="asset-picker-search-input"
                      value={allAssetsQuery}
                      onChange={(e) => setAllAssetsQuery(e.target.value)}
                      placeholder="Поиск по имени или тикеру…"
                      autoFocus
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllAssets(false);
                      setAllAssetsQuery("");
                    }}
                    className="asset-picker-close-button"
                    aria-label="Закрыть"
                  >
                    <img src="/assets/portfolio-ui/close.svg" alt="" className="asset-picker-close-icon" />
                  </button>
                </div>
                <ul className="asset-picker-list">
                  {filteredAllAssets.length === 0 ? (
                    <li className="asset-picker-message">
                      Ничего не найдено. Попробуйте другой тикер или название.
                    </li>
                  ) : (
                    filteredAllAssets.map((asset) => (
                      <li key={asset.symbol}>
                        <button
                          type="button"
                          className="asset-picker-item-button"
                          onClick={() => {
                            void openAssetDetail(asset.symbol);
                          }}
                        >
                          <img src={asset.iconUrl} alt="" className="asset-picker-item-icon" />
                          <div className="asset-picker-item-text">
                            <p className="asset-picker-item-symbol">{asset.symbol}</p>
                            <p className="asset-picker-item-name">{asset.name}</p>
                          </div>
                          <div className="portfolio-all-assets-item-right">
                            <p className="portfolio-all-assets-item-value">{money(asset.currentValueUsd)}</p>
                            <p
                              className={
                                asNum(asset.pnlUsd) >= 0
                                  ? "portfolio-all-assets-item-pnl portfolio-asset-pnl-positive"
                                  : "portfolio-all-assets-item-pnl portfolio-asset-pnl-negative"
                              }
                            >
                              {asNum(asset.pnlUsd) >= 0 ? "+" : "-"}
                              {money(Math.abs(asNum(asset.pnlUsd)).toString())}
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
          )
        : null}
    </>
  );
}
