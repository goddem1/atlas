import type { PrismaClient } from "@prisma/client";
import {
  BONDS_FRED_LOOKBACK_DAYS_DEFAULT,
  BONDS_YIELD_INTERVAL,
  BONDS_YIELD_TENOR_SOURCES,
} from "./bondsYieldConfig.js";
import { ymdDaysAgo } from "./bondsYieldDate.js";

const FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";

type LoggerLike = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type FredObservation = {
  date: string;
  value: string;
};

type FredObservationsResponse = {
  observations: FredObservation[];
};

function fredLookbackDays(): number {
  const raw = process.env.BONDS_FRED_LOOKBACK_DAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : BONDS_FRED_LOOKBACK_DAYS_DEFAULT;
  return Number.isFinite(n) && n > 0 ? n : BONDS_FRED_LOOKBACK_DAYS_DEFAULT;
}

function parseCloseTime(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid FRED date: ${date}`);
  }
  return d;
}

async function fetchFredObservations(
  seriesId: string,
  apiKey: string,
  observationStart: string,
  observationEnd: string,
): Promise<FredObservation[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "asc",
    observation_start: observationStart,
    observation_end: observationEnd,
  });
  const res = await fetch(`${FRED_OBSERVATIONS_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as FredObservationsResponse;
  return body.observations ?? [];
}

export type BondsFredRefreshResult = {
  observationStart: string;
  observationEnd: string;
  upserted: number;
  skipped: number;
  errors: string[];
};

export async function refreshBondsYieldFromFred(
  prisma: PrismaClient,
  logger: LoggerLike,
  now = new Date(),
): Promise<BondsFredRefreshResult> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FRED_API_KEY is required for bonds FRED refresh");
  }

  const lookback = fredLookbackDays();
  const observationStart = ymdDaysAgo(lookback, now);
  const observationEnd = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });

  let upserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  logger.info(`[bonds-fred] ${observationStart}..${observationEnd} (${BONDS_YIELD_TENOR_SOURCES.length} series)`);

  for (let i = 0; i < BONDS_YIELD_TENOR_SOURCES.length; i++) {
    const { symbol, fredSeriesId } = BONDS_YIELD_TENOR_SOURCES[i]!;
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    try {
      const observations = await fetchFredObservations(
        fredSeriesId,
        apiKey,
        observationStart,
        observationEnd,
      );

      for (const row of observations) {
        const v = row.value?.trim();
        if (!v || v === ".") {
          skipped += 1;
          continue;
        }
        const closeTime = parseCloseTime(row.date);
        const existing = await prisma.bondsPrices.findUnique({
          where: {
            symbol_interval_closeTime: {
              symbol,
              interval: BONDS_YIELD_INTERVAL,
              closeTime,
            },
          },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        await prisma.bondsPrices.create({
          data: {
            symbol,
            interval: BONDS_YIELD_INTERVAL,
            closeTime,
            close: v,
          },
        });
        upserted += 1;
      }

      logger.info(`[bonds-fred] ${symbol} ${fredSeriesId}: ${observations.length} observations`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${symbol}: ${msg}`);
      logger.error(`[bonds-fred] ${symbol} (${fredSeriesId}): ${msg}`);
    }
  }

  return { observationStart, observationEnd, upserted, skipped, errors };
}
