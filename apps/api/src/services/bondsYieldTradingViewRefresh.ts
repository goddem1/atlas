import type { PrismaClient } from "@prisma/client";
import { fetch as undiciFetch } from "undici";
import {
  BONDS_TV_RAPIDAPI_HOST,
  BONDS_TV_REQUEST_DELAY_MS_DEFAULT,
  BONDS_YIELD_INTERVAL,
  BONDS_YIELD_TENOR_SOURCES,
} from "./bondsYieldConfig.js";
import { closeTimeForRequestDate, formatBondsYieldClose } from "./bondsYieldDate.js";
import { pickBondsRapidApiKey, recordBondsRapidApiRequest } from "./rapidApiBondsQuota.js";

type LoggerLike = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type TvPriceResponse = {
  success?: boolean;
  error?: string;
  data?: {
    current?: { close?: number };
  };
};

function requestDelayMs(): number {
  const raw = process.env.BONDS_TV_REQUEST_DELAY_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : BONDS_TV_REQUEST_DELAY_MS_DEFAULT;
  return Number.isFinite(n) && n >= 0 ? n : BONDS_TV_REQUEST_DELAY_MS_DEFAULT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTvClose(ticker: string, apiKey: string): Promise<number | null> {
  const url = new URL(`https://${BONDS_TV_RAPIDAPI_HOST}/api/price/${ticker}`);
  url.searchParams.set("timeframe", "D");
  url.searchParams.set("range", "1");

  const timeoutMs = 30_000;
  const res = await undiciFetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": BONDS_TV_RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TradingView ${ticker} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as TvPriceResponse;
  if (!body.success) {
    throw new Error(`TradingView ${ticker}: ${body.error ?? "request failed"}`);
  }

  const close = body.data?.current?.close;
  return typeof close === "number" && Number.isFinite(close) ? close : null;
}

async function upsertBondsPrice(
  prisma: PrismaClient,
  symbol: string,
  closeTime: Date,
  close: string,
): Promise<void> {
  await prisma.bondsPrices.upsert({
    where: {
      symbol_interval_closeTime: {
        symbol,
        interval: BONDS_YIELD_INTERVAL,
        closeTime,
      },
    },
    create: {
      symbol,
      interval: BONDS_YIELD_INTERVAL,
      closeTime,
      close,
    },
    update: { close },
  });
}

export type BondsTvRefreshResult = {
  closeTime: string;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function refreshBondsYieldFromTradingView(
  prisma: PrismaClient,
  logger: LoggerLike,
  now = new Date(),
): Promise<BondsTvRefreshResult> {
  const closeTime = closeTimeForRequestDate(now);
  const delayMs = requestDelayMs();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  logger.info(
    `[bonds-tv] refresh for ${closeTime.toISOString().slice(0, 10)} (${BONDS_YIELD_TENOR_SOURCES.length} tenors)`,
  );

  for (let i = 0; i < BONDS_YIELD_TENOR_SOURCES.length; i++) {
    const { symbol, tvTicker } = BONDS_YIELD_TENOR_SOURCES[i]!;
    if (i > 0) await sleep(delayMs);

    try {
      const apiKey = await pickBondsRapidApiKey(prisma, now);
      const rawClose = await fetchTvClose(tvTicker, apiKey);
      await recordBondsRapidApiRequest(prisma, now);

      if (rawClose === null) {
        skipped += 1;
        logger.warn(`[bonds-tv] ${symbol} (${tvTicker}): no close in response`);
        continue;
      }

      const close = formatBondsYieldClose(rawClose);
      await upsertBondsPrice(prisma, symbol, closeTime, close);
      updated += 1;
      logger.info(`[bonds-tv] ${symbol} ${tvTicker} close=${close}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${symbol}: ${msg}`);
      logger.error(`[bonds-tv] ${symbol} (${tvTicker}): ${msg}`);
    }
  }

  return {
    closeTime: closeTime.toISOString(),
    updated,
    skipped,
    errors,
  };
}
