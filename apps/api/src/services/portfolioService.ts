import type { PrismaClient, TransactionType } from "@prisma/client";

export type PortfolioTimeframe = "d" | "m" | "y" | "all";

export type PortfolioChartPoint = { date: string; valueUsd: string };

export type PortfolioChartResponse = {
  timeframe: PortfolioTimeframe;
  points: PortfolioChartPoint[];
};

export type PortfolioSummaryResponse = {
  totalValueUsd: string;
  totalPnlUsd: string;
  assets: Array<{
    symbol: string;
    name: string;
    iconUrl: string;
    currentPriceUsd: string;
    currentValueUsd: string;
    pnlUsd: string;
    coinsHeld: string;
  }>;
};

export type PortfolioTransactionUpsertInput = {
  symbol: string;
  type: "BUY" | "SELL";
  date: string;
  priceUsd: string;
  amountCoins: string;
  amountUsd: string;
  goals?: Array<{ targetPriceUsd: string; sellCoins: string }>;
};

export type PortfolioAssetDetailResponse = {
  symbol: string;
  name: string;
  iconUrl: string;
  averageBuyPriceUsd: string;
  coinsHeld: string;
  transactions: Array<{
    id: string;
    type: "BUY" | "SELL";
    date: string;
    priceUsd: string;
    amountCoins: string;
    amountUsd: string;
    createdAt: string;
    updatedAt: string;
  }>;
  goals: Array<{
    id: string;
    targetPriceUsd: string;
    sellCoins: string;
    potentialProfitUsd: string;
    createdAt: string;
  }>;
};

const BINANCE_TICKER_URL = "https://data-api.binance.vision/api/v3/ticker/price";
const USER_ID = 1;

type AssetSnapshot = {
  symbol: string;
  pairSymbol: string;
  name: string;
  iconUrl: string;
  coinsHeld: number;
  investedUsd: number;
};

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toFixedUsd(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function toFixedPrice(n: number): string {
  return Number.isFinite(n) ? n.toFixed(5) : "0.00000";
}

function toFixedCoins(n: number): string {
  return Number.isFinite(n) ? n.toFixed(8) : "0.00000000";
}

function clampPositive(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n;
}

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calcHoldingsFromTransactions(
  txs: Array<{ type: TransactionType; amountCoins: number; date: Date }>,
): number {
  const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
  let held = 0;
  for (const tx of sorted) {
    held += tx.type === "BUY" ? tx.amountCoins : -tx.amountCoins;
  }
  return held;
}

export function validateSellTimeline(
  txs: Array<{ type: TransactionType; amountCoins: number; date: Date }>,
): void {
  const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
  let held = 0;
  for (const tx of sorted) {
    held += tx.type === "BUY" ? tx.amountCoins : -tx.amountCoins;
    if (held < -1e-8) {
      throw new Error("SELL amount exceeds currently held coins for this asset");
    }
  }
}

async function ensureAssetExistsInDictionary(prisma: PrismaClient, symbol: string): Promise<void> {
  const exists = await prisma.cryptocurrencyList.findUnique({
    where: { symbol },
    select: { id: true },
  });
  if (!exists) {
    throw new Error(`Asset ${symbol} is not in CryptocurrencyList`);
  }
}

export async function fetchCurrentPricesUsd(pairs: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    pairs.map(async (pair) => {
      const url = new URL(BINANCE_TICKER_URL);
      url.searchParams.set("symbol", pair);
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as { price?: string };
      const price = Number(json.price);
      if (Number.isFinite(price)) out.set(pair, price);
    }),
  );
  return out;
}

export function pickResampled(points: PortfolioChartPoint[], timeframe: PortfolioTimeframe): PortfolioChartPoint[] {
  if (points.length <= 1) return points;
  if (timeframe === "d") return points.slice(-30);

  const maxPoints = timeframe === "m" ? 90 : timeframe === "y" ? 140 : 180;
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1]?.date !== last?.date && last) sampled.push(last);
  return sampled;
}

export async function getPortfolioSummary(prisma: PrismaClient): Promise<PortfolioSummaryResponse> {
  const assetsRaw = await prisma.portfolioAsset.findMany({
    where: { userId: USER_ID },
    include: { transactions: true },
    orderBy: { symbol: "asc" },
  });
  // Legacy safety: do not show empty assets with no transactions.
  const assets = assetsRaw.filter((a) => a.transactions.length > 0);
  if (assets.length === 0) {
    return { totalValueUsd: "0.00", totalPnlUsd: "0.00", assets: [] };
  }

  const list = await prisma.cryptocurrencyList.findMany({
    where: { symbol: { in: assets.map((a) => a.symbol) } },
  });
  const bySymbol = new Map(list.map((x) => [x.symbol, x]));

  const snapshots: AssetSnapshot[] = assets.map((asset) => {
    let coinsHeld = 0;
    let investedUsd = 0;
    for (const tx of asset.transactions) {
      const coins = Number(tx.amountCoins);
      const usd = Number(tx.amountUsd);
      if (tx.type === "BUY") {
        coinsHeld += coins;
        investedUsd += usd;
      } else {
        coinsHeld -= coins;
        investedUsd -= usd;
      }
    }
    const info = bySymbol.get(asset.symbol);
    const pairSymbol = (info?.pairSymbol?.trim() || `${asset.symbol}USDT`).toUpperCase();
    return {
      symbol: asset.symbol,
      pairSymbol,
      name: info?.name ?? asset.symbol,
      iconUrl: info?.iconUrl ?? "/assets/crypto/USDT.svg",
      coinsHeld,
      investedUsd,
    };
  });

  const priceMap = await fetchCurrentPricesUsd(snapshots.map((s) => s.pairSymbol));
  const view = snapshots.map((s) => {
    const currentPrice = priceMap.get(s.pairSymbol) ?? 0;
    const currentValue = s.coinsHeld * currentPrice;
    const pnl = currentValue - s.investedUsd;
    return {
      symbol: s.symbol,
      name: s.name,
      iconUrl: s.iconUrl,
      currentPriceUsd: toFixedUsd(currentPrice),
      currentValueUsd: toFixedUsd(currentValue),
      pnlUsd: toFixedUsd(pnl),
      coinsHeld: toFixedCoins(s.coinsHeld),
    };
  });

  view.sort((a, b) => Number(b.currentValueUsd) - Number(a.currentValueUsd));
  const totalValue = view.reduce((acc, x) => acc + Number(x.currentValueUsd), 0);
  const totalPnl = view.reduce((acc, x) => acc + Number(x.pnlUsd), 0);
  return { totalValueUsd: toFixedUsd(totalValue), totalPnlUsd: toFixedUsd(totalPnl), assets: view };
}

export async function validateAndCreateTransaction(
  prisma: PrismaClient,
  input: PortfolioTransactionUpsertInput,
): Promise<{ id: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const txType = input.type;
  const date = new Date(input.date);
  const priceUsd = clampPositive(Number(input.priceUsd));
  const amountCoins = clampPositive(Number(input.amountCoins));
  const amountUsd = clampPositive(Number(input.amountUsd));

  if (!symbol) throw new Error("symbol is required");
  await ensureAssetExistsInDictionary(prisma, symbol);
  if (txType !== "BUY" && txType !== "SELL") throw new Error("type must be BUY or SELL");
  if (Number.isNaN(date.getTime())) throw new Error("date is invalid");
  if (!Number.isFinite(priceUsd) || !Number.isFinite(amountCoins) || !Number.isFinite(amountUsd)) {
    throw new Error("priceUsd, amountCoins, amountUsd must be positive");
  }

  let asset = await prisma.portfolioAsset.findUnique({
    where: { userId_symbol: { userId: USER_ID, symbol } },
  });
  if (!asset) {
    asset = await prisma.portfolioAsset.create({
      data: { userId: USER_ID, symbol },
    });
  }

  if (txType === "SELL") {
    const txs = await prisma.transaction.findMany({
      where: { assetId: asset.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    validateSellTimeline([
      ...txs.map((tx) => ({
        date: tx.date,
        type: tx.type,
        amountCoins: Number(tx.amountCoins),
      })),
      { date, type: txType as TransactionType, amountCoins },
    ]);
  }

  const created = await prisma.transaction.create({
    data: {
      assetId: asset.id,
      type: txType,
      date,
      priceUsd: priceUsd.toString(),
      amountCoins: amountCoins.toString(),
      amountUsd: amountUsd.toString(),
    },
    select: { id: true },
  });
  if (Array.isArray(input.goals) && input.goals.length > 0) {
    const rows = input.goals
      .map((g) => ({
        target: Number(g.targetPriceUsd),
        sellCoins: Number(g.sellCoins),
      }))
      .filter((x) => Number.isFinite(x.target) && x.target > 0 && Number.isFinite(x.sellCoins) && x.sellCoins > 0)
      .map((x) => ({
        assetId: asset.id,
        targetPriceUsd: x.target.toString(),
        sellCoins: x.sellCoins.toString(),
      }));
    if (rows.length > 0) {
      await prisma.goal.createMany({ data: rows });
    }
  }
  return created;
}

export async function getPortfolioChart(
  prisma: PrismaClient,
  timeframe: PortfolioTimeframe,
): Promise<PortfolioChartResponse> {
  const assets = await prisma.portfolioAsset.findMany({
    where: { userId: USER_ID },
    include: { transactions: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
    orderBy: { symbol: "asc" },
  });
  if (assets.length === 0) return { timeframe, points: [] };

  const firstTx = assets
    .flatMap((a) => a.transactions.map((t) => t.date))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!firstTx) return { timeframe, points: [] };

  const list = await prisma.cryptocurrencyList.findMany({
    where: { symbol: { in: assets.map((a) => a.symbol) } },
  });
  const pairBySymbol = new Map(
    list.map((x) => [x.symbol, (x.pairSymbol?.trim() || `${x.symbol}USDT`).toUpperCase()]),
  );
  const pairs = Array.from(new Set(assets.map((a) => pairBySymbol.get(a.symbol) ?? `${a.symbol}USDT`)));

  const candleRows = await prisma.cryptoPriceCandle.findMany({
    where: {
      interval: "1d",
      symbol: { in: pairs },
      openTime: { gte: new Date(toDayKey(firstTx)) },
    },
    orderBy: [{ openTime: "asc" }],
  });
  if (candleRows.length === 0) return { timeframe, points: [] };

  const closeByPairAndDay = new Map<string, Map<string, number>>();
  for (const row of candleRows) {
    const day = toDayKey(row.openTime);
    const close = Number(row.close);
    if (!Number.isFinite(close)) continue;
    const m = closeByPairAndDay.get(row.symbol) ?? new Map<string, number>();
    m.set(day, close);
    closeByPairAndDay.set(row.symbol, m);
  }

  const events = new Map<string, Array<{ pair: string; deltaCoins: number }>>();
  for (const asset of assets) {
    const pair = pairBySymbol.get(asset.symbol) ?? `${asset.symbol}USDT`;
    for (const tx of asset.transactions) {
      const day = toDayKey(tx.date);
      const delta = Number(tx.amountCoins) * (tx.type === "BUY" ? 1 : -1);
      const arr = events.get(day) ?? [];
      arr.push({ pair, deltaCoins: delta });
      events.set(day, arr);
    }
  }

  const startDay = new Date(toDayKey(firstTx));
  const lastDay = new Date(toDayKey(candleRows[candleRows.length - 1]!.openTime));
  const holdings = new Map<string, number>();
  const lastClose = new Map<string, number>();
  const points: PortfolioChartPoint[] = [];

  for (let d = startDay; d.getTime() <= lastDay.getTime(); d = plusDays(d, 1)) {
    const day = toDayKey(d);
    const dayEvents = events.get(day) ?? [];
    for (const e of dayEvents) {
      holdings.set(e.pair, (holdings.get(e.pair) ?? 0) + e.deltaCoins);
    }

    let total = 0;
    for (const pair of pairs) {
      const closeToday = closeByPairAndDay.get(pair)?.get(day);
      if (closeToday !== undefined) lastClose.set(pair, closeToday);
      const close = lastClose.get(pair);
      if (close === undefined) continue;
      const held = holdings.get(pair) ?? 0;
      total += held * close;
    }
    points.push({ date: day, valueUsd: toFixedUsd(total) });
  }

  return { timeframe, points: pickResampled(points, timeframe) };
}

export async function getPortfolioAssetDetail(
  prisma: PrismaClient,
  symbolRaw: string,
): Promise<PortfolioAssetDetailResponse> {
  const symbol = symbolRaw.trim().toUpperCase();
  const asset = await prisma.portfolioAsset.findUnique({
    where: { userId_symbol: { userId: USER_ID, symbol } },
    include: {
      transactions: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      goals: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!asset) throw new Error("Asset not found in portfolio");

  const info = await prisma.cryptocurrencyList.findUnique({
    where: { symbol },
    select: { name: true, iconUrl: true },
  });

  const txRows = asset.transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    date: toIsoDateOnly(tx.date),
    priceUsd: tx.priceUsd.toString(),
    amountCoins: tx.amountCoins.toString(),
    amountUsd: tx.amountUsd.toString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  }));

  const txForMath = asset.transactions.map((tx) => ({
    type: tx.type,
    amountCoins: Number(tx.amountCoins),
    date: tx.date,
  }));
  const coinsHeld = calcHoldingsFromTransactions(txForMath);

  let buyCoins = 0;
  let buyNotional = 0;
  for (const tx of asset.transactions) {
    if (tx.type === "BUY") {
      const c = Number(tx.amountCoins);
      const usd = Number(tx.amountUsd);
      if (Number.isFinite(c) && c > 0) {
        buyCoins += c;
        if (Number.isFinite(usd) && usd > 0) {
          buyNotional += usd;
        } else {
          buyNotional += Number(tx.priceUsd) * c;
        }
      }
    }
  }
  const avgBuy = buyCoins > 0 ? buyNotional / buyCoins : 0;

  const goals = asset.goals.map((g) => ({
    id: g.id,
    targetPriceUsd: g.targetPriceUsd.toString(),
    sellCoins: g.sellCoins.toString(),
    potentialProfitUsd: toFixedUsd((Number(g.targetPriceUsd) - avgBuy) * Number(g.sellCoins)),
    createdAt: g.createdAt.toISOString(),
  }));

  return {
    symbol,
    name: info?.name ?? symbol,
    iconUrl: info?.iconUrl ?? "/assets/crypto/USDT.svg",
    averageBuyPriceUsd: toFixedPrice(avgBuy),
    coinsHeld: toFixedCoins(coinsHeld),
    transactions: txRows,
    goals,
  };
}

export async function updatePortfolioTransaction(
  prisma: PrismaClient,
  id: string,
  input: Omit<PortfolioTransactionUpsertInput, "symbol">,
): Promise<void> {
  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { portfolioAsset: true },
  });
  if (!existing || existing.portfolioAsset.userId !== USER_ID) {
    throw new Error("Transaction not found");
  }

  const txType = input.type;
  const date = new Date(input.date);
  const priceUsd = clampPositive(Number(input.priceUsd));
  const amountCoins = clampPositive(Number(input.amountCoins));
  const amountUsd = clampPositive(Number(input.amountUsd));
  if (txType !== "BUY" && txType !== "SELL") throw new Error("type must be BUY or SELL");
  if (Number.isNaN(date.getTime())) throw new Error("date is invalid");
  if (!Number.isFinite(priceUsd) || !Number.isFinite(amountCoins) || !Number.isFinite(amountUsd)) {
    throw new Error("priceUsd, amountCoins, amountUsd must be positive");
  }

  const txs = await prisma.transaction.findMany({
    where: { assetId: existing.assetId, NOT: { id } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  validateSellTimeline([
    ...txs.map((tx) => ({
      date: tx.date,
      type: tx.type,
      amountCoins: Number(tx.amountCoins),
    })),
    { date, type: txType as TransactionType, amountCoins },
  ]);

  await prisma.transaction.update({
    where: { id },
    data: {
      type: txType,
      date,
      priceUsd: priceUsd.toString(),
      amountCoins: amountCoins.toString(),
      amountUsd: amountUsd.toString(),
    },
  });
}

export async function deletePortfolioTransaction(prisma: PrismaClient, id: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { portfolioAsset: true },
  });
  if (!existing || existing.portfolioAsset.userId !== USER_ID) {
    throw new Error("Transaction not found");
  }
  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });
    const remaining = await tx.transaction.count({ where: { assetId: existing.assetId } });
    if (remaining === 0) {
      await tx.portfolioAsset.delete({
        where: { id: existing.assetId },
      });
    }
  });
}

export async function addPortfolioGoal(
  prisma: PrismaClient,
  symbolRaw: string,
  targetPriceUsdRaw: string,
): Promise<{ id: string }> {
  const symbol = symbolRaw.trim().toUpperCase();
  const target = clampPositive(Number(targetPriceUsdRaw));
  if (!Number.isFinite(target)) throw new Error("targetPriceUsd must be positive");

  const asset = await prisma.portfolioAsset.findUnique({
    where: { userId_symbol: { userId: USER_ID, symbol } },
    select: { id: true },
  });
  if (!asset) throw new Error("Asset not found in portfolio");

  const created = await prisma.goal.create({
    data: { assetId: asset.id, targetPriceUsd: target.toString() },
    select: { id: true },
  });
  return created;
}

export async function deletePortfolioGoal(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.goal.delete({ where: { id } });
}
