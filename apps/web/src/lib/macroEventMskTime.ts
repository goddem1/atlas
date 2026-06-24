/** Московское время для live-статусов макро-событий (виджет + модалка). */

const MSK_MINUTE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const MSK_SECOND_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Moscow",
  second: "2-digit",
  hour12: false,
});

const MSK_EPOCH_PARTS_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const MACRO_RELEASE_STATUS_HOT_POLL_MS = 1000;
export const MACRO_RELEASE_STATUS_NEAR_POLL_MS = 5000;
export const MACRO_RELEASE_STATUS_IDLE_POLL_MS = 30000;

export function mskMinuteKey(value: Date): string {
  return MSK_MINUTE_FORMAT.format(value);
}

export function mskSecond(value: Date): number {
  return Number(MSK_SECOND_FORMAT.format(value)) || 0;
}

export function mskEpochParts(value: Date): { epochMinute: number; second: number } {
  const parts = MSK_EPOCH_PARTS_FORMAT.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const y = Number.parseInt(get("year"), 10) || 1970;
  const m = Number.parseInt(get("month"), 10) || 1;
  const d = Number.parseInt(get("day"), 10) || 1;
  const hh = Number.parseInt(get("hour"), 10) || 0;
  const mm = Number.parseInt(get("minute"), 10) || 0;
  const ss = Number.parseInt(get("second"), 10) || 0;
  const epochMinute = Date.UTC(y, m - 1, d, hh, mm, 0) / 60000;
  return { epochMinute, second: ss };
}

export function pickMacroReleaseStatusPollDelay(
  events: Array<{ date: string }>,
  inProgressSize: number,
  now = new Date(),
): number {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return Math.max(MACRO_RELEASE_STATUS_IDLE_POLL_MS, 60000);
  }
  if (inProgressSize > 0) return MACRO_RELEASE_STATUS_HOT_POLL_MS;

  const nowParts = mskEpochParts(now);
  const nowMinute = nowParts.epochMinute;
  const hotSecondWindow = nowParts.second < 8;
  let hasNearRelease = false;
  for (const e of events) {
    const eventMinute = mskEpochParts(new Date(e.date)).epochMinute;
    const delta = eventMinute - nowMinute;
    if (delta < 0 || delta > 15) continue;
    hasNearRelease = true;
    if (delta === 0 && hotSecondWindow) return MACRO_RELEASE_STATUS_HOT_POLL_MS;
  }
  return hasNearRelease ? MACRO_RELEASE_STATUS_NEAR_POLL_MS : MACRO_RELEASE_STATUS_IDLE_POLL_MS;
}
