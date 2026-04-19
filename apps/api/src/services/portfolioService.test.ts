import test from "node:test";
import assert from "node:assert/strict";
import type { TransactionType } from "@prisma/client";
import {
  calcHoldingsFromTransactions,
  pickResampled,
  validateSellTimeline,
} from "./portfolioService.js";

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
