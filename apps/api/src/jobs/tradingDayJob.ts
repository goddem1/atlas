import type { PrismaClient } from "@prisma/client";
import {
  MSK_DAY_MS,
  clearLiveCandle,
  fetchRestMskDailyCandle,
  getLiveCandle,
  toMskDayStartMs,
} from "../services/binanceCandleStream.js";

/** Совпадает с `load:candles` / klines `1d`, чтобы одна строка на торговый день. */
const CANDLE_INTERVAL = "1d";

/** Пауза между REST-фолбэками, чтобы не поймать 429 при большом каталоге. */
const REST_GAP_MS = 80;

export interface TradingDaySnapshot {
  symbol: string;
  openTime: number;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
}

type JobLog = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

function parseSymbolList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `TRADING_DAY_SYMBOLS=ALL` / `*` / пусто → весь CryptocurrencyList; иначе whitelist. */
export async function resolveTradingDaySymbols(prisma: PrismaClient): Promise<string[]> {
  const raw = process.env.TRADING_DAY_SYMBOLS?.trim();
  if (raw && raw.toUpperCase() !== "ALL" && raw !== "*") {
    return parseSymbolList(raw);
  }

  const rows = await prisma.cryptocurrencyList.findMany({
    select: { symbol: true, pairSymbol: true },
    orderBy: { symbol: "asc" },
  });

  return Array.from(
    new Set(
      rows
        .map((row) => (row.pairSymbol?.trim() || `${row.symbol}USDT`).toUpperCase())
        .filter(Boolean),
    ),
  );
}

async function resolveYesterdaySnapshot(symbol: string, openTimeMs: number): Promise<TradingDaySnapshot | null> {
  const live = getLiveCandle(symbol);
  if (live?.openTimeMs === openTimeMs) {
    return {
      symbol: live.symbol,
      openTime: live.openTimeMs,
      openPrice: live.open,
      highPrice: live.high,
      lowPrice: live.low,
      lastPrice: live.close,
      volume: live.volume,
    };
  }

  await sleep(REST_GAP_MS);
  const rest = await fetchRestMskDailyCandle(symbol, openTimeMs);
  if (!rest) {
    return null;
  }

  return {
    symbol: rest.symbol,
    openTime: rest.openTimeMs,
    openPrice: rest.open,
    highPrice: rest.high,
    lowPrice: rest.low,
    lastPrice: rest.close,
    volume: rest.volume,
  };
}

async function upsertPriceCandle(prisma: PrismaClient, snap: TradingDaySnapshot): Promise<void> {
  const openTime = new Date(snap.openTime);
  await prisma.cryptoPriceCandle.upsert({
    where: {
      symbol_interval_openTime: {
        symbol: snap.symbol,
        interval: CANDLE_INTERVAL,
        openTime,
      },
    },
    create: {
      symbol: snap.symbol,
      interval: CANDLE_INTERVAL,
      openTime,
      open: snap.openPrice,
      high: snap.highPrice,
      low: snap.lowPrice,
      close: snap.lastPrice,
      volume: snap.volume,
    },
    update: {
      open: snap.openPrice,
      high: snap.highPrice,
      low: snap.lowPrice,
      close: snap.lastPrice,
      volume: snap.volume,
    },
  });
}

/** В 00:00:01 MSK пишет вчерашнюю MSK-свечу в `CryptoPriceCandle`. */
export async function runTradingDayJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  const symbols = await resolveTradingDaySymbols(prisma);
  const currentDayStartMs = toMskDayStartMs(Date.now());
  const yesterdayStartMs = currentDayStartMs - MSK_DAY_MS;
  const dayLabel = new Date(yesterdayStartMs).toISOString().slice(0, 10);

  let saved = 0;
  let missing = 0;
  let failed = 0;

  log.info(
    { job: "tradingDay", day: dayLabel, symbols: symbols.length },
    `[tradingDay] start ${dayLabel} (${symbols.length} symbols)`,
  );

  for (const symbol of symbols) {
    try {
      const snapshot = await resolveYesterdaySnapshot(symbol, yesterdayStartMs);
      if (!snapshot) {
        missing += 1;
        log.warn(
          {
            job: "tradingDay",
            symbol,
            openTime: new Date(yesterdayStartMs).toISOString(),
          },
          "trading_day_snapshot_missing",
        );
        continue;
      }

      await upsertPriceCandle(prisma, snapshot);
      clearLiveCandle(symbol, yesterdayStartMs);
      saved += 1;
      log.info(
        {
          job: "tradingDay",
          symbol,
          openTime: new Date(snapshot.openTime).toISOString(),
          close: snapshot.lastPrice,
        },
        `[tradingDay] saved ${symbol} ${dayLabel}: close=${snapshot.lastPrice}`,
      );
    } catch (err) {
      failed += 1;
      log.warn(
        {
          job: "tradingDay",
          symbol,
          err: err instanceof Error ? err.message : String(err),
        },
        "trading_day_ticker_fail",
      );
    }
  }

  log.info(
    { job: "tradingDay", day: dayLabel, saved, missing, failed, symbols: symbols.length },
    `[tradingDay] done ${dayLabel}: saved=${saved} missing=${missing} failed=${failed}`,
  );
}
