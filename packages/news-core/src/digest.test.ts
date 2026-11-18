import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest, toPanorama, type DigestInput } from "./digest.ts";

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    day: "2026-11-16",
    messages: 4,
    calls: [{ symbol: "BTC", direction: "long", username: "Secret_Channel" }],
    coins: [
      { symbol: "ETH", scores: [0.6, 0.8] },
      { symbol: "SOL", scores: [0.7, -0.5] },
    ],
    market: { score: 0.1, nChannels: 2, effectiveNChannels: 2, nMessages: 4, dispersion: 0.2, overheated: false },
    channels: [{ username: "Secret_Channel", lastError: "proxy super-secret-proxy", floodWaitUntil: null, lagMin: 10 }],
    queueDepth: 79,
    now: Date.parse("2026-11-19T00:00:00Z"),
    lagBadMin: 120,
    queueWarn: 10,
    queueBad: 100,
    ...overrides,
  };
}

test("консенсус и расхождение считаются по знаку, один голос не становится консенсусом", () => {
  const digest = buildDigest(input());
  assert.deepEqual(digest.consensus, [{ symbol: "ETH", side: "long", voices: 2 }]);
  assert.equal(digest.disagreement[0]?.symbol, "SOL");
  assert.equal(digest.taken[0]?.username, "Secret_Channel");
});

test("текст ошибки сбора не переносится в алерт", () => {
  const digest = buildDigest(input());
  assert.equal(digest.alerts.some((alert) => alert.text.includes("super-secret-proxy")), false);
  assert.equal(digest.alerts.some((alert) => alert.text.includes("Secret_Channel")), true);
  assert.equal(digest.alerts.some((alert) => alert.text.includes("79")), true);
});

test("выдача для Panorama не содержит имён каналов и текста ошибки", () => {
  const digest = buildDigest(input());
  const panorama = toPanorama(digest, input().market);
  const blob = JSON.stringify(panorama);
  assert.equal(blob.includes("Secret_Channel"), false);
  assert.equal(blob.includes("super-secret-proxy"), false);
  assert.equal(panorama.taken[0]?.count, 1);
  assert.equal(panorama.disclaimer.includes("Не инвестиционная рекомендация"), true);
});
