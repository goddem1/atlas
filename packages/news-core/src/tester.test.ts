import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TESTER, evaluateCall, parseKlines, type Candle, type EvalInput } from "./tester.ts";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function input(overrides: Partial<EvalInput>): EvalInput {
  return {
    postedAt: 0,
    now: 10 * DAY,
    direction: "long",
    horizon: "days",
    entryLow: null,
    entryHigh: null,
    stop: null,
    targets: [],
    entryCandles: [],
    holdCandles: [],
    btcCandles: [],
    params: DEFAULT_TESTER,
    ...overrides,
  };
}

function candle(openTime: number, open: number, high: number, low: number, close: number): Candle {
  return { openTime, open, high, low, close };
}

test("стоп и цель в одной свече: сначала стоп", () => {
  const bar = candle(15 * MIN, 100, 110, 90, 105);
  const result = evaluateCall(input({ stop: 90, targets: [110], entryCandles: [bar], holdCandles: [bar] }));
  assert.equal(result.exitReason, "stop");
  assert.equal(result.exitPrice, 90);
  assert.ok(result.returnPct != null && result.returnPct < -10);
});

test("шорт в той же свече тоже закрывается по стопу", () => {
  const bar = candle(15 * MIN, 100, 110, 90, 95);
  const result = evaluateCall(input({ direction: "short", stop: 110, targets: [90], entryCandles: [bar], holdCandles: [bar] }));
  assert.equal(result.exitReason, "stop");
  assert.equal(result.exitPrice, 110);
});

test("зона не задета — not_triggered, это не поражение", () => {
  const bar = candle(15 * MIN, 100, 101, 99, 100);
  const result = evaluateCall(input({ entryLow: 90, entryHigh: 95, stop: 80, targets: [110], entryCandles: [bar], holdCandles: [bar], now: 10 * DAY }));
  assert.equal(result.status, "not_triggered");
  assert.equal(result.returnPct, null);
});

test("после входа в зону цель закрывает сделку", () => {
  const first = candle(15 * MIN, 100, 100, 96, 97);
  const second = candle(30 * MIN, 97, 120, 96, 110);
  const result = evaluateCall(input({
    entryLow: 96,
    entryHigh: 98,
    stop: 90,
    targets: [110],
    entryCandles: [first, second],
    holdCandles: [first, second],
  }));
  assert.equal(result.entryPrice, 98);
  assert.equal(result.exitReason, "target");
  assert.equal(result.exitPrice, 110);
});

test("без касания стопа и цели выход по истечении срока", () => {
  const bar = candle(15 * MIN, 100, 101, 99, 102);
  const result = evaluateCall(input({ stop: 50, targets: [200], entryCandles: [bar], holdCandles: [bar], now: 8 * DAY }));
  assert.equal(result.exitReason, "expired");
  assert.equal(result.exitPrice, 102);
});

test("комиссия уменьшает результат", () => {
  const bar = candle(15 * MIN, 100, 101, 99, 110);
  const withFee = evaluateCall(input({ stop: 50, targets: [200], entryCandles: [bar], holdCandles: [bar], now: 8 * DAY }));
  const noFee = evaluateCall(input({
    stop: 50,
    targets: [200],
    entryCandles: [bar],
    holdCandles: [bar],
    now: 8 * DAY,
    params: { ...DEFAULT_TESTER, feePctPerSide: 0, slippagePct: 0 },
  }));
  assert.ok(withFee.returnPct != null && noFee.returnPct != null);
  assert.ok(withFee.returnPct < noFee.returnPct);
});

test("свеча Binance читается из массива", () => {
  const candles = parseKlines([[1_700_000_000_000, "100", "110", "90", "105", "12"], ["нет"]]);
  assert.equal(candles.length, 1);
  assert.equal(candles[0]?.close, 105);
});

test("свеча до публикации не считается", () => {
  const past = candle(-60 * MIN, 100, 500, 100, 500);
  const future = candle(15 * MIN, 100, 101, 99, 100);
  const result = evaluateCall(input({ stop: 50, targets: [200], entryCandles: [past, future], holdCandles: [past, future], now: 8 * DAY }));
  assert.notEqual(result.exitReason, "target");
  assert.equal(result.exitPrice, 100);
});
