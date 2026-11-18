import assert from "node:assert/strict";
import test from "node:test";
import { checkExtraction, numberAppears, resolveMention } from "./validate.ts";

const signal = "Беру солану лонг. Вход 145-148, стоп 138, цели 160 и 175.";

test("уровни из текста сохраняются, выдуманный уровень обнуляется", () => {
  const checked = checkExtraction(signal, {
    msg_type: "signal",
    coins: [{ raw_mention: "солану", direction: "long", stance: 0.8, confidence: 0.9, evidence: "Беру солану лонг" }],
    direction: "long",
    stance: 0.8,
    confidence: 0.9,
    entry_low: 145,
    entry_high: 148,
    stop: 138,
    targets: [160, 175, 999],
    horizon: "weeks",
    leverage_mentioned: null,
    market_view: null,
    refers_to_previous: false,
    update_hint: null,
    update_type: null,
    is_ad: false,
    ad_markers: [],
    evidence: "Вход 145-148, стоп 138, цели 160 и 175",
  });
  assert.equal(checked.schemaValid, true);
  assert.equal(checked.evidenceValid, true);
  assert.deepEqual(checked.parsed?.targets, [160, 175]);
  assert.equal(checked.rejectedLevels.includes("targets"), true);
});

test("пересказ вместо цитаты не проходит проверку evidence", () => {
  const checked = checkExtraction(signal, {
    msg_type: "signal",
    coins: [],
    confidence: 0.5,
    evidence: "автор рекомендует покупать солану",
  });
  assert.equal(checked.schemaValid, true);
  assert.equal(checked.evidenceValid, false);
});

test("erid помечает сообщение рекламой даже если модель этого не сказала", () => {
  const text = "Заходите в канал, erid: Abc123";
  const checked = checkExtraction(text, {
    msg_type: "noise",
    coins: [],
    confidence: 0.4,
    evidence: "erid: Abc123",
    is_ad: false,
    ad_markers: [],
  });
  assert.equal(checked.parsed?.is_ad, true);
  assert.equal(checked.parsed?.ad_markers.includes("erid"), true);
});

test("число внутри другого числа не считается уровнем", () => {
  assert.equal(numberAppears("цель 165000", 65000), false);
  assert.equal(numberAppears("стоп 65 000", 65000), true);
});

test("неизвестное и неоднозначное упоминание не привязываются наугад", () => {
  const aliases = [
    { alias: "солана", coinId: "sol", symbol: "SOL" },
    { alias: "луна", coinId: "luna", symbol: "LUNA" },
    { alias: "луна", coinId: "lunc", symbol: "LUNC" },
  ];
  assert.equal(resolveMention("$Солана", aliases).status, "resolved");
  assert.equal(resolveMention("луна", aliases).status, "ambiguous");
  assert.equal(resolveMention("пепе", aliases).status, "unknown");
});

test("невалидный JSON схемы не становится разбором", () => {
  const checked = checkExtraction("текст", { msg_type: "signal" });
  assert.equal(checked.schemaValid, false);
  assert.equal(checked.parsed, null);
});
