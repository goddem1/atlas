import type { PrismaClient } from "@prisma/client";

const BINANCE_DATA_ORIGIN = "https://data-api.binance.vision";
/** Совпадает с `load:candles` / klines `1d`, чтобы одна строка на торговый день. */
const CANDLE_INTERVAL = "1d";

/** Поля [tradingDay](https://data-api.binance.vision/api/v3/ticker/tradingDay) для лога и БД. */
export interface TradingDaySnapshot {
  symbol: string;
  openTime: number;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  closeTime: number;
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

export async function fetchTradingDayTicker(symbol: string): Promise<TradingDaySnapshot> {
  const url = new URL("/api/v3/ticker/tradingDay", BINANCE_DATA_ORIGIN);
  url.searchParams.set("symbol", symbol);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${symbol}: HTTP ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  return {
    symbol: String(j.symbol),
    openTime: Number(j.openTime),
    openPrice: String(j.openPrice),
    highPrice: String(j.highPrice),
    lowPrice: String(j.lowPrice),
    lastPrice: String(j.lastPrice),
    volume: String(j.volume),
    closeTime: Number(j.closeTime),
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

/** Запрос к Binance Vision по символам из `TRADING_DAY_SYMBOLS` и запись в `CryptoPriceCandle`. */
export async function runTradingDayJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  const symbols = parseSymbols();
  for (const symbol of symbols) {
    try {
      const snapshot = await fetchTradingDayTicker(symbol);
      await upsertPriceCandle(prisma, snapshot);
      log.info({ job: "tradingDay", ...snapshot }, "trading_day_saved");
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
