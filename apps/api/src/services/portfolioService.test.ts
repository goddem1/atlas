import test from "node:test";
import assert from "node:assert/strict";
import type { TransactionType } from "@prisma/client";
import { sumPortfolioPnlUsd } from "@atlas-v1/shared";
import {
  calcAssetPnlState,
  calcAssetPnlUsd,
  calcHoldingsFromTransactions,
  pickResampled,
  validateSellTimeline,
} from "./portfolioService.js";

test("sumPortfolioPnlUsd adds pnlUsd of all portfolio assets", () => {
  const total = sumPortfolioPnlUsd([
    { pnlUsd: "-177.40" },
    { pnlUsd: "232.10" },
    { pnlUsd: "-132.00" },
    { pnlUsd: "-61.25" },
    { pnlUsd: "-20.00" },
    { pnlUsd: "-15.00" },
  ]);
  assert.equal(total, -173.55);
});

test("validateSellTimeline allows valid BUY/SELL sequence", () => {
  const txs: Array<{ type: TransactionType; amountCoins: number; date: Date }> = [
    { type: "BUY", amountCoins: 2, date: new Date("2024-01-01") },
    { type: "SELL", amountCoins: 1.5, date: new Date("2024-01-02") },
    { type: "BUY", amountCoins: 0.5, date: new Date("2024-01-03") },
    { type: "SELL", amountCoins: 1, date: new Date("2024-01-04") },
  ];
  assert.doesNotThrow(() => validateSellTimeline(txs));
});

test("validateSellTimeline throws when SELL exceeds holdings", () => {
  const txs: Array<{ type: TransactionType; amountCoins: number; date: Date }> = [
    { type: "BUY", amountCoins: 1, date: new Date("2024-01-01") },
    { type: "SELL", amountCoins: 1.2, date: new Date("2024-01-02") },
  ];
  assert.throws(() => validateSellTimeline(txs), /SELL amount exceeds/);
});

test("calcHoldingsFromTransactions sorts by date before summing", () => {
  const txs: Array<{ type: TransactionType; amountCoins: number; date: Date }> = [
    { type: "SELL", amountCoins: 1, date: new Date("2024-01-02") },
    { type: "BUY", amountCoins: 2, date: new Date("2024-01-01") },
  ];
  assert.equal(calcHoldingsFromTransactions(txs), 1);
});

test("pickResampled keeps tail point and respects timeframe limits", () => {
  const points = Array.from({ length: 400 }, (_, i) => ({
    date: `2024-01-${String((i % 30) + 1).padStart(2, "0")}-${i}`,
    valueUsd: String(i),
  }));
  const m = pickResampled(points, "m");
  assert.ok(m.length <= 91);
  assert.equal(m[m.length - 1]?.date, points[points.length - 1]?.date);
});

test("calcAssetPnlState uses average cost on partial sell", () => {
  const state = calcAssetPnlState([
    { type: "BUY", amountCoins: 10, amountUsd: 100, date: new Date("2024-01-01") },
    { type: "SELL", amountCoins: 5, amountUsd: 75, date: new Date("2024-01-02") },
  ]);
  assert.equal(state.coinsHeld, 5);
  assert.equal(state.costBasisUsd, 50);
  assert.equal(state.realizedPnlUsd, 25);
  assert.equal(calcAssetPnlUsd(state, 100), 75);
});

test("calcAssetPnlUsd keeps realized P/L after full exit", () => {
  const state = calcAssetPnlState([
    { type: "BUY", amountCoins: 2, amountUsd: 200, date: new Date("2024-01-01") },
    { type: "SELL", amountCoins: 2, amountUsd: 150, date: new Date("2024-01-02") },
  ]);
  assert.equal(state.coinsHeld, 0);
  assert.equal(calcAssetPnlUsd(state, 0), -50);
});
