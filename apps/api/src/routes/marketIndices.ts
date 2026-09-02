import type { FastifyInstance } from "fastify";
import type { CmcDailySnapshot, PrismaClient } from "@prisma/client";
import type {
  CmcDailySnapshotHistoryField,
  CmcDailySnapshotHistoryPoint,
  CmcDailySnapshotLatestResponse,
  FundingRateEntry,
} from "@atlas-v1/shared";
import {
  isSupportedMarketIndexDailyBarId,
  listMarketIndexDailyBars,
} from "../services/marketIndexDailyBarList.js";
import { getMarketIndicesLatestLive } from "../services/cmcMarketIndicesLive.js";
import { listFearGreedDailyBars } from "../services/fearGreedDailyBarList.js";
import { TV_MARKET_INDEX_SYMBOLS } from "../services/tradingViewPriceFetch.js";

const HISTORY_FIELDS: Record<CmcDailySnapshotHistoryField, true> = {
  fearGreedValue: true,
  btcDominance: true,
  ethDominance: true,
  totalMarketCap: true,
  altcoinMarketCap: true,
  btcMarketCap: true,
  ethMarketCap: true,
  total3MarketCap: true,
  altcoinSeasonIndex: true,
  altcoinSeasonMarketCap: true,
};

function clampDays(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? "30"), 10);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
}

function isHistoryField(value: string): value is CmcDailySnapshotHistoryField {
  return Object.prototype.hasOwnProperty.call(HISTORY_FIELDS, value);
}

function serializeLatest(row: CmcDailySnapshot): CmcDailySnapshotLatestResponse {
  return {
    day: row.day,
    fearGreedValue: row.fearGreedValue,
    fearGreedClassification: row.fearGreedClassification,
    btcDominance: row.btcDominance.toString(),
    ethDominance: row.ethDominance.toString(),
    totalMarketCap: row.totalMarketCap.toString(),
    altcoinMarketCap: row.altcoinMarketCap.toString(),
    btcMarketCap: row.btcMarketCap.toString(),
    ethMarketCap: row.ethMarketCap.toString(),
    total3MarketCap: row.total3MarketCap.toString(),
    altcoinSeasonIndex: row.altcoinSeasonIndex,
    altcoinSeasonMarketCap: row.altcoinSeasonMarketCap?.toString() ?? null,
    fundingRates: row.fundingRates as unknown as FundingRateEntry[],
    createdAt: row.createdAt.toISOString(),
  };
}

function toHistoryPoint(
  field: CmcDailySnapshotHistoryField,
  row: CmcDailySnapshot,
): CmcDailySnapshotHistoryPoint {
  switch (field) {
    case "fearGreedValue":
      return { day: row.day, value: row.fearGreedValue };
    case "btcDominance":
      return { day: row.day, value: row.btcDominance.toString() };
    case "ethDominance":
      return { day: row.day, value: row.ethDominance.toString() };
    case "totalMarketCap":
      return { day: row.day, value: row.totalMarketCap.toString() };
    case "altcoinMarketCap":
      return { day: row.day, value: row.altcoinMarketCap.toString() };
    case "btcMarketCap":
      return { day: row.day, value: row.btcMarketCap.toString() };
    case "ethMarketCap":
      return { day: row.day, value: row.ethMarketCap.toString() };
    case "total3MarketCap":
      return { day: row.day, value: row.total3MarketCap.toString() };
    case "altcoinSeasonIndex":
      return { day: row.day, value: row.altcoinSeasonIndex };
    case "altcoinSeasonMarketCap":
      return { day: row.day, value: row.altcoinSeasonMarketCap?.toString() ?? null };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export function registerMarketIndicesRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/market-indices/latest", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");

    const live = await getMarketIndicesLatestLive();
    if (live) return live;

    const latest = await prisma.cmcDailySnapshot.findFirst({
      orderBy: { day: "desc" },
    });
    if (!latest) {
      return reply.status(404).send({ error: "No market index snapshots yet" });
    }
    return serializeLatest(latest);
  });

  app.get<{
    Querystring: { field?: string; days?: string };
  }>("/market-indices/history", async (req, reply) => {
    const field = req.query.field?.trim() ?? "";
    const days = clampDays(req.query.days);

    if (!isHistoryField(field)) {
      return reply.status(400).send({
        error: "query field is required and must be a supported market index field",
        fields: Object.keys(HISTORY_FIELDS),
      });
    }

    reply.header("Cache-Control", "no-store");

    const rows = await prisma.cmcDailySnapshot.findMany({
      orderBy: { day: "desc" },
      take: days,
    });

    const points = [...rows].reverse().map((row) => toHistoryPoint(field, row));

    return { field, days: points.length, points };
  });

  app.get<{
    Querystring: { indexId?: string; limit?: string; from?: string; to?: string };
  }>("/market-indices/bars", async (req, reply) => {
    const indexId = req.query.indexId?.trim() ?? "";
    if (!indexId || !isSupportedMarketIndexDailyBarId(indexId)) {
      return reply.status(400).send({
        error: "query indexId is required and must be a supported market index",
        indexIds: Object.keys(TV_MARKET_INDEX_SYMBOLS),
      });
    }

    reply.header("Cache-Control", "no-store");

    return listMarketIndexDailyBars(prisma, {
      indexId,
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined,
      from: req.query.from,
      to: req.query.to,
    });
  });

  app.get<{
    Querystring: { limit?: string; from?: string; to?: string };
  }>("/market-indices/fear-greed/history", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    return listFearGreedDailyBars(prisma, {
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined,
      from: req.query.from,
      to: req.query.to,
    });
  });
}
