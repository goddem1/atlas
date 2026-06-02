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

export function resolveBondsRapidApiKeys(): { primary: string; secondary: string | null } {
  const primary = process.env.RAPIDAPI_KEY?.trim() ?? "";
  const secondary = process.env.RAPIDAPI_KEY_SECONDARY?.trim() || null;
  if (!primary) {
    throw new Error("RAPIDAPI_KEY is required for bonds TradingView refresh");
  }
  return { primary, secondary };
}

export async function getBondsRapidApiUsageCount(prisma: PrismaClient, now = new Date()): Promise<number> {
  const monthKey = monthKeyForDate(now);
  try {
    const row = await prisma.rapidApiBondsUsage.findUnique({
      where: { provider_monthKey: { provider: PROVIDER, monthKey } },
    });
    return row?.requestCount ?? 0;
  } catch {
    return 0;
  }
}

/** Выбирает ключ: первые N запросов в месяц — primary, далее secondary (если задан). */
export async function pickBondsRapidApiKey(prisma: PrismaClient, now = new Date()): Promise<string> {
  const { primary, secondary } = resolveBondsRapidApiKeys();
  const used = await getBondsRapidApiUsageCount(prisma, now);
  if (used < monthlyLimit()) return primary;
  if (secondary) return secondary;
  throw new Error(
    `RapidAPI bonds monthly limit (${monthlyLimit()}) exceeded; set RAPIDAPI_KEY_SECONDARY in env`,
  );
}

export async function recordBondsRapidApiRequest(prisma: PrismaClient, now = new Date()): Promise<number | null> {
  const monthKey = monthKeyForDate(now);
  try {
    const row = await prisma.rapidApiBondsUsage.upsert({
      where: { provider_monthKey: { provider: PROVIDER, monthKey } },
      create: { provider: PROVIDER, monthKey, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
    return row.requestCount;
  } catch {
    return null;
  }
}
