import type { PrismaClient } from "@prisma/client";
import { fetch as undiciFetch } from "undici";
import { getRapidApiDispatcher } from "../lib/httpProxy.js";

type LoggerLike = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type TeEvent = {
  date: string;
  eventName: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  reference?: string | null;
};

const DEFAULT_COUNTRY = "United States";
const DEFAULT_TZ = "Europe/Moscow";
const DEFAULT_HOST = "economic-calendar-api-tradingeconomics.p.rapidapi.com";

const RELEASE_ATTEMPT_OFFSETS_MS = [
  0,
  10_000,
  20_000,
  30_000,
  40_000,
  50_000,
  5 * 60_000,
  10 * 60_000,
] as const;
const RELEASE_MINUTE_ATTEMPTS = 6;

const inProgressEventIds = new Set<string>();
const activeGroupsByMinuteKey = new Map<string, ActiveReleaseGroup>();
const finishedMinuteKeys = new Set<string>();
const deferredRowsById = new Map<string, DeferredRow>();

type ActiveReleaseGroup = {
  minuteKey: string;
  ymd: string;
  releaseHm: string;
  releaseStartMs: number;
  rowIds: string[];
  attemptsMade: number;
};

type DeferredRow = {
  rowId: string;
  ymd: string;
  releaseHm: string;
  indicatorName: string;
  sourceMinuteKey: string;
};

type GroupRow = {
  id: string;
  actual: unknown | null;
  date: Date;
  indicator: { name: string };
};

type ApplyResult = {
  rowId: string;
  indicatorName: string;
  releaseHm: string;
  matched: boolean;
  rawActual: string | null;
  parsedActual: string | null;
  rawForecast: string | null;
  rawPrevious: string | null;
};

let runningInterval: ReturnType<typeof setInterval> | null = null;
let runInFlight = false;
let lastMissingKeyLogMs = 0;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toDecimalString(raw: string | null | undefined): string | null {
  const src = String(raw ?? "").trim();
  if (!src || src === "-" || src === "—") return null;
  const cleaned = src.replace(/,/g, "").replace(/[^0-9.+-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function parseMskDateToUtc(raw: string): Date | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const withOffset = `${trimmed}+03:00`;
  const d = new Date(withOffset);
  return Number.isFinite(d.getTime()) ? d : null;
}

function mskParts(now = new Date()): { ymd: string; hh: string; mm: string; ss: number } {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hh: get("hour"),
    mm: get("minute"),
    ss: Number.parseInt(get("second"), 10) || 0,
  };
}

async function fetchTradingEconomicsDayEvents(opts: {
  from: string;
  to: string;
  country?: string;
  tz?: string;
  rapidApiKey: string;
  rapidApiHost?: string;
}): Promise<TeEvent[]> {
  const dispatcher = getRapidApiDispatcher();
  const url = new URL(`https://${opts.rapidApiHost ?? DEFAULT_HOST}/calendar`);
  url.searchParams.set("country", opts.country ?? DEFAULT_COUNTRY);
  url.searchParams.set("from", opts.from);
  url.searchParams.set("to", opts.to);
  url.searchParams.set("tz", opts.tz ?? DEFAULT_TZ);

  const res = await undiciFetch(url.toString(), {
    method: "GET",
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      "x-rapidapi-key": opts.rapidApiKey,
      "x-rapidapi-host": opts.rapidApiHost ?? DEFAULT_HOST,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`TradingEconomics API ${res.status}`);
  const payload = (await res.json()) as { events?: TeEvent[] };
  return Array.isArray(payload?.events) ? payload.events : [];
}

function mskDayUtcRange(ymd: string): { start: Date; end: Date } {
  const start = new Date(`${ymd}T00:00:00+03:00`);
  const end = new Date(`${ymd}T23:59:59.999+03:00`);
  return { start, end };
}

function mskMinuteStartUtc(ymd: string, hm: string): Date {
  return new Date(`${ymd}T${hm}:00+03:00`);
}

function eventHmFromIsoDate(iso: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DEFAULT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(iso);
}

function buildEventsByNameAndHm(events: TeEvent[]): Map<string, TeEvent[]> {
  const byNameAndTime = new Map<string, TeEvent[]>();
  for (const ev of events) {
    const name = String(ev.eventName ?? "").trim();
    if (!name) continue;
    const date = parseMskDateToUtc(ev.date);
    if (!date) continue;
    const hm = eventHmFromIsoDate(date);
    const key = `${normalizeName(name)}|${hm}`;
    const list = byNameAndTime.get(key) ?? [];
    list.push(ev);
    byNameAndTime.set(key, list);
  }
  return byNameAndTime;
}

function cleanupDailyState(now = new Date()): void {
  const { ymd } = mskParts(now);
  for (const minuteKey of finishedMinuteKeys) {
    if (!minuteKey.startsWith(ymd)) finishedMinuteKeys.delete(minuteKey);
  }
  for (const [rowId, deferred] of deferredRowsById) {
    if (deferred.ymd !== ymd) continue;
    // keep same-day deferred rows; cleanup happens when row succeeds or next day on new event
    void rowId;
  }
}

function attemptPhase(attemptNo: number): string {
  if (attemptNo <= RELEASE_MINUTE_ATTEMPTS) return "release-minute";
  if (attemptNo === RELEASE_MINUTE_ATTEMPTS + 1) return "plus-5m";
  return "plus-10m";
}

function toLogValue(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

async function applyCalendarToRows(
  prisma: PrismaClient,
  events: TeEvent[],
  rows: GroupRow[],
): Promise<{ updated: number; filledActual: number; results: ApplyResult[] }> {
  const byNameAndTime = buildEventsByNameAndHm(events);
  let updated = 0;
  let filledActual = 0;
  const results: ApplyResult[] = [];
  for (const row of rows) {
    const releaseHm = eventHmFromIsoDate(row.date);
    const key = `${normalizeName(row.indicator.name)}|${releaseHm}`;
    const match = byNameAndTime.get(key)?.[0];
    const actual = toDecimalString(match?.actual);
    const forecast = toDecimalString(match?.forecast);
    const previous = toDecimalString(match?.previous);
    const reference = String(match?.reference ?? "").trim() || null;

    results.push({
      rowId: row.id,
      indicatorName: row.indicator.name,
      releaseHm,
      matched: !!match,
      rawActual: toLogValue(match?.actual),
      parsedActual: actual,
      rawForecast: toLogValue(match?.forecast),
      rawPrevious: toLogValue(match?.previous),
    });

    if (!match) continue;

    await prisma.macroDataPoint.update({
      where: { id: row.id },
      data: {
        actual,
        forecast,
        previous,
        reference,
        isPending: actual == null,
      },
    });
    updated += 1;
    if (actual != null) filledActual += 1;
  }
  return { updated, filledActual, results };
}

async function loadCurrentMinuteRows(
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ minuteKey: string; ymd: string; releaseHm: string; rows: GroupRow[] } | null> {
  const { ymd, hh, mm } = mskParts(now);
  const releaseHm = `${hh}:${mm}`;
  const minuteKey = `${ymd} ${releaseHm}`;
  const { start, end } = mskDayUtcRange(ymd);
  const dayRows = await prisma.macroDataPoint.findMany({
    where: { date: { gte: start, lte: end } },
    include: { indicator: { select: { name: true } } },
  });
  const rows = dayRows.filter((r) => eventHmFromIsoDate(r.date) === releaseHm);
  if (rows.length === 0) return null;
  return { minuteKey, ymd, releaseHm, rows };
}

async function activateCurrentMinuteGroup(
  logger: LoggerLike,
  prisma: PrismaClient,
  now = new Date(),
): Promise<boolean> {
  cleanupDailyState(now);
  const current = await loadCurrentMinuteRows(prisma, now);
  if (!current) return false;
  if (activeGroupsByMinuteKey.has(current.minuteKey)) return false;
  if (finishedMinuteKeys.has(current.minuteKey)) return false;

  const releaseStartMs = mskMinuteStartUtc(current.ymd, current.releaseHm).getTime();
  const nowMs = now.getTime();
  if (nowMs < releaseStartMs || nowMs >= releaseStartMs + 60_000) return false;

  activeGroupsByMinuteKey.set(current.minuteKey, {
    minuteKey: current.minuteKey,
    ymd: current.ymd,
    releaseHm: current.releaseHm,
    releaseStartMs,
    rowIds: current.rows.map((row) => row.id),
    attemptsMade: 0,
  });

  for (const row of current.rows) {
    if (row.actual == null) inProgressEventIds.add(row.id);
  }

  logger.info(
    `[macro-release] group activated minute=${current.minuteKey} rows=${current.rows.length} indicators=${JSON.stringify(current.rows.map((row) => row.indicator.name))}`,
  );
  return true;
}

async function processActiveGroups(logger: LoggerLike, prisma: PrismaClient, now = new Date()): Promise<void> {
  const rapidApiKey = process.env.RAPIDAPI_KEY ?? "";
  if (!rapidApiKey) {
    if (activeGroupsByMinuteKey.size > 0 && now.getTime() - lastMissingKeyLogMs > 30_000) {
      lastMissingKeyLogMs = now.getTime();
      logger.error("[macro-release] RAPIDAPI_KEY is missing");
    }
    return;
  }

  const nowMs = now.getTime();
  for (const [minuteKey, group] of activeGroupsByMinuteKey) {
    const maxAttemptsReached = group.attemptsMade >= RELEASE_ATTEMPT_OFFSETS_MS.length;
    if (maxAttemptsReached) {
      const rows = await prisma.macroDataPoint.findMany({
        where: { id: { in: group.rowIds } },
        include: { indicator: { select: { name: true } } },
      });
      const pendingRows = rows.filter((row) => row.actual == null);
      for (const row of pendingRows) {
        deferredRowsById.set(row.id, {
          rowId: row.id,
          ymd: group.ymd,
          releaseHm: group.releaseHm,
          indicatorName: row.indicator.name,
          sourceMinuteKey: minuteKey,
        });
      }
      for (const rowId of group.rowIds) inProgressEventIds.delete(rowId);
      activeGroupsByMinuteKey.delete(minuteKey);
      finishedMinuteKeys.add(minuteKey);
      logger.info(
        `[macro-release] group finished minute=${minuteKey} attempts=${group.attemptsMade}/${RELEASE_ATTEMPT_OFFSETS_MS.length} reason=attempt-limit deferred_rows=${pendingRows.length}`,
      );
      continue;
    }

    const dueAtMs = group.releaseStartMs + RELEASE_ATTEMPT_OFFSETS_MS[group.attemptsMade]!;
    if (nowMs < dueAtMs) continue;

    const rows = await prisma.macroDataPoint.findMany({
      where: { id: { in: group.rowIds } },
      include: { indicator: { select: { name: true } } },
    });
    const pendingRows = rows.filter((row) => row.actual == null);
    if (pendingRows.length === 0) {
      for (const rowId of group.rowIds) inProgressEventIds.delete(rowId);
      activeGroupsByMinuteKey.delete(minuteKey);
      finishedMinuteKeys.add(minuteKey);
      logger.info(
        `[macro-release] group finished minute=${minuteKey} attempts=${group.attemptsMade}/${RELEASE_ATTEMPT_OFFSETS_MS.length} reason=filled-early`,
      );
      continue;
    }

    const attemptNo = group.attemptsMade + 1;
    const phase = attemptPhase(attemptNo);
    for (const row of pendingRows) inProgressEventIds.add(row.id);

    try {
      const events = await fetchTradingEconomicsDayEvents({
        from: group.ymd,
        to: group.ymd,
        rapidApiKey,
        rapidApiHost: process.env.RAPIDAPI_HOST ?? DEFAULT_HOST,
      });
      const { updated, filledActual, results } = await applyCalendarToRows(prisma, events, pendingRows);
      group.attemptsMade += 1;

      const afterRows = await prisma.macroDataPoint.findMany({
        where: { id: { in: group.rowIds } },
        select: { id: true, actual: true },
      });
      let pendingAfter = 0;
      for (const row of afterRows) {
        if (row.actual == null) {
          pendingAfter += 1;
          inProgressEventIds.add(row.id);
        } else {
          inProgressEventIds.delete(row.id);
        }
      }

      logger.info(
        `[macro-release] minute=${minuteKey} attempt=${attemptNo}/${RELEASE_ATTEMPT_OFFSETS_MS.length} phase=${phase} status=ok api_events=${events.length} pending_before=${pendingRows.length} updated=${updated} filled_actual=${filledActual} pending_after=${pendingAfter} results=${JSON.stringify(results)}`,
      );

      if (pendingAfter === 0) {
        activeGroupsByMinuteKey.delete(minuteKey);
        finishedMinuteKeys.add(minuteKey);
        logger.info(
          `[macro-release] group finished minute=${minuteKey} attempts=${group.attemptsMade}/${RELEASE_ATTEMPT_OFFSETS_MS.length} reason=filled-early`,
        );
      }
    } catch (err) {
      group.attemptsMade += 1;
      logger.error(
        `[macro-release] minute=${minuteKey} attempt=${attemptNo}/${RELEASE_ATTEMPT_OFFSETS_MS.length} phase=${phase} status=error error=${JSON.stringify(err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) })}`,
      );
    }
  }
}

async function processDeferredRowsOnNextEvent(
  logger: LoggerLike,
  prisma: PrismaClient,
  shouldRun: boolean,
): Promise<void> {
  if (!shouldRun || deferredRowsById.size === 0) return;

  const rapidApiKey = process.env.RAPIDAPI_KEY ?? "";
  if (!rapidApiKey) {
    logger.error("[macro-release] RAPIDAPI_KEY is missing");
    return;
  }

  const queued = [...deferredRowsById.values()];
  const byYmd = new Map<string, DeferredRow[]>();
  for (const row of queued) {
    const list = byYmd.get(row.ymd) ?? [];
    list.push(row);
    byYmd.set(row.ymd, list);
  }

  logger.info(
    `[macro-release] deferred retry started groups=${byYmd.size} rows=${queued.length} items=${JSON.stringify(queued.map((row) => ({ rowId: row.rowId, indicatorName: row.indicatorName, sourceMinuteKey: row.sourceMinuteKey })))}`
  );

  for (const [ymd, deferredRows] of byYmd) {
    const dbRows = await prisma.macroDataPoint.findMany({
      where: { id: { in: deferredRows.map((row) => row.rowId) } },
      include: { indicator: { select: { name: true } } },
    });
    const pendingRows = dbRows.filter((row) => row.actual == null);
    for (const row of dbRows) {
      if (row.actual != null) deferredRowsById.delete(row.id);
    }
    if (pendingRows.length === 0) continue;

    for (const row of pendingRows) inProgressEventIds.add(row.id);
    try {
      const events = await fetchTradingEconomicsDayEvents({
        from: ymd,
        to: ymd,
        rapidApiKey,
        rapidApiHost: process.env.RAPIDAPI_HOST ?? DEFAULT_HOST,
      });
      const { updated, filledActual, results } = await applyCalendarToRows(prisma, events, pendingRows);
      const afterRows = await prisma.macroDataPoint.findMany({
        where: { id: { in: pendingRows.map((row) => row.id) } },
        select: { id: true, actual: true },
      });
      let pendingAfter = 0;
      for (const row of afterRows) {
        if (row.actual == null) {
          pendingAfter += 1;
          inProgressEventIds.delete(row.id);
        } else {
          deferredRowsById.delete(row.id);
          inProgressEventIds.delete(row.id);
        }
      }
      logger.info(
        `[macro-release] deferred ymd=${ymd} status=ok api_events=${events.length} pending_before=${pendingRows.length} updated=${updated} filled_actual=${filledActual} pending_after=${pendingAfter} results=${JSON.stringify(results)}`,
      );
    } catch (err) {
      logger.error(
        `[macro-release] deferred ymd=${ymd} status=error error=${JSON.stringify(err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) })}`,
      );
      for (const row of pendingRows) inProgressEventIds.delete(row.id);
    }
  }
}

async function tick(logger: LoggerLike, prisma: PrismaClient): Promise<void> {
  const activated = await activateCurrentMinuteGroup(logger, prisma);
  await processActiveGroups(logger, prisma);
  await processDeferredRowsOnNextEvent(logger, prisma, activated);
}

export function startMacroReleaseActualsScheduler(
  logger: LoggerLike,
  prisma: PrismaClient,
): { stop: () => void } {
  if (runningInterval) return { stop: stopMacroReleaseActualsScheduler };

  runningInterval = setInterval(() => {
    if (runInFlight) return;
    runInFlight = true;
    void tick(logger, prisma).finally(() => {
      runInFlight = false;
    });
  }, 1000);

  logger.info(
    "[macro-release] scheduler started (6 attempts in first minute, then +5m and +10m, then deferred retry on next event)",
  );
  return { stop: stopMacroReleaseActualsScheduler };
}

export function stopMacroReleaseActualsScheduler(): void {
  if (runningInterval) {
    clearInterval(runningInterval);
    runningInterval = null;
  }
  runInFlight = false;
  inProgressEventIds.clear();
  activeGroupsByMinuteKey.clear();
  finishedMinuteKeys.clear();
  deferredRowsById.clear();
}

export function getMacroReleaseInProgressIds(): string[] {
  return [...inProgressEventIds];
}
