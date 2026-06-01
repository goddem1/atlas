import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";

type FredObservation = {
  date: string;
  value: string;
};

type FredObservationsResponse = {
  observations: FredObservation[];
  count: number;
};

async function fetchObservations(
  seriesId: string,
  apiKey: string,
  observationStart?: string,
  observationEnd?: string,
): Promise<FredObservation[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "asc",
    limit: "100000",
  });
  if (observationStart) params.set("observation_start", observationStart);
  if (observationEnd) params.set("observation_end", observationEnd);
  const res = await fetch(`${FRED_OBSERVATIONS_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`FRED observations ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as FredObservationsResponse;
  return body.observations ?? [];
}

function parseCloseTime(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d;
}

async function main(): Promise<void> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FRED_API_KEY is required in apps/api/.env");
  }

  const seriesId = process.env.FRED_SERIES_ID?.trim() ?? "DGS30";
  const symbol = process.env.BONDS_SYMBOL?.trim() ?? "30Y";
  const interval = process.env.BONDS_INTERVAL?.trim() ?? "1D";
  const observationStart = process.env.FRED_OBSERVATION_START?.trim();
  const observationEnd = process.env.FRED_OBSERVATION_END?.trim();

  const rangeLabel =
    observationStart || observationEnd
      ? ` range ${observationStart ?? "…"}–${observationEnd ?? "…"}`
      : "";

  console.log(
    `[bonds] FRED series=${seriesId} → BondsPrices symbol=${symbol} interval=${interval}${rangeLabel}`,
  );

  const observations = await fetchObservations(
    seriesId,
    apiKey,
    observationStart,
    observationEnd,
  );
  console.log(`[bonds] fetched ${observations.length} observations from FRED`);

  const data: { symbol: string; interval: string; closeTime: Date; close: string }[] = [];
  let skipped = 0;

  for (const row of observations) {
    const v = row.value?.trim();
    if (!v || v === ".") {
      skipped += 1;
      continue;
    }
    data.push({
      symbol,
      interval,
      closeTime: parseCloseTime(row.date),
      close: v,
    });
  }

  const prisma = new PrismaClient();
  try {
    const batchSize = 2000;
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const result = await prisma.bondsPrices.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += result.count;
      console.log(`[bonds] batch ${Math.floor(i / batchSize) + 1}: inserted ${result.count}`);
    }
    console.log(`[bonds] done: inserted ${inserted}, skipped missing ${skipped}, total valid ${data.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
