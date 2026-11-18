import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapMean, wilsonInterval } from "./metrics.ts";

test("интервал Уилсона лежит вокруг доли и схлопывается на краях", () => {
  const interval = wilsonInterval(80, 100);
  assert.ok(interval);
  assert.ok(interval.low < 0.8 && interval.low > 0.7);
  assert.ok(interval.high > 0.8 && interval.high < 0.9);
  assert.equal(wilsonInterval(0, 0), null);
});

test("bootstrap среднего воспроизводим на одних и тех же числах", () => {
  const first = bootstrapMean([1, 2, 3, 4]);
  const second = bootstrapMean([1, 2, 3, 4]);
  assert.deepEqual(first, second);
  assert.ok(first);
  assert.ok(first.low <= 2.5 && first.high >= 2.5);
});
