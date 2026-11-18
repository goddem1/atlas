import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { checkExtraction, evalSkipReason, parseModelJson, resolveMention, scoreGold } from "@atlas-v1/news-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Usage = { tokensIn: number; tokensOut: number; costUsd: number };

async function complete(system: string, user: string): Promise<{ content: string; usage: Usage; model: string }> {
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env") });
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://polza.ai/api/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL_EXTRACT?.trim() || process.env.LLM_MODEL?.trim() || "openai/gpt-4o";
  if (!apiKey) throw new Error("Нет ключа модели");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    model?: string;
  };
  if (!response.ok) throw new Error(body.error?.message || `LLM ${response.status}`);
  return {
    content: body.choices?.[0]?.message?.content ?? "",
    model: body.model || model,
    usage: {
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
      costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : 0,
    },
  };
}

export async function runGoldEval(prisma: PrismaClient, promptId: string): Promise<{ skipped: boolean; labeled: number; created: number; reason: string }> {
  const prompt = await prisma.promptVersion.findUnique({ where: { id: promptId } });
  if (!prompt) throw new Error("Версия не найдена");
  const labeled = await prisma.labelRecord.count();
  const reason = evalSkipReason(labeled);
  if (reason) return { skipped: true, labeled, created: 0, reason };
  const labels = await prisma.labelRecord.findMany({
    include: { extraction: { include: { messageVersion: true } } },
  });
  const aliases = await prisma.coinAlias.findMany({ include: { coin: { select: { symbol: true } } } });
  const aliasRows = aliases.map((row) => ({ alias: row.alias, coinId: row.coinId, symbol: row.coin.symbol }));
  let created = 0;
  for (const label of labels) {
    const version = label.extraction.messageVersion;
    const exists = await prisma.extraction.findFirst({ where: { messageVersionId: version.id, promptVersionId: prompt.id }, select: { id: true } });
    if (exists) continue;
    const result = await complete(prompt.body, version.text);
    let raw: unknown = {};
    try {
      raw = parseModelJson(result.content);
    } catch {
      raw = {};
    }
    const checked = checkExtraction(version.text, raw);
    const extraction = await prisma.extraction.create({
      data: {
        messageVersionId: version.id,
        promptVersionId: prompt.id,
        model: result.model,
        rawJson: (raw ?? {}) as object,
        parsedJson: checked.parsed ? { ...checked.parsed, rejectedLevels: checked.rejectedLevels } : undefined,
        schemaValid: checked.schemaValid,
        evidenceValid: checked.evidenceValid,
        msgType: checked.parsed?.msg_type ?? null,
        isAd: checked.parsed?.is_ad ?? false,
        adMarkers: checked.parsed?.ad_markers ?? [],
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costUsd: result.usage.costUsd,
      },
    });
    if (checked.parsed) {
      for (const coin of checked.parsed.coins) {
        const resolved = resolveMention(coin.raw_mention, aliasRows);
        await prisma.extractionCoin.create({
          data: { extractionId: extraction.id, rawMention: coin.raw_mention, coinId: resolved.coinId, resolveStatus: resolved.status },
        });
      }
    }
    await prisma.llmUsage.create({
      data: { stage: "eval", model: result.model, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, costUsd: result.usage.costUsd, promptVersionId: prompt.id },
    });
    created += 1;
  }
  const scoredLabels = await prisma.labelRecord.findMany({
    where: { extraction: { promptVersionId: prompt.id } },
    include: { extraction: { select: { msgType: true } } },
  });
  const scores = scoreGold(scoredLabels.map((label) => ({
    msgType: label.extraction.msgType,
    fieldErrors: Array.isArray(label.fieldErrors) ? label.fieldErrors.filter((item): item is string => typeof item === "string") : [],
    missedSignal: label.missedSignal,
  })), 100);
  await prisma.metricSnapshot.createMany({
    data: scores.map((score) => ({
      metricKey: score.key,
      scopeType: "prompt",
      scopeKey: prompt.id,
      value: score.value,
      n: score.n,
      status: score.status,
    })),
  });
  return { skipped: false, labeled, created, reason: "Прогон записан. Новые разборы без своей разметки не получают precision." };
}
