import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient, type MsgType } from "@atlas-v1/news-schema/generated/client/index.js";
import {
  checkExtraction,
  DEFAULT_THRESHOLDS,
  ensureCatalog,
  evaluateStoredCalls,
  linkCalls,
  loadPriceSnapshots,
  parseModelJson,
  resolveMention,
  latestDigestDay,
  loadDigest,
  storeMetrics,
  testerReady,
  writeSentiment,
  writeWeeklyProfiles,
} from "@atlas-v1/news-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
dotenv.config({ path: path.join(repoRoot, "apps/news-api/.env") });
dotenv.config({ path: path.join(repoRoot, "apps/api/.env") });

const prisma = new PrismaClient();

type Usage = { tokensIn: number; tokensOut: number; costUsd: number };

async function complete(system: string, user: string): Promise<{ content: string; usage: Usage; model: string }> {
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://polza.ai/api/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL_EXTRACT?.trim() || process.env.LLM_MODEL?.trim() || "openai/gpt-4o";
  if (!apiKey) throw new Error("Нет LLM_API_KEY. Берётся из apps/api/.env Panorama, в репозиторий не копируется.");
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

async function extractOne(promptId: string, promptBody: string, versionId: string): Promise<void> {
  const version = await prisma.messageVersion.findUnique({
    where: { id: versionId },
    include: { message: { include: { channel: true } } },
  });
  if (!version) return;
  const message = version.message;
  const earlier = await prisma.message.findMany({
    where: { channelId: message.channelId, postedAt: { lt: message.postedAt }, id: { not: message.id } },
    orderBy: { postedAt: "desc" },
    take: 5,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const reply = message.replyToTgMsgId
    ? await prisma.message.findUnique({
        where: { channelId_tgMsgId: { channelId: message.channelId, tgMsgId: message.replyToTgMsgId } },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : null;
  const context = earlier
    .slice()
    .reverse()
    .map((row) => row.versions[0]?.text ?? "")
    .filter(Boolean)
    .join("\n---\n");
  const user = [
    `Канал: @${message.channel.username}`,
    `Время поста: ${message.postedAt.toISOString()}`,
    `Предыдущие сообщения канала, только более ранние:\n${context || "нет"}`,
    `Сообщение, на которое отвечают:\n${reply?.versions[0]?.text || "нет"}`,
    `Сообщение:\n${version.text}`,
  ].join("\n\n");

  let lastRaw: unknown = null;
  let lastText = "";
  let usage: Usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  let model = process.env.LLM_MODEL_EXTRACT?.trim() || process.env.LLM_MODEL?.trim() || "openai/gpt-4o";
  let checked = checkExtraction(version.text, {});
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const extra = attempt === 0 ? "" : `\n\nПрошлый ответ не прошёл схему: ${checked.errors.join("; ") || "не JSON"}. Верни только JSON.`;
    const result = await complete(promptBody, user + extra);
    usage = {
      tokensIn: usage.tokensIn + result.usage.tokensIn,
      tokensOut: usage.tokensOut + result.usage.tokensOut,
      costUsd: usage.costUsd + result.usage.costUsd,
    };
    model = result.model;
    lastText = result.content;
    try {
      lastRaw = parseModelJson(result.content);
    } catch {
      lastRaw = { unparsed: result.content };
      checked = checkExtraction(version.text, {});
      continue;
    }
    checked = checkExtraction(version.text, lastRaw);
    if (checked.schemaValid) break;
  }

  const aliases = await prisma.coinAlias.findMany({ include: { coin: { select: { symbol: true } } } });
  const aliasRows = aliases.map((row) => ({ alias: row.alias, coinId: row.coinId, symbol: row.coin.symbol }));
  const extraction = await prisma.extraction.create({
    data: {
      messageVersionId: version.id,
      promptVersionId: promptId,
      model,
      rawJson: (lastRaw ?? { unparsed: lastText }) as object,
      parsedJson: checked.parsed ? { ...checked.parsed, rejectedLevels: checked.rejectedLevels } : undefined,
      schemaValid: checked.schemaValid,
      evidenceValid: checked.evidenceValid,
      msgType: (checked.parsed?.msg_type as MsgType | undefined) ?? null,
      isAd: checked.parsed?.is_ad ?? false,
      adMarkers: checked.parsed?.ad_markers ?? [],
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd,
    },
  });
  if (checked.parsed) {
    for (const coin of checked.parsed.coins) {
      const resolved = resolveMention(coin.raw_mention, aliasRows);
      await prisma.extractionCoin.create({
        data: {
          extractionId: extraction.id,
          rawMention: coin.raw_mention,
          coinId: resolved.coinId,
          resolveStatus: resolved.status,
        },
      });
    }
  }
  await prisma.llmUsage.create({
    data: {
      stage: "extract",
      model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd,
      promptVersionId: promptId,
    },
  });
}

async function refreshPrices(): Promise<void> {
  await ensureCatalog(prisma);
  const prices = await loadPriceSnapshots(prisma);
  console.log(`цены: символов ${prices.symbols}, точек ${prices.points}`);
  const gate = await testerReady(prisma);
  const tester = await prisma.paramSet.findFirst({ where: { kind: "tester", isActive: true }, orderBy: { version: "desc" } });
  if (!gate.open || !tester) {
    console.log(`тестер не запущен: ${gate.reason}`);
  } else {
    const created = await evaluateStoredCalls(prisma, tester.id);
    console.log(`оценки тестера: ${created}`);
  }
  const thresholds = await prisma.paramSet.findFirst({ where: { kind: "thresholds", isActive: true } });
  await storeMetrics(prisma, thresholds?.id ?? null);
  console.log("метрики пересчитаны");
}

async function refreshProfiles(): Promise<void> {
  await ensureCatalog(prisma);
  const result = await writeWeeklyProfiles(prisma, async (system, user) => {
    const done = await complete(system, user);
    await prisma.llmUsage.create({
      data: {
        stage: "profile",
        model: done.model,
        tokensIn: done.usage.tokensIn,
        tokensOut: done.usage.tokensOut,
        costUsd: done.usage.costUsd,
      },
    });
    return done.content;
  });
  console.log(`профили: создано ${result.created}, уже были ${result.skipped}, незакрытые недели ${result.openWeeks}, не прошли схему ${result.failed}`);
  if (result.stopped) console.log(`профили остановлены: ${result.stopped}`);
  const thresholds = await prisma.paramSet.findFirst({ where: { kind: "thresholds", isActive: true } });
  await storeMetrics(prisma, thresholds?.id ?? null);
  console.log("метрики пересчитаны");
}

async function refreshSentiment(): Promise<void> {
  await ensureCatalog(prisma);
  const result = await writeSentiment(prisma);
  console.log(`сентимент: снимков ${result.snapshots}, флагов согласованности ${result.flags}`);
  const thresholds = await prisma.paramSet.findFirst({ where: { kind: "thresholds", isActive: true } });
  await storeMetrics(prisma, thresholds?.id ?? null);
  console.log("метрики пересчитаны");
}

async function printDigest(): Promise<void> {
  const latest = await prisma.message.findFirst({ orderBy: { postedAt: "desc" }, select: { postedAt: true } });
  const day = latestDigestDay(latest?.postedAt ?? null);
  const { digest, panorama } = await loadDigest(prisma, day, {
    lagBadMin: DEFAULT_THRESHOLDS.ingestLagBadMin,
    queueWarn: DEFAULT_THRESHOLDS.queueWarn,
    queueBad: DEFAULT_THRESHOLDS.queueBad,
  });
  const names = await prisma.channel.findMany({ select: { username: true } });
  const blob = JSON.stringify(panorama);
  const leaked = names.find((channel) => blob.includes(channel.username));
  if (leaked) throw new Error("Обезличенная выдача содержит имя канала");
  console.log(`день ${digest.day}: новых постов ${digest.newMessages}, в работу ${digest.taken.length}`);
  console.log(`консенсус ${digest.consensus.length}, расхождения ${digest.disagreement.length}, алерты ${digest.alerts.length}`);
  console.log("обезличенная выдача без имён каналов");
}

async function main(): Promise<void> {
  if (process.argv.includes("--prices")) {
    await refreshPrices();
    return;
  }
  if (process.argv.includes("--profiles")) {
    await refreshProfiles();
    return;
  }
  if (process.argv.includes("--sentiment")) {
    await refreshSentiment();
    return;
  }
  if (process.argv.includes("--digest")) {
    await printDigest();
    return;
  }
  await ensureCatalog(prisma);
  const prompt = await prisma.promptVersion.findFirst({ where: { name: "extract", isActive: true }, orderBy: { version: "desc" } });
  if (!prompt) throw new Error("Нет активного промпта extract");
  const pending = await prisma.messageVersion.findMany({
    where: { extractions: { none: { promptVersionId: prompt.id } } },
    orderBy: { capturedAt: "asc" },
    select: { id: true },
  });
  console.log(`в очереди разбора: ${pending.length}`);
  for (const version of pending) {
    try {
      await extractOne(prompt.id, prompt.body, version.id);
    } catch (err) {
      console.error(version.id, err instanceof Error ? err.message : err);
    }
  }
  const linked = await linkCalls(prisma);
  console.log(`вызовы: создано ${linked.created}, обновлений ${linked.linked}, на проверке ${linked.reviews}`);
  await refreshPrices();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
