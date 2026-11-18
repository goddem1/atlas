import assert from "node:assert/strict";
import test from "node:test";
import { pickOpenCall } from "./link.ts";

const open = [
  { id: "a", coinId: "btc" },
  { id: "b", coinId: "eth" },
];

test("ответ на сообщение выбирает единственный вызов этого сообщения", () => {
  const picked = pickOpenCall({ coinId: "eth", replyCallIds: ["a"], openCalls: open });
  assert.deepEqual(picked, { kind: "call", id: "a" });
});

test("без ответа одна открытая монета связывается, две уходят в проверку", () => {
  assert.deepEqual(pickOpenCall({ coinId: "btc", replyCallIds: [], openCalls: open }), { kind: "call", id: "a" });
  const doubled = [...open, { id: "c", coinId: "btc" }];
  assert.deepEqual(pickOpenCall({ coinId: "btc", replyCallIds: [], openCalls: doubled }), {
    kind: "review",
    reason: "multiple_open_calls",
  });
});

test("нет открытого вызова не угадывается", () => {
  assert.deepEqual(pickOpenCall({ coinId: "sol", replyCallIds: [], openCalls: open }), {
    kind: "review",
    reason: "no_open_call",
  });
});
