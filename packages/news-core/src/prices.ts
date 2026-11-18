import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { DEFAULT_THRESHOLDS } from "./metrics.js";
import { DEFAULT_TESTER, evaluateCall, parseKlines, type Candle, type TesterParams } from "./tester.js";

const HOUR = 60 * 60 * 1000;

export { parseKlines };

export function readTesterParams(value: unknown): TesterParams {
  const raw = value && typeof value === "object" ? (value as Partial<TesterParams>) : {};
  return {
    ...DEFAULT_TESTER,
    ...raw,
    entryValidityHours: { ...DEFAULT_TESTER.entryValidityHours, ...(raw.entryValidityHours ?? {}) },
    maxHoldingDays: { ...DEFAULT_TESTER.maxHoldingDays, ...(raw.maxHoldingDays ?? {}) },
  };
}

export async function testerReady(prisma: PrismaClient): Promise<{ open: boolean; reason: string }> {
  const [labels, precision] = await Promise.all([
    prisma.labelRecord.count(),
    prisma.metricSnapshot.findFirst({
      where: { metricKey: "signal_precision", scopeType: "global" },
      orderBy: { computedAt: "desc" },
    }),
  ]);
  if (labels < DEFAULT_THRESHOLDS.minLabels) {
    return { open: false, reason: `разметок ${labels} из ${DEFAULT_THRESHOLDS.minLabels}` };
  }
  if (precision?.status !== "ok") {
    return { open: false, reason: precision ? `precision сигналов: ${precision.status}` : "precision сигналов ещё не считалась" };
  }
  return { open: true, reason: "ворота разбора пройдены" };
}

async function fetchKlines(symbol: string, interval: "15m" | "1h", start: number, end: number): Promise<Candle[]> {
  const candles: Candle[] = [];
  let cursor = start;
  while (cursor < end) {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${cursor}&endTime=${end}&limit=1000`;
    const response = await fetch(url);
    if (!response.ok) return candles;
    const batch = parseKlines(await response.json());
    if (batch.length === 0) break;
    candles.push(...batch);
    const last = batch[batch.length - 1]?.openTime ?? cursor;
    if (batch.length < 1000 || last <= cursor) break;
    cursor = last + 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return candles;
}

function priceAt(candles: Candle[], postedAt: number, mark: number): { ts: Date; price: number } | null {
  if (mark < postedAt) return null;
  const candle = candles.find((item) => item.openTime >= mark && item.openTime >= postedAt);
  if (!candle) return null;
  return { ts: new Date(candle.openTime), price: candle.close };
}

export async function loadPriceSnapshots(prisma: PrismaClient): Promise<{ symbols: number; points: number }> {
  const [calls, btc] = await Promise.all([
    prisma.call.findMany({ include: { coin: true } }),
    prisma.coin.findUnique({ where: { symbol: "BTC" } }),
  ]);
  const marks = new Map<string, { coinId: string; times: number[] }>();
  const add = (symbol: string, coinId: string, times: number[]) => {
    const row = marks.get(symbol) ?? { coinId, times: [] };
    row.times.push(...times);
    marks.set(symbol, row);
  };
  const now = Date.now();
  for (const call of calls) {
    const symbol = call.coin.binanceSymbol;
    if (!symbol) continue;
    const posted = call.openedAt.getTime();
    const times = [0, 1, 24, 24 * 7, 24 * 30].map((hours) => posted + hours * HOUR).filter((time) => time <= now);
    add(symbol, call.coinId, times);
    if (btc?.binanceSymbol) add(btc.binanceSymbol, btc.id, times);
  }
  let points = 0;
  for (const [symbol, row] of marks) {
    if (row.times.length === 0) continue;
    const start = Math.min(...row.times) - HOUR;
    const end = Math.max(...row.times) + HOUR;
    const candles = await fetchKlines(symbol, "1h", start, end);
    const existing = await prisma.priceSnapshot.findMany({
      where: { coinId: row.coinId, source: "binance", ts: { gte: new Date(start), lte: new Date(end) } },
      select: { ts: true },
    });
    const have = new Set(existing.map((item) => item.ts.getTime()));
    const data = [...new Map(
      row.times
        .map((time) => priceAt(candles, time, time))
        .filter((item): item is { ts: Date; price: number } => item != null && !have.has(item.ts.getTime()))
        .map((item) => [item.ts.getTime(), item]),
    ).values()];
    if (data.length === 0) continue;
    await prisma.priceSnapshot.createMany({
      data: data.map((item) => ({ coinId: row.coinId, ts: item.ts, price: item.price, source: "binance" })),
    });
    points += data.length;
  }
  return { symbols: marks.size, points };
}

export async function evaluateStoredCalls(prisma: PrismaClient, paramSetId: string): Promise<number> {
  const stored = await prisma.paramSet.findUnique({ where: { id: paramSetId } });
  const params = readTesterParams(stored?.paramsJson);
  const [calls, btc] = await Promise.all([
    prisma.call.findMany({
      where: { status: { not: "untestable" }, untestableReason: null },
      include: { coin: true, evaluations: { where: { paramSetId }, select: { id: true } } },
    }),
    prisma.coin.findUnique({ where: { symbol: "BTC" } }),
  ]);
  let created = 0;
  for (const call of calls) {
    if (call.evaluations.length > 0 || !call.coin.binanceSymbol || call.direction === "neutral") continue;
    const postedAt = call.openedAt.getTime();
    const key = call.horizon === "weeks" || call.horizon === "months" ? call.horizon : "days";
    const entryEnd = postedAt + params.entryValidityHours[key] * HOUR;
    const holdEnd = postedAt + params.maxHoldingDays[key] * 24 * HOUR;
    const holdInterval = key === "days" ? "15m" : "1h";
    const [entryCandles, holdCandles, btcCandles] = await Promise.all([
      fetchKlines(call.coin.binanceSymbol, "15m", postedAt, Math.min(Date.now(), entryEnd + HOUR)),
      fetchKlines(call.coin.binanceSymbol, holdInterval, postedAt, Math.min(Date.now(), holdEnd + HOUR)),
      btc?.binanceSymbol ? fetchKlines(btc.binanceSymbol, holdInterval, postedAt, Math.min(Date.now(), holdEnd + HOUR)) : Promise.resolve([]),
    ]);
    const result = evaluateCall({
      postedAt,
      now: Date.now(),
      direction: call.direction,
      horizon: call.horizon,
      entryLow: call.entryLow,
      entryHigh: call.entryHigh,
      stop: call.stop,
      targets: call.targets,
      entryCandles,
      holdCandles,
      btcCandles,
      params,
    });
    await prisma.callEvaluation.create({
      data: {
        callId: call.id,
        paramSetId,
        entryFilledAt: result.entryFilledAt ? new Date(result.entryFilledAt) : null,
        entryPrice: result.entryPrice,
        exitAt: result.exitAt ? new Date(result.exitAt) : null,
        exitPrice: result.exitPrice,
        exitReason: result.exitReason,
        returnPct: result.returnPct,
        rMultiple: result.rMultiple,
        feesPct: result.feesPct,
        slippagePct: result.slippagePct,
        btcReturnPct: result.btcReturnPct,
        coinHoldReturnPct: result.coinHoldReturnPct,
        checkpoints: result.checkpoints ?? undefined,
        maxAdversePct: result.maxAdversePct,
        maxFavorablePct: result.maxFavorablePct,
        status: result.status,
      },
    });
    created += 1;
  }
  return created;
}
