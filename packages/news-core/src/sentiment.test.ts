import assert from "node:assert/strict";
import test from "node:test";
import { coordinatedMentions, DEFAULT_SENTIMENT, scoreDay, textsSimilar, voicesFrom, type RawSentiment } from "./sentiment.ts";

const DAY = 24 * 60 * 60 * 1000;
const day = 10 * DAY;

function row(overrides: Partial<RawSentiment>): RawSentiment {
  return {
    messageId: "m",
    channelId: "a",
    postedAt: day + 12 * 60 * 60 * 1000,
    text: "автор ждёт рост биткоина на этой неделе и пишет об этом прямо",
    isAd: false,
    msgType: "view",
    stance: 1,
    confidence: 1,
    market: null,
    coins: [],
    ...overrides,
  };
}

test("реклама не становится голосом", () => {
  const voices = voicesFrom([row({ isAd: true, stance: 1 })]);
  assert.equal(voices.market.length, 0);
});

test("через период полураспада старый голос весит вдвое меньше", () => {
  const voices = voicesFrom([
    row({ messageId: "now", postedAt: day + DAY - 1000, stance: 1, confidence: 1 }),
    row({ messageId: "old", postedAt: day + DAY - 3 * DAY, stance: -1, confidence: 1 }),
  ]);
  const scored = scoreDay(voices.market, day, DEFAULT_SENTIMENT, "market", "");
  assert.ok(scored);
  assert.ok(Math.abs(scored.score - 1 / 3) < 0.02);
});

test("сообщение следующего дня не влияет на сегодняшний счёт", () => {
  const voices = voicesFrom([
    row({ messageId: "today", stance: -1, postedAt: day + 60 * 60 * 1000 }),
    row({ messageId: "tomorrow", stance: 1, postedAt: day + DAY + 60 * 60 * 1000 }),
  ]);
  const scored = scoreDay(voices.market, day, DEFAULT_SENTIMENT, "market", "");
  assert.equal(scored?.score, -1);
  assert.equal(scored?.nMessages, 1);
});

test("два независимых канала усредняются с равным весом", () => {
  const voices = voicesFrom([
    row({ channelId: "a", text: "первый канал отдельно ждёт рост и объясняет почему именно сейчас", stance: 1 }),
    row({ channelId: "b", messageId: "b", text: "второй канал говорит про другое и ждёт снижение на другом основании", stance: -1 }),
  ]);
  const scored = scoreDay(voices.market, day, DEFAULT_SENTIMENT, "market", "");
  assert.equal(scored?.score, 0);
  assert.equal(scored?.nChannels, 2);
  assert.equal(scored?.effectiveNChannels, 2);
});

test("почти одинаковый текст двух каналов считается одним голосом", () => {
  const text = "один и тот же пересказ новости про биткоин который разошёлся по каналам";
  assert.equal(textsSimilar(text, `${text} !`, 0.8), true);
  const voices = voicesFrom([
    row({ channelId: "a", text, stance: 1 }),
    row({ channelId: "b", messageId: "b", text, stance: 1 }),
  ]);
  const scored = scoreDay(voices.market, day, DEFAULT_SENTIMENT, "market", "");
  assert.equal(scored?.effectiveNChannels, 1);
  assert.equal(scored?.nChannels, 2);
  assert.equal(scored?.score, 1);
});

test("перегрев только когда каналы согласны и счёт высокий", () => {
  const hot = voicesFrom([
    row({ channelId: "a", text: "первый канал отдельно очень уверен в росте рынка на этой неделе", stance: 0.8 }),
    row({ channelId: "b", messageId: "b", text: "второй канал другим текстом тоже уверен в росте и пишет длинно", stance: 0.9 }),
  ]);
  const scored = scoreDay(hot.market, day, DEFAULT_SENTIMENT, "market", "");
  assert.equal(scored?.overheated, true);
  const split = voicesFrom([
    row({ channelId: "a", text: "первый канал отдельно очень уверен в росте рынка на этой неделе", stance: 0.9 }),
    row({ channelId: "b", messageId: "b", text: "второй канал другим текстом ждёт падение и спорит с первым", stance: -0.4 }),
  ]);
  assert.equal(scoreDay(split.market, day, DEFAULT_SENTIMENT, "market", "")?.overheated, false);
});

test("всплеск малоизвестной монеты за час помечается, биткоин нет", () => {
  const at = day + 60 * 60 * 1000;
  const flags = coordinatedMentions([
    { channelId: "a", symbol: "DOGE", postedAt: at },
    { channelId: "b", symbol: "DOGE", postedAt: at + 10 * 60 * 1000 },
    { channelId: "c", symbol: "DOGE", postedAt: at + 20 * 60 * 1000 },
    { channelId: "a", symbol: "BTC", postedAt: at },
    { channelId: "b", symbol: "BTC", postedAt: at + 1000 },
    { channelId: "c", symbol: "BTC", postedAt: at + 2000 },
  ], DEFAULT_SENTIMENT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]?.symbol, "DOGE");
});
