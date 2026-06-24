import test from "node:test";
import assert from "node:assert/strict";
import { pickBondsRapidApiKeySlot } from "./rapidApiBondsQuota.js";

test("pickBondsRapidApiKeySlot uses primary while under limit", () => {
  assert.equal(pickBondsRapidApiKeySlot(119, 0, false, 120), "primary");
});

test("pickBondsRapidApiKeySlot switches to secondary when primary exhausted", () => {
  assert.equal(pickBondsRapidApiKeySlot(120, 0, true, 120), "secondary");
  assert.equal(pickBondsRapidApiKeySlot(150, 10, true, 150), "secondary");
});

test("pickBondsRapidApiKeySlot throws when all keys exhausted", () => {
  assert.throws(
    () => pickBondsRapidApiKeySlot(120, 120, true, 120),
    /monthly limit \(120\) exceeded/,
  );
  assert.throws(
    () => pickBondsRapidApiKeySlot(120, 0, false, 120),
    /monthly limit \(120\) exceeded/,
  );
});
