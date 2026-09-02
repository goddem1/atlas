import { Prisma, type PrismaClient } from "@prisma/client";
import { calcTradePnl, parseTradeQuantityUnit } from "./tradeCalc.js";

export type TradePeriod = "day" | "month" | "year" | "all";

export type TradeResponse = {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  quantityUnit: "coins" | "usd";
  entryAt: string;
  exitAt: string | null;
  commission: string;
  fundingFee: string;
  reason: string | null;
  comment: unknown;
  createdAt: string;
  updatedAt: string;
  pnlUsd: number;
  pnlPercent: number;
};

export type TradeUpsertInput = {
  symbol?: string;
  direction?: string;
  entryPrice?: unknown;
  exitPrice?: unknown;
  quantity?: unknown;
  quantityUnit?: unknown;
  entryAt?: string;
  exitAt?: string | null;
  commission?: unknown;
  fundingFee?: unknown;
  reason?: string | null;
  comment?: unknown;
};

export type TradeListQuery = {
  symbol?: string;
  direction?: string;
  from?: string;
  to?: string;
  pnlMin?: string;
  pnlMax?: string;
  period?: TradePeriod;
};

export type EquityCurvePoint = {
  date: string;
  cumulativePnl: number;
};

function parsePeriod(raw: string | undefined): TradePeriod {
  const v = raw?.trim().toLowerCase();
  if (v === "day" || v === "d") return "day";
  if (v === "month" || v === "m") return "month";
  if (v === "year" || v === "y") return "year";
  return "all";
}

export { parsePeriod };

function periodStartDate(period: TradePeriod): Date | null {
  const now = new Date();
  if (period === "all") return null;
  if (period === "day") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "month") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 365);
  return d;
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildWhere(userId: string, query: TradeListQuery): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = { userId };
  const symbol = query.symbol?.trim().toUpperCase();
  if (symbol) where.symbol = symbol;
  const direction = query.direction?.trim().toLowerCase();
  if (direction === "long" || direction === "short") where.direction = direction;

  const exitAt: Prisma.DateTimeFilter = {};
  const period = query.period ? parsePeriod(query.period) : "all";
  const periodStart = periodStartDate(period);
  if (periodStart) exitAt.gte = periodStart;
  if (query.from) {
    const from = new Date(query.from);
    if (Number.isFinite(from.getTime())) exitAt.gte = from;
  }
  if (query.to) {
    const to = new Date(query.to);
    if (Number.isFinite(to.getTime())) exitAt.lte = to;
  }
  if (Object.keys(exitAt).length > 0) {
    const entryAt: Prisma.DateTimeFilter = { ...exitAt };
    where.OR = [{ exitAt }, { exitAt: null, entryAt }];
  }
  return where;
}

function decimalToString(value: Prisma.Decimal): string {
  return value.toString();
}

function mapTrade(row: {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: Prisma.Decimal;
  exitPrice: Prisma.Decimal;
  quantity: Prisma.Decimal;
  quantityUnit: string;
  entryAt: Date;
  exitAt: Date | null;
  commission: Prisma.Decimal;
  fundingFee: Prisma.Decimal;
  reason: string | null;
  comment: unknown;
  createdAt: Date;
  updatedAt: Date;
}): TradeResponse {
  const { pnlUsd, pnlPercent } = calcTradePnl(row);
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    entryPrice: decimalToString(row.entryPrice),
    exitPrice: decimalToString(row.exitPrice),
    quantity: decimalToString(row.quantity),
    quantityUnit: parseTradeQuantityUnit(row.quantityUnit),
    entryAt: row.entryAt.toISOString(),
    exitAt: row.exitAt?.toISOString() ?? null,
    commission: decimalToString(row.commission),
    fundingFee: decimalToString(row.fundingFee),
    reason: row.reason,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pnlUsd,
    pnlPercent,
  };
}

function parsePositiveDecimal(value: unknown, field: string): Prisma.Decimal {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} must be a positive number`);
  return new Prisma.Decimal(n);
}

function parseUsdAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return 0;
  return Number(text);
}

function parseNonNegativeDecimal(value: unknown, field: string, fallback = 0): Prisma.Decimal {
  if (value == null || value === "") return new Prisma.Decimal(fallback);
  const n = parseUsdAmount(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be zero or greater`);
  return new Prisma.Decimal(n);
}

function parseDirection(value: unknown): "long" | "short" {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "long" || v === "short") return v;
  throw new Error("direction must be long or short");
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) throw new Error(`${field} is invalid`);
  return dt;
}

function normalizeSymbol(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("symbol is required");
  return value.trim().toUpperCase().replace(/USDT$/i, "") + "USDT";
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) return null;
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) throw new Error(`${field} is invalid`);
  return dt;
}

function validateTradeTimes(entryAt: Date, exitAt: Date | null): void {
  if (!exitAt) return;
  if (exitAt.getTime() <= entryAt.getTime()) {
    throw new Error("exitAt must be after entryAt");
  }
}

function parseTradeCreateInput(input: TradeUpsertInput): Omit<Prisma.TradeCreateInput, "user"> {
  const entryAt = parseDate(input.entryAt, "entryAt");
  const exitAt = parseOptionalDate(input.exitAt, "exitAt");
  validateTradeTimes(entryAt, exitAt);
  const reason =
    input.reason == null || input.reason === ""
      ? null
      : typeof input.reason === "string"
        ? input.reason.trim()
        : null;
  return {
    symbol: normalizeSymbol(input.symbol),
    direction: parseDirection(input.direction),
    entryPrice: parsePositiveDecimal(input.entryPrice, "entryPrice"),
    exitPrice: parsePositiveDecimal(input.exitPrice, "exitPrice"),
    quantity: parsePositiveDecimal(input.quantity, "quantity"),
    quantityUnit: parseTradeQuantityUnit(input.quantityUnit),
    entryAt,
    exitAt,
    commission: parseNonNegativeDecimal(input.commission, "commission"),
    fundingFee: parseNonNegativeDecimal(input.fundingFee, "fundingFee"),
    reason,
    ...(input.comment !== undefined ? { comment: input.comment as Prisma.InputJsonValue } : {}),
  };
}

function parseTradeUpdateInput(input: TradeUpsertInput): Prisma.TradeUpdateInput {
  const data: Prisma.TradeUpdateInput = {};
  if (input.symbol !== undefined) data.symbol = normalizeSymbol(input.symbol);
  if (input.direction !== undefined) data.direction = parseDirection(input.direction);
  if (input.entryPrice !== undefined) data.entryPrice = parsePositiveDecimal(input.entryPrice, "entryPrice");
  if (input.exitPrice !== undefined) data.exitPrice = parsePositiveDecimal(input.exitPrice, "exitPrice");
  if (input.quantity !== undefined) data.quantity = parsePositiveDecimal(input.quantity, "quantity");
  if (input.quantityUnit !== undefined) data.quantityUnit = parseTradeQuantityUnit(input.quantityUnit);
  if (input.entryAt !== undefined) data.entryAt = parseDate(input.entryAt, "entryAt");
  if (input.exitAt !== undefined) {
    data.exitAt = parseOptionalDate(input.exitAt, "exitAt");
  }
  if (input.commission !== undefined) data.commission = parseNonNegativeDecimal(input.commission, "commission");
  if (input.fundingFee !== undefined) data.fundingFee = parseNonNegativeDecimal(input.fundingFee, "fundingFee");
  if (input.reason !== undefined) {
    data.reason =
      input.reason == null || input.reason === "" ? null : String(input.reason).trim();
  }
  if (input.comment !== undefined) data.comment = input.comment as Prisma.InputJsonValue;
  return data;
}

export async function listUserTrades(
  prisma: PrismaClient,
  userId: string,
  query: TradeListQuery,
): Promise<TradeResponse[]> {
  const rows = await prisma.trade.findMany({
    where: buildWhere(userId, query),
    orderBy: [{ exitAt: { sort: "desc", nulls: "first" } }, { entryAt: "desc" }],
  });
  const pnlMin = parseOptionalNumber(query.pnlMin);
  const pnlMax = parseOptionalNumber(query.pnlMax);
  return rows
    .map(mapTrade)
    .filter((trade) => {
      if (pnlMin != null && trade.pnlUsd < pnlMin) return false;
      if (pnlMax != null && trade.pnlUsd > pnlMax) return false;
      return true;
    });
}

export async function getUserTrade(
  prisma: PrismaClient,
  userId: string,
  tradeId: string,
): Promise<TradeResponse | null> {
  const row = await prisma.trade.findFirst({ where: { id: tradeId, userId } });
  return row ? mapTrade(row) : null;
}

export async function createUserTrade(
  prisma: PrismaClient,
  userId: string,
  input: TradeUpsertInput,
): Promise<TradeResponse> {
  const parsed = parseTradeCreateInput(input);
  const row = await prisma.trade.create({
    data: {
      ...parsed,
      user: { connect: { id: userId } },
    },
  });
  return mapTrade(row);
}

export async function updateUserTrade(
  prisma: PrismaClient,
  userId: string,
  tradeId: string,
  input: TradeUpsertInput,
): Promise<TradeResponse | null> {
  const existing = await prisma.trade.findFirst({ where: { id: tradeId, userId } });
  if (!existing) return null;

  const data = parseTradeUpdateInput(input);
  const entryAt = (data.entryAt as Date | undefined) ?? existing.entryAt;
  const exitAt =
    data.exitAt !== undefined ? (data.exitAt as Date | null) : existing.exitAt;
  validateTradeTimes(entryAt, exitAt);

  const row = await prisma.trade.update({ where: { id: tradeId }, data });
  return mapTrade(row);
}

export async function deleteUserTrade(
  prisma: PrismaClient,
  userId: string,
  tradeId: string,
): Promise<boolean> {
  const existing = await prisma.trade.findFirst({ where: { id: tradeId, userId }, select: { id: true } });
  if (!existing) return false;
  await prisma.trade.delete({ where: { id: tradeId } });
  return true;
}

export async function getTradeEquityCurve(
  prisma: PrismaClient,
  userId: string,
  periodRaw: string | undefined,
): Promise<EquityCurvePoint[]> {
  const period = parsePeriod(periodRaw);
  const rows = await prisma.trade.findMany({
    where: { ...buildWhere(userId, { period }), exitAt: { not: null } },
    orderBy: { exitAt: "asc" },
  });
  let cumulative = 0;
  return rows.map((row) => {
    cumulative += calcTradePnl(row).pnlUsd;
    return {
      date: row.exitAt!.toISOString(),
      cumulativePnl: cumulative,
    };
  });
}

export async function getTradeSummary(
  prisma: PrismaClient,
  userId: string,
  periodRaw: string | undefined,
): Promise<{ totalPnlUsd: number; tradeCount: number }> {
  const trades = await listUserTrades(prisma, userId, { period: parsePeriod(periodRaw) });
  const totalPnlUsd = trades.reduce((sum, t) => sum + t.pnlUsd, 0);
  return { totalPnlUsd, tradeCount: trades.length };
}
