import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { COIN_CATALOG } from "./coins.js";
import { DEFAULT_THRESHOLDS } from "./metrics.js";
import { EXTRACT_PROMPT, PROFILE_PROMPT } from "./prompt.js";
import { DEFAULT_SENTIMENT } from "./sentiment.js";
import { DEFAULT_TESTER } from "./tester.js";

export async function ensureCatalog(prisma: PrismaClient): Promise<void> {
  const prompt = await prisma.promptVersion.findUnique({ where: { name_version: { name: "extract", version: 1 } } });
  if (!prompt) {
    await prisma.promptVersion.updateMany({ where: { name: "extract", isActive: true }, data: { isActive: false } });
    await prisma.promptVersion.create({
      data: { name: "extract", version: 1, body: EXTRACT_PROMPT, isActive: true },
    });
  }
  const params = await prisma.paramSet.findUnique({ where: { kind_version: { kind: "thresholds", version: 1 } } });
  if (!params) {
    await prisma.paramSet.create({
      data: { kind: "thresholds", version: 1, paramsJson: DEFAULT_THRESHOLDS, isActive: true },
    });
  }
  const profilePrompt = await prisma.promptVersion.findUnique({ where: { name_version: { name: "profile", version: 1 } } });
  if (!profilePrompt) {
    await prisma.promptVersion.updateMany({ where: { name: "profile", isActive: true }, data: { isActive: false } });
    await prisma.promptVersion.create({
      data: { name: "profile", version: 1, body: PROFILE_PROMPT, isActive: true },
    });
  }
  const sentiment = await prisma.paramSet.findUnique({ where: { kind_version: { kind: "sentiment", version: 1 } } });
  if (!sentiment) {
    await prisma.paramSet.create({
      data: { kind: "sentiment", version: 1, paramsJson: DEFAULT_SENTIMENT, isActive: true },
    });
  }
  const tester = await prisma.paramSet.findUnique({ where: { kind_version: { kind: "tester", version: 1 } } });
  if (!tester) {
    await prisma.paramSet.create({
      data: { kind: "tester", version: 1, paramsJson: DEFAULT_TESTER, isActive: true },
    });
  }
  for (const coin of COIN_CATALOG) {
    const saved = await prisma.coin.upsert({
      where: { symbol: coin.symbol },
      create: {
        symbol: coin.symbol,
        name: coin.name,
        binanceSymbol: coin.binanceSymbol,
        isStable: coin.isStable,
      },
      update: {
        name: coin.name,
        binanceSymbol: coin.binanceSymbol,
        isStable: coin.isStable,
      },
    });
    for (const alias of coin.aliases) {
      const existing = await prisma.coinAlias.findUnique({
        where: { alias_lang: { alias: alias.alias, lang: alias.lang } },
      });
      if (!existing) {
        await prisma.coinAlias.create({ data: { coinId: saved.id, alias: alias.alias, lang: alias.lang } });
      }
    }
  }
}
