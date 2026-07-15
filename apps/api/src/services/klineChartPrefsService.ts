import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  KlineDrawingToolPin,
  KlineStoredIndicators,
  KlineStoredOverlay,
} from "@atlas-v1/shared";
import {
  normalizeKlineDrawingPins,
  normalizeKlineIndicators,
  normalizeKlineOverlays,
  normalizeKlinePairSymbol,
} from "@atlas-v1/shared";

function pinsToJson(pins: KlineDrawingToolPin[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(pins)) as Prisma.InputJsonValue;
}

function parseStoredPins(raw: Prisma.JsonValue | null | undefined): KlineDrawingToolPin[] {
  return normalizeKlineDrawingPins(raw);
}

export async function getUserKlineDrawingPins(
  prisma: PrismaClient,
  userId: string,
): Promise<KlineDrawingToolPin[]> {
  const row = await prisma.userKlineChartPrefs.findUnique({
    where: { userId },
    select: { drawingToolPins: true },
  });
  if (!row) return [];
  return parseStoredPins(row.drawingToolPins);
}

export async function saveUserKlineDrawingPins(
  prisma: PrismaClient,
  userId: string,
  pins: KlineDrawingToolPin[],
): Promise<KlineDrawingToolPin[]> {
  const normalized = normalizeKlineDrawingPins(pins);

  await prisma.userKlineChartPrefs.upsert({
    where: { userId },
    create: {
      userId,
      drawingToolPins: pinsToJson(normalized),
    },
    update: {
      drawingToolPins: pinsToJson(normalized),
    },
  });

  return normalized;
}

function overlaysToJson(overlays: KlineStoredOverlay[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(overlays)) as Prisma.InputJsonValue;
}

function parseStoredOverlays(raw: Prisma.JsonValue | null | undefined): KlineStoredOverlay[] {
  return normalizeKlineOverlays(raw);
}

export async function getUserKlineOverlays(
  prisma: PrismaClient,
  userId: string,
  pair: string,
): Promise<KlineStoredOverlay[]> {
  const normalizedPair = normalizeKlinePairSymbol(pair);
  const row = await prisma.userKlineChartOverlays.findUnique({
    where: { userId_pair: { userId, pair: normalizedPair } },
    select: { overlays: true },
  });
  if (!row) return [];
  return parseStoredOverlays(row.overlays);
}

export async function saveUserKlineOverlays(
  prisma: PrismaClient,
  userId: string,
  pair: string,
  overlays: KlineStoredOverlay[],
): Promise<KlineStoredOverlay[]> {
  const normalizedPair = normalizeKlinePairSymbol(pair);
  const normalized = normalizeKlineOverlays(overlays);

  if (normalized.length === 0) {
    await prisma.userKlineChartOverlays.deleteMany({
      where: { userId, pair: normalizedPair },
    });
    return [];
  }

  await prisma.userKlineChartOverlays.upsert({
    where: { userId_pair: { userId, pair: normalizedPair } },
    create: {
      userId,
      pair: normalizedPair,
      overlays: overlaysToJson(normalized),
    },
    update: {
      overlays: overlaysToJson(normalized),
    },
  });

  return normalized;
}

function indicatorsToJson(indicators: KlineStoredIndicators): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(indicators)) as Prisma.InputJsonValue;
}

function parseStoredIndicators(raw: Prisma.JsonValue | null | undefined): KlineStoredIndicators | null {
  return normalizeKlineIndicators(raw);
}

export async function getUserKlineIndicators(
  prisma: PrismaClient,
  userId: string,
  pair: string,
): Promise<KlineStoredIndicators | null> {
  const normalizedPair = normalizeKlinePairSymbol(pair);
  const row = await prisma.userKlineChartIndicators.findUnique({
    where: { userId_pair: { userId, pair: normalizedPair } },
    select: { indicators: true },
  });
  if (!row) return null;
  return parseStoredIndicators(row.indicators);
}

export async function saveUserKlineIndicators(
  prisma: PrismaClient,
  userId: string,
  pair: string,
  indicators: KlineStoredIndicators,
): Promise<KlineStoredIndicators> {
  const normalizedPair = normalizeKlinePairSymbol(pair);
  const normalized = normalizeKlineIndicators(indicators) ?? { main: [], sub: [] };

  await prisma.userKlineChartIndicators.upsert({
    where: { userId_pair: { userId, pair: normalizedPair } },
    create: {
      userId,
      pair: normalizedPair,
      indicators: indicatorsToJson(normalized),
    },
    update: {
      indicators: indicatorsToJson(normalized),
    },
  });

  return normalized;
}
