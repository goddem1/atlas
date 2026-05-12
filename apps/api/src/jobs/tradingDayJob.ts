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

function parseSymbols(): string[] {
  const raw = process.env.TRADING_DAY_SYMBOLS ?? "BTCUSDT,ETHUSDT,HBARUSDT,SUIUSDT,PEPEUSDT";
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

async function resolveYesterdaySnapshot(symbol: string, openTimeMs: number): Promise<TradingDaySnapshot | null> {
  const live = getLiveCandle(symbol);
  const liveOrRest =
    live?.openTimeMs === openTimeMs ? live : await fetchRestMskDailyCandle(symbol, openTimeMs);

  if (!liveOrRest) {
    return null;
  }

  return {
    symbol: liveOrRest.symbol,
    openTime: liveOrRest.openTimeMs,
    openPrice: liveOrRest.open,
    highPrice: liveOrRest.high,
    lowPrice: liveOrRest.low,
    lastPrice: liveOrRest.close,
    volume: liveOrRest.volume,
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
  const symbols = parseSymbols();
  const currentDayStartMs = toMskDayStartMs(Date.now());
  const yesterdayStartMs = currentDayStartMs - MSK_DAY_MS;
  const dayLabel = new Date(yesterdayStartMs).toISOString().slice(0, 10);

  for (const symbol of symbols) {
    try {
      const snapshot = await resolveYesterdaySnapshot(symbol, yesterdayStartMs);
      if (!snapshot) {
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
}
