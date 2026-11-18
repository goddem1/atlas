import assert from "node:assert/strict";
import test from "node:test";
import { activationDecision, diffMetrics, evalSkipReason, scoreGold } from "./eval.ts";

test("пустой золотой набор не вызывает модель и не даёт включить версию", () => {
  assert.equal(evalSkipReason(0)?.includes("не вызывается"), true);
  assert.equal(evalSkipReason(3), null);
  assert.equal(activationDecision({ labeled: 0, evalRan: true }).ok, false);
  assert.equal(activationDecision({ labeled: 4, evalRan: false }).ok, false);
  assert.equal(activationDecision({ labeled: 4, evalRan: true }).ok, true);
});

test("precision на двух сигналах считается, но при малом n остаётся insufficient_data", () => {
  const scores = scoreGold([
    { msgType: "signal", fieldErrors: [], missedSignal: false },
    { msgType: "signal", fieldErrors: ["msgType"], missedSignal: false },
  ], 100);
  const precision = scores.find((score) => score.key === "signal_precision");
  assert.equal(precision?.value, 0.5);
  assert.equal(precision?.n, 2);
  assert.equal(precision?.status, "insufficient_data");
});

test("сравнение версий показывает разницу и не теряет ключ только одной стороны", () => {
  const diff = diffMetrics(
    [{ key: "signal_precision", value: 0.5, n: 2, status: "insufficient_data" }],
    [{ key: "signal_precision", value: 0.8, n: 4, status: "insufficient_data" }, { key: "signal_recall", value: 1, n: 1, status: "insufficient_data" }],
  );
  const delta = diff.find((row) => row.key === "signal_precision")?.delta ?? 0;
  assert.ok(Math.abs(delta - 0.3) < 1e-9);
  assert.equal(diff.find((row) => row.key === "signal_recall")?.base, null);
});
