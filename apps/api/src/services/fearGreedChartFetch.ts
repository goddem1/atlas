const CMC_DATA_API = "https://api.coinmarketcap.com/data-api/v3/fear-greed/chart";

export type FearGreedChartPoint = {
  score: number;
  classification: string;
  timestampSec: number;
  btcPrice: number | null;
  btcVolume: number | null;
};

type FearGreedChartRow = {
  score?: number;
  name?: string;
  timestamp?: string | number;
  btcPrice?: string | number;
  btcVolume?: string | number;
};

type FearGreedChartResponse = {
  status?: { error_code?: string; error_message?: string };
  data?: { dataList?: FearGreedChartRow[] };
};

function parseOptionalNumber(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePoint(row: FearGreedChartRow): FearGreedChartPoint | null {
  if (typeof row.score !== "number" || !Number.isFinite(row.score)) return null;

  const timestampSec =
    typeof row.timestamp === "number"
      ? row.timestamp
      : Number.parseInt(String(row.timestamp ?? ""), 10);
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) return null;

  const classification = row.name?.trim();
  if (!classification) return null;

  return {
    score: Math.round(Math.min(100, Math.max(0, row.score))),
    classification,
    timestampSec,
    btcPrice: parseOptionalNumber(row.btcPrice),
    btcVolume: parseOptionalNumber(row.btcVolume),
  };
}

export async function fetchFearGreedChartHistory(options: {
  start: number;
  end: number;
  convertId?: number;
}): Promise<FearGreedChartPoint[]> {
  const url = new URL(CMC_DATA_API);
  url.searchParams.set("start", String(options.start));
  url.searchParams.set("end", String(options.end));
  url.searchParams.set("convertId", String(options.convertId ?? 2781));

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(120_000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Fear&Greed chart fetch failed: HTTP ${res.status}`);
  }

  const body = (await res.json()) as FearGreedChartResponse;
  const errorCode = body.status?.error_code;
  if (errorCode && errorCode !== "0") {
    throw new Error(body.status?.error_message ?? `Fear&Greed chart error: ${errorCode}`);
  }

  const rows = body.data?.dataList ?? [];
  const points: FearGreedChartPoint[] = [];
  for (const row of rows) {
    const point = normalizePoint(row);
    if (point) points.push(point);
  }

  points.sort((a, b) => a.timestampSec - b.timestampSec);
  return points;
}

export function dayFromFearGreedTimestamp(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().slice(0, 10);
}
