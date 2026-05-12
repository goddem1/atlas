import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BINANCE_DATA_URL = "https://data-api.binance.vision/api/v3/klines";
const PAGE_LIMIT = 1000;
const INTERVAL = "1d";
const DEFAULT_START_MS = 1514764800000;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REQUEST_DELAY_MS = 150;
const SYMBOL_START_DELAY_MS = 500;
const BACKOFF_START_MS = 10_000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

type KlineTuple = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  ...unknown[],
];

type SymbolLoadResult = {
  symbol: string;
  inserted: number;
  pages: number;
  errors: number;
  failed: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function parseSymbolOverride(): string[] {
  const symbolsRaw = process.env.SYMBOLS?.trim();
  if (symbolsRaw) {
    return Array.from(
      new Set(
        symbolsRaw
          .split(",")
          .map(normalizeSymbol)
          .filter(Boolean),
      ),
    );
  }

  const singleSymbol = process.env.SYMBOL?.trim();
  return singleSymbol ? [normalizeSymbol(singleSymbol)] : [];
}

function formatOpenDate(openTimeMs: number): string {
  return new Date(openTimeMs).toISOString().slice(0, 10);
}

async function fetchKlinesPage(
  symbol: string,
  startTimeMs: number,
): Promise<{ rows: KlineTuple[]; retryErrors: number }> {
  let retryErrors = 0;
  let backoffMs = BACKOFF_START_MS;

  for (;;) {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL,
      startTime: String(startTimeMs),
      limit: String(PAGE_LIMIT),
      timeZone: "3",
    });

    const response = await fetch(`${BINANCE_DATA_URL}?${params}`);
    if (response.ok) {
      return {
        rows: (await response.json()) as KlineTuple[],
        retryErrors,
      };
    }

    const responseText = await response.text();
    if (response.status === 429 || response.status === 418) {
      retryErrors += 1;
      console.warn(
        `[${symbol}] Binance ${response.status}, retry in ${backoffMs}ms (${responseText || "rate limited"})`,
      );
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      continue;
    }

    throw new Error(`Binance klines ${response.status}: ${responseText}`);
  }
}

async function loadSymbol(
  prisma: PrismaClient,
  symbol: string,
  startMs: number,
  requestDelayMs: number,
): Promise<{ inserted: number; pages: number; errors: number }> {
  let cursor = startMs;
  let inserted = 0;
  let pages = 0;
  let errors = 0;

  console.log(`[${symbol}] start`);

  for (;;) {
    const { rows, retryErrors } = await fetchKlinesPage(symbol, cursor);
    errors += retryErrors;

    if (rows.length === 0) {
      break;
    }

    const lastOpenTimeMs = rows[rows.length - 1]![0];
    const data = rows.map((kline) => ({
      symbol,
      interval: INTERVAL,
      openTime: new Date(kline[0]),
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
    }));

    const result = await prisma.cryptoPriceCandle.createMany({
      data,
      skipDuplicates: true,
    });

    inserted += result.count;
    pages += 1;
    console.log(
      `[${symbol}] page ${pages}: fetched ${rows.length}, inserted ${result.count}, lastOpen=${formatOpenDate(lastOpenTimeMs)}`,
    );

    if (rows.length < PAGE_LIMIT) {
      break;
    }

    cursor = lastOpenTimeMs + 1;
    await sleep(requestDelayMs);
  }

  return { inserted, pages, errors };
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= tasks.length) {
        return;
      }

      results[currentIndex] = await tasks[currentIndex]!();
    }
  });

  await Promise.all(workers);
  return results;
}

async function loadSymbolsFromDatabase(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.cryptocurrencyList.findMany({
    select: { symbol: true, pairSymbol: true },
    orderBy: { symbol: "asc" },
  });

  return Array.from(
    new Set(rows.map((row) => normalizeSymbol(row.pairSymbol?.trim() || `${row.symbol}USDT`)).filter(Boolean)),
  );
}

function createSymbolStartGate(delayMs: number): () => Promise<void> {
  let nextAllowedAt = 0;

  return async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + delayMs;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const startMs = Number(process.env.START_MS ?? DEFAULT_START_MS);
  const concurrency = parseNumberEnv(process.env.LOAD_CANDLES_CONCURRENCY, DEFAULT_CONCURRENCY);
  const requestDelayMs = parseNumberEnv(process.env.LOAD_CANDLES_DELAY_MS, DEFAULT_REQUEST_DELAY_MS);

  if (!Number.isFinite(startMs)) {
    throw new Error("START_MS must be a number (Unix ms)");
  }

  try {
    const overriddenSymbols = parseSymbolOverride();
    const symbols = overriddenSymbols.length > 0 ? overriddenSymbols : await loadSymbolsFromDatabase(prisma);

    if (symbols.length === 0) {
      console.log("No symbols to process.");
      return;
    }

    console.log(
      `Loading ${symbols.length} symbols from ${new Date(startMs).toISOString()} (concurrency=${concurrency}, requestDelayMs=${requestDelayMs})`,
    );

    const waitForSymbolTurn = createSymbolStartGate(SYMBOL_START_DELAY_MS);
    const tasks = symbols.map(
      (symbol): (() => Promise<SymbolLoadResult>) =>
        async () => {
          await waitForSymbolTurn();
          try {
            const result = await loadSymbol(prisma, symbol, startMs, requestDelayMs);
            console.log(
              `[${symbol}] done. inserted=${result.inserted}, pages=${result.pages}, errors=${result.errors}`,
            );
            return {
              symbol,
              inserted: result.inserted,
              pages: result.pages,
              errors: result.errors,
              failed: false,
            };
          } catch (error) {
            console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
              symbol,
              inserted: 0,
              pages: 0,
              errors: 1,
              failed: true,
            };
          }
        },
    );

    const results = await runWithConcurrency(tasks, concurrency);
    const totalInserted = results.reduce((sum, item) => sum + item.inserted, 0);
    const totalRetryErrors = results.reduce((sum, item) => sum + item.errors, 0);
    const failedSymbols = results.filter((item) => item.failed).length;

    console.log(
      [
        "Historical candle load finished.",
        `processed=${results.length}`,
        `inserted=${totalInserted}`,
        `retryErrors=${totalRetryErrors}`,
        `failedSymbols=${failedSymbols}`,
      ].join(" "),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
