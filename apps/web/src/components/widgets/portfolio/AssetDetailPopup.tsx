import { useMemo } from "react";
import { createPortal } from "react-dom";
import type { PortfolioAssetDetailResponse } from "@atlas-v1/shared";

type Props = {
  open: boolean;
  detail: PortfolioAssetDetailResponse | null;
  loading: boolean;
  errorText?: string | null;
  onClose: () => void;
  onDeleteTransaction: (id: string) => Promise<void>;
  onDeleteAsset: (symbol: string) => Promise<boolean>;
  onEditTransaction: (txId: string) => void;
  onAddGoal: (targetPriceUsd: string) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
};

function asNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(s: string): string {
  return `$${Math.round(asNum(s)).toLocaleString("en-US")}`;
}

function money2(s: string): string {
  return `$${asNum(s).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  })}`;
}

function moneyCompact2(s: string): string {
  return `$${asNum(s).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function numberCompact2(s: string): string {
  return asNum(s).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function AssetDetailPopup({
  open,
  detail,
  loading,
  errorText,
  onClose,
  onDeleteAsset,
  onEditTransaction,
}: Props) {
  const sortedTx = useMemo(() => detail?.transactions ?? [], [detail]);

  if (!open || typeof document === "undefined") return null;

  const editLatestTransaction = () => {
    const latest = sortedTx[0];
    if (!latest) return;
    onEditTransaction(latest.id);
  };

  const deleteAssetTransactions = async () => {
    if (!detail || sortedTx.length === 0) return;
    const deleted = await onDeleteAsset(detail.symbol);
    if (deleted) onClose();
  };

  return createPortal(
    <div className="asset-picker-overlay portfolio-detail-overlay" role="presentation">
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="asset-picker-dialog portfolio-modal portfolio-detail-modal" role="dialog" aria-modal="true">
        <div className="portfolio-transaction-header portfolio-detail-header">
          <h2 className="portfolio-transaction-title">Детали транзакции</h2>
          <div className="portfolio-detail-head-actions">
            <button
              type="button"
              className="portfolio-icon-soft-btn"
              aria-label="Редактировать последнюю транзакцию"
              onClick={editLatestTransaction}
              disabled={sortedTx.length === 0}
            >
              <img src="/assets/portfolio-ui/edit.svg" alt="" className="portfolio-ui-icon" />
            </button>
            <button
              type="button"
              className="portfolio-icon-soft-btn"
              aria-label="Удалить актив"
              onClick={() => void deleteAssetTransactions()}
              disabled={sortedTx.length === 0}
            >
              <img src="/assets/portfolio-ui/trash.svg" alt="" className="portfolio-ui-icon" />
            </button>
            <button type="button" onClick={onClose} className="portfolio-icon-circle-btn" aria-label="Закрыть">
              <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-ui-icon" />
            </button>
          </div>
        </div>
        <div className="portfolio-modal-body portfolio-detail-body">
          {loading ? <p>Загрузка...</p> : null}
          {!loading && errorText ? <p className="portfolio-error">{errorText}</p> : null}
          {!loading && detail ? (
            <>
              <div className="portfolio-detail-summary">
                <div className="portfolio-detail-summary-row">
                  <span>Средняя цена покупки</span>
                  <strong>{money2(detail.averageBuyPriceUsd)}</strong>
                </div>
                <div className="portfolio-detail-summary-row">
                  <span>Кол-во монет</span>
                  <strong>
                    {asNum(detail.coinsHeld).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 5,
                    })}
                  </strong>
                </div>
              </div>

              <ul className="portfolio-detail-list portfolio-detail-list-transactions">
                {sortedTx.map((tx) => (
                  <li key={tx.id} className="portfolio-detail-item">
                    <div className="portfolio-detail-item-left portfolio-detail-tx-left">
                      <div
                        className={`portfolio-detail-tx-type ${tx.type === "BUY" ? "portfolio-pnl-positive" : "portfolio-pnl-negative"}`}
                      >
                        {tx.type === "BUY" ? "Покупка" : "Продажа"}
                      </div>
                      <div className="portfolio-detail-sub portfolio-detail-tx-price">{money2(tx.priceUsd)}</div>
                      <div className="portfolio-detail-sub portfolio-detail-tx-date">{tx.date}</div>
                    </div>
                    <div className="portfolio-detail-item-right">
                      <div className="portfolio-detail-tx-values">
                        {numberCompact2(tx.amountCoins)} / {moneyCompact2(tx.amountUsd)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {sortedTx.length === 0 ? <p>Транзакций по этому активу пока нет.</p> : null}

              <ul className="portfolio-detail-list portfolio-detail-list-goals">
                {detail.goals.map((g, index) => (
                  <li key={g.id} className="portfolio-detail-item portfolio-goal-row">
                    <div className="portfolio-detail-item-left portfolio-detail-goal-left">
                      <div className="portfolio-detail-goal-title portfolio-detail-goal-label">Цель {index + 1}</div>
                      <div className="portfolio-detail-sub portfolio-detail-goal-price">{money2(g.targetPriceUsd)}</div>
                      <div className="portfolio-detail-sub portfolio-detail-goal-volume">
                        Объем: {asNum(g.sellCoins).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 5 })}
                      </div>
                    </div>
                    <p className="portfolio-goal-potential portfolio-goal-split-line">
                      <span className="portfolio-goal-sell-coins">
                        -{asNum(g.sellCoins).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 5 })}
                      </span>
                      <span className="portfolio-goal-split-divider">/</span>
                      <span className="portfolio-goal-clean-profit">
                        {asNum(g.potentialProfitUsd) >= 0 ? "+" : "-"}
                        {money(Math.abs(asNum(g.potentialProfitUsd)).toString())}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
              {detail.goals.length === 0 ? <p>Целей пока нет. Добавьте первую цель по цене.</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
