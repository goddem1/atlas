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

export type MacroImportOptions = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  country?: string;
  tz?: string;
  rapidApiKey?: string;
  rapidApiHost?: string;
  /** true: не трогать уже существующие MacroDataPoint (только create для отсутствующих пар indicator+date) */
  onlyMissing?: boolean;
};

export type MacroImportStats = {
  from: string;
  to: string;
  receivedEvents: number;
  created: number;
  updated: number;
  skippedUnknownIndicator: number;
  skippedExisting: number;
};

const DEFAULT_COUNTRY = "United States";
const DEFAULT_TZ = "Europe/Moscow";
const DEFAULT_HOST = "economic-calendar-api-tradingeconomics.p.rapidapi.com";

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
  // API returns local time in requested timezone (MSK), pin +03:00 explicitly.
  const withOffset = `${trimmed}+03:00`;
  const d = new Date(withOffset);
  return Number.isFinite(d.getTime()) ? d : null;
}

type MacroCalendarFetchOpts = {
  from: string;
  to: string;
  country: string;
  tz: string;
  rapidApiKey: string;
  rapidApiHost: string;
};

async function fetchTradingEconomicsEvents(opts: MacroCalendarFetchOpts): Promise<TeEvent[]> {
  const dispatcher = getRapidApiDispatcher();
  const url = new URL(`https://${opts.rapidApiHost}/calendar`);
  url.searchParams.set("country", opts.country);
  url.searchParams.set("from", opts.from);
  url.searchParams.set("to", opts.to);
  url.searchParams.set("tz", opts.tz);

  const res = await undiciFetch(url.toString(), {
    method: "GET",
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      "x-rapidapi-key": opts.rapidApiKey,
      "x-rapidapi-host": opts.rapidApiHost,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TradingEconomics API ${res.status}`);
  }

  const payload = (await res.json()) as { events?: TeEvent[] };
  return Array.isArray(payload?.events) ? payload.events : [];
}

export async function importMacroCalendarRange(
  prisma: PrismaClient,
  logger: LoggerLike,
  options: MacroImportOptions,
): Promise<MacroImportStats> {
  const rapidApiKey = options.rapidApiKey ?? process.env.RAPIDAPI_KEY ?? "";
  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY is missing");
  }

  const onlyMissing = options.onlyMissing ?? false;
  const opts: MacroCalendarFetchOpts = {
    from: options.from,
    to: options.to,
    country: options.country ?? DEFAULT_COUNTRY,
    tz: options.tz ?? DEFAULT_TZ,
    rapidApiKey,
    rapidApiHost: options.rapidApiHost ?? process.env.RAPIDAPI_HOST ?? DEFAULT_HOST,
  };

  const indicators = await prisma.macroIndicator.findMany({
    select: { id: true, name: true },
  });
  const indicatorIdByName = new Map<string, string>();
  for (const indicator of indicators) {
    indicatorIdByName.set(normalizeName(indicator.name), indicator.id);
  }

  const events = await fetchTradingEconomicsEvents(opts);

  let created = 0;
  let updated = 0;
  let skippedUnknownIndicator = 0;
  let skippedExisting = 0;

  for (const event of events) {
    const eventName = String(event.eventName ?? "").trim();
    if (!eventName) continue;
    const indicatorId = indicatorIdByName.get(normalizeName(eventName));
    if (!indicatorId) {
      skippedUnknownIndicator += 1;
      continue;
    }

    const date = parseMskDateToUtc(event.date);
    if (!date) continue;

    const actual = toDecimalString(event.actual);
    const forecast = toDecimalString(event.forecast);
    const previous = toDecimalString(event.previous);
    const reference = String(event.reference ?? "").trim() || null;

    const existing = await prisma.macroDataPoint.findFirst({
      where: { indicatorId, date },
      select: { id: true },
    });

    if (existing) {
      if (onlyMissing) {
        skippedExisting += 1;
        continue;
      }
      await prisma.macroDataPoint.update({
        where: { id: existing.id },
        data: {
          actual,
          forecast,
          previous,
          reference,
          isPending: actual == null,
        },
      });
      updated += 1;
    } else {
      await prisma.macroDataPoint.create({
        data: {
          indicatorId,
          date,
          actual,
          forecast,
          previous,
          reference,
          isPending: actual == null,
        },
      });
      created += 1;
    }
  }

  const stats: MacroImportStats = {
    from: opts.from,
    to: opts.to,
    receivedEvents: events.length,
    created,
    updated,
    skippedUnknownIndicator,
    skippedExisting,
  };
  logger.info(
    `[macro-prefetch] ${opts.from}..${opts.to} received=${stats.receivedEvents} created=${stats.created} updated=${stats.updated} skipped_unknown=${stats.skippedUnknownIndicator} skipped_existing=${stats.skippedExisting}`,
  );
  return stats;
}

type MonthRange = { from: string; to: string };

function monthRange(year: number, month0: number): MonthRange {
  const first = new Date(Date.UTC(year, month0, 1));
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toYmd(first), to: toYmd(last) };
}

function mskYmd(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: DEFAULT_TZ });
}

function nextTwoMonthRanges(now = new Date()): MonthRange[] {
  const [y, m] = mskYmd(now).split("-").map(Number);
  const month0 = (m ?? 1) - 1;
  const year = y ?? now.getUTCFullYear();

  const nextMonth0 = month0 + 1;
  const afterNextMonth0 = month0 + 2;

  const nextYear = year + Math.floor(nextMonth0 / 12);
  const nextMonthNorm = ((nextMonth0 % 12) + 12) % 12;
  const afterYear = year + Math.floor(afterNextMonth0 / 12);
  const afterMonthNorm = ((afterNextMonth0 % 12) + 12) % 12;

  return [monthRange(nextYear, nextMonthNorm), monthRange(afterYear, afterMonthNorm)];
}

export async function runMacroMonthEndPrefetch(
  logger: LoggerLike,
  prisma: PrismaClient,
  now = new Date(),
): Promise<void> {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = Number(mskYmd(tomorrow).slice(-2));
  if (tomorrowDay !== 1) {
    logger.info("[macro-prefetch] skipped: not month end");
    return;
  }

  const ranges = nextTwoMonthRanges(now);
  for (const range of ranges) {
    await importMacroCalendarRange(prisma, logger, range);
  }
}

export async function runMacroPrefetchForNextTwoMonths(
  logger: LoggerLike,
  prisma: PrismaClient,
  now = new Date(),
): Promise<void> {
  const ranges = nextTwoMonthRanges(now);
  for (const range of ranges) {
    await importMacroCalendarRange(prisma, logger, range);
  }
}
