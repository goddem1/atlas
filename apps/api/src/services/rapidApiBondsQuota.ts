import type { PrismaClient } from "@prisma/client";
import { BONDS_TV_MONTHLY_LIMIT_DEFAULT } from "./bondsYieldConfig.js";

/** Legacy provider id — счётчик primary-ключа (совместимость с существующими строками в БД). */
const PROVIDER_PRIMARY = "tradingview-bonds";
const PROVIDER_SECONDARY = "tradingview-bonds-secondary";

const MSK_TZ = "Europe/Moscow";

export type BondsRapidApiKeySlot = "primary" | "secondary";

export type BondsRapidApiKeyPick = {
  apiKey: string;
  slot: BondsRapidApiKeySlot;
};

export function bondsMonthKeyMsk(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: MSK_TZ }).slice(0, 7);
}

function monthlyLimit(): number {
  const raw = process.env.RAPIDAPI_BONDS_MONTHLY_LIMIT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : BONDS_TV_MONTHLY_LIMIT_DEFAULT;
  return Number.isFinite(n) && n > 0 ? n : BONDS_TV_MONTHLY_LIMIT_DEFAULT;
}

export function providerForBondsKeySlot(slot: BondsRapidApiKeySlot): string {
  return slot === "primary" ? PROVIDER_PRIMARY : PROVIDER_SECONDARY;
}

export function resolveBondsRapidApiKeys(): { primary: string; secondary: string | null } {
  const primary = process.env.RAPIDAPI_KEY?.trim() ?? "";
  const secondary = process.env.RAPIDAPI_KEY_SECONDARY?.trim() || null;
  if (!primary) {
    throw new Error("RAPIDAPI_KEY is required for bonds TradingView refresh");
  }
  return { primary, secondary };
}

/** Чистая логика ротации: у каждого ключа свой месячный лимит RapidAPI. */
export function pickBondsRapidApiKeySlot(
  primaryUsed: number,
  secondaryUsed: number,
  hasSecondary: boolean,
  limit = monthlyLimit(),
): BondsRapidApiKeySlot {
  if (primaryUsed < limit) return "primary";
  if (hasSecondary && secondaryUsed < limit) return "secondary";
  throw new Error(
    `RapidAPI bonds monthly limit (${limit}) exceeded on all configured keys; set RAPIDAPI_KEY_SECONDARY or raise RAPIDAPI_BONDS_MONTHLY_LIMIT`,
  );
}

async function getUsageCountForProvider(
  prisma: PrismaClient,
  provider: string,
  monthKey: string,
): Promise<number> {
  try {
    const row = await prisma.rapidApiBondsUsage.findUnique({
      where: { provider_monthKey: { provider, monthKey } },
    });
    return row?.requestCount ?? 0;
  } catch {
    return 0;
  }
}

export async function getBondsRapidApiUsageCounts(
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ primary: number; secondary: number; monthKey: string }> {
  const monthKey = bondsMonthKeyMsk(now);
  const [primary, secondary] = await Promise.all([
    getUsageCountForProvider(prisma, PROVIDER_PRIMARY, monthKey),
    getUsageCountForProvider(prisma, PROVIDER_SECONDARY, monthKey),
  ]);
  return { primary, secondary, monthKey };
}

export async function getBondsRapidApiUsageCount(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { primary, secondary } = await getBondsRapidApiUsageCounts(prisma, now);
  return primary + secondary;
}

export async function pickBondsRapidApiKey(prisma: PrismaClient, now = new Date()): Promise<BondsRapidApiKeyPick> {
  const { primary, secondary } = resolveBondsRapidApiKeys();
  const usage = await getBondsRapidApiUsageCounts(prisma, now);
  const slot = pickBondsRapidApiKeySlot(usage.primary, usage.secondary, Boolean(secondary));
  return { apiKey: slot === "primary" ? primary : secondary!, slot };
}

export async function recordBondsRapidApiRequest(
  prisma: PrismaClient,
  slot: BondsRapidApiKeySlot,
  now = new Date(),
): Promise<number | null> {
  const monthKey = bondsMonthKeyMsk(now);
  const provider = providerForBondsKeySlot(slot);
  try {
    const row = await prisma.rapidApiBondsUsage.upsert({
      where: { provider_monthKey: { provider, monthKey } },
      create: { provider, monthKey, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
    return row.requestCount;
  } catch {
    return null;
  }
}
