import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BINANCE_DATA_URL = "https://data-api.binance.vision/api/v3/klines";
const PAGE_LIMIT = 1000;
const INTERVAL = "1d";

/** Ответ klines: [openTime, open, high, low, close, volume, closeTime, ...] */
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

async function fetchKlinesPage(symbol: string, startTimeMs: number): Promise<KlineTuple[]> {
  const params = new URLSearchParams({
    symbol,
    interval: INTERVAL,
    startTime: String(startTimeMs),
    limit: String(PAGE_LIMIT),
    timeZone: "3",
  });
  const res = await fetch(`${BINANCE_DATA_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Binance klines ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as KlineTuple[];
}

async function main(): Promise<void> {
  const symbol = process.env.SYMBOL ?? "BTCUSDT";
  const startMs = Number(process.env.START_MS ?? 1514764800000);
  if (!Number.isFinite(startMs)) {
    throw new Error("START_MS must be a number (Unix ms)");
  }

  const prisma = new PrismaClient();
  let cursor = startMs;
  let inserted = 0;
  let pages = 0;

  try {
    for (;;) {
      const rows = await fetchKlinesPage(symbol, cursor);
      if (rows.length === 0) break;

      const lastOpen = rows[rows.length - 1]![0]!;
      const data = rows.map((k) => ({
        symbol,
        interval: INTERVAL,
        openTime: new Date(k[0]!),
        open: k[1]!,
        high: k[2]!,
        low: k[3]!,
        close: k[4]!,
        volume: k[5]!,
      }));

      const result = await prisma.cryptoPriceCandle.createMany({
        data,
        skipDuplicates: true,
      });
      inserted += result.count;
      pages += 1;
      console.log(
        `page ${pages}: fetched ${rows.length}, inserted ${result.count}, lastOpen=${new Date(lastOpen).toISOString()}`,
      );

      if (rows.length < PAGE_LIMIT) break;

      cursor = lastOpen + 1;
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log(`Done. New rows inserted (duplicates skipped): ${inserted}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
