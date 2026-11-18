import assert from "node:assert/strict";
import test from "node:test";
import { checkProfile, diffProfiles, weekStartUtc } from "./profile.ts";

const allowed = ["m1", "m2"];

test("неделя начинается в понедельник UTC", () => {
  assert.equal(weekStartUtc(new Date("2026-11-19T12:00:00Z")).toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(weekStartUtc(new Date("2026-11-16T00:30:00Z")).toISOString(), "2026-11-16T00:00:00.000Z");
});

test("чужой и пустой id отбрасывают утверждение, свой сохраняется", () => {
  const checked = checkProfile({
    mood: "ждёт рост",
    moodMessageIds: ["m1"],
    watches: [{ text: "смотрит биткоин", messageIds: ["чужой"] }],
    expectations: [{ text: "без ссылки", messageIds: [] }],
    themes: [{ text: "ETF", messageIds: ["m2"] }],
    style: "коротко",
    styleMessageIds: ["m1", "нет такого"],
    horizon: "weeks",
  }, allowed);
  assert.ok(checked);
  assert.equal(checked.profile.mood, "ждёт рост");
  assert.equal(checked.profile.watches.length, 0);
  assert.equal(checked.profile.expectations.length, 0);
  assert.equal(checked.profile.themes[0]?.text, "ETF");
  assert.equal(checked.profile.style, "");
  assert.deepEqual(checked.evidenceMessageIds, ["m1", "m2"]);
  assert.equal(checked.stats.claims, 5);
  assert.equal(checked.stats.kept, 2);
  assert.equal(checked.stats.dropped, 3);
});

test("первая неделя без прошлого профиля не помечается сменой", () => {
  const next = checkProfile({ mood: "ровно", moodMessageIds: ["m1"], horizon: "days" }, allowed);
  assert.ok(next);
  assert.equal(diffProfiles(null, next.profile), null);
});

test("смена настроения относительно прошлой недели видна", () => {
  const previous = checkProfile({ mood: "ровно", moodMessageIds: ["m1"], horizon: "days" }, allowed);
  const next = checkProfile({ mood: "осторожно", moodMessageIds: ["m2"], horizon: "days", changedViews: [{ text: "стал осторожнее", messageIds: ["m2"] }] }, allowed);
  assert.ok(previous && next);
  const diff = diffProfiles(previous.profile, next.profile);
  assert.equal(diff?.changed, true);
  assert.equal(diff?.moodChanged, true);
});
