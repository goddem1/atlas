import type { PrismaClient } from "@prisma/client";
import { BONDS_TV_MONTHLY_LIMIT_DEFAULT } from "./bondsYieldConfig.js";

const PROVIDER = "tradingview-bonds";

function monthKeyForDate(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function monthlyLimit(): number {
  const raw = process.env.RAPIDAPI_BONDS_MONTHLY_LIMIT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : BONDS_TV_MONTHLY_LIMIT_DEFAULT;
  return Number.isFinite(n) && n > 0 ? n : BONDS_TV_MONTHLY_LIMIT_DEFAULT;
}

export function resolveBondsRapidApiKeys(): { primary: string; secondary: string } {
  const primary = process.env.RAPIDAPI_KEY?.trim() ?? "";
  const secondary = process.env.RAPIDAPI_KEY_SECONDARY?.trim() ?? "";
  if (!primary || !secondary) {
    throw new Error("RAPIDAPI_KEY and RAPIDAPI_KEY_SECONDARY are required for bonds TradingView refresh");
  }
  return { primary, secondary };
}

export async function getBondsRapidApiUsageCount(prisma: PrismaClient, now = new Date()): Promise<number> {
  const monthKey = monthKeyForDate(now);
  const row = await prisma.rapidApiBondsUsage.findUnique({
    where: { provider_monthKey: { provider: PROVIDER, monthKey } },
  });
  return row?.requestCount ?? 0;
}

/** Выбирает ключ: первые N запросов в месяц — primary, далее secondary. */
export async function pickBondsRapidApiKey(prisma: PrismaClient, now = new Date()): Promise<string> {
  const { primary, secondary } = resolveBondsRapidApiKeys();
  const used = await getBondsRapidApiUsageCount(prisma, now);
  return used < monthlyLimit() ? primary : secondary;
}

export async function recordBondsRapidApiRequest(prisma: PrismaClient, now = new Date()): Promise<number> {
  const monthKey = monthKeyForDate(now);
  const row = await prisma.rapidApiBondsUsage.upsert({
    where: { provider_monthKey: { provider: PROVIDER, monthKey } },
    create: { provider: PROVIDER, monthKey, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });
  return row.requestCount;
}
