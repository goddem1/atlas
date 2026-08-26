/**
 * One-off: count yesterday (MSK) Telegram posts and pick top-5 via LLM.
 * Usage: pnpm exec tsx scripts/probe-yesterday-news-llm.mts
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const TEXT_MAX = 320;
const MODEL = process.env.LLM_PROBE_MODEL?.trim() || "openai/gpt-4o";

type PostRow = {
  channelUsername: string;
  messageId: number;
  date: Date;
  text: string;
  hasMedia: boolean;
};

function messageKey(p: PostRow): string {
  return `${p.channelUsername}:${p.messageId}`;
}

function compactText(text: string, max = TEXT_MAX): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM response is not JSON");
  }
}

async function main() {
  const dayRows = await prisma.$queryRaw<Array<{ day_msk: Date }>>`
    SELECT ((now() AT TIME ZONE 'Europe/Moscow')::date - 1) AS day_msk
  `;
  const dayMsk = dayRows[0]?.day_msk;
  if (!dayMsk) throw new Error("Could not resolve yesterday MSK");

  const stats = await prisma.$queryRaw<
    Array<{ cnt: number; with_text: number; chars: number }>
  >`
    SELECT
      COUNT(*)::int AS cnt,
      COUNT(*) FILTER (WHERE length(trim(coalesce(text,''))) > 0)::int AS with_text,
      COALESCE(SUM(length(text)),0)::int AS chars
    FROM "TelegramNewsPost"
    WHERE (date AT TIME ZONE 'Europe/Moscow')::date = ((now() AT TIME ZONE 'Europe/Moscow')::date - 1)
  `;

  const byChannel = await prisma.$queryRaw<Array<{ channelUsername: string; cnt: number }>>`
    SELECT "channelUsername", COUNT(*)::int AS cnt
    FROM "TelegramNewsPost"
    WHERE (date AT TIME ZONE 'Europe/Moscow')::date = ((now() AT TIME ZONE 'Europe/Moscow')::date - 1)
    GROUP BY 1
    ORDER BY cnt DESC
  `;

  const posts = await prisma.$queryRaw<PostRow[]>`
    SELECT "channelUsername", "messageId", date, text, "hasMedia"
    FROM "TelegramNewsPost"
    WHERE (date AT TIME ZONE 'Europe/Moscow')::date = ((now() AT TIME ZONE 'Europe/Moscow')::date - 1)
      AND (length(trim(coalesce(text,''))) > 0 OR "hasMedia" = true)
    ORDER BY date ASC
  `;

  console.log(
    JSON.stringify(
      {
        dayMsk: String(dayMsk).slice(0, 10),
        stats: stats[0],
        channels: byChannel,
        candidates: posts.length,
        model: MODEL,
      },
      null,
      2,
    ),
  );

  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://polza.ai/api/v1").replace(/\/$/, "");
  if (!apiKey) {
    console.error("LLM_API_KEY missing — stop before LLM call");
    process.exit(1);
  }

  // Resolve model id: prefer explicit probe model, else try o4 variants from catalog
  let model = MODEL;
  try {
    const modelsRes = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (modelsRes.ok) {
      const body = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
      const ids = (body.data ?? []).map((m) => m.id).filter(Boolean) as string[];
      const preferred = [
        MODEL,
        "openai/gpt-4o",
        "openai/o4-mini",
        "openai/chatgpt-4o-latest",
        "openai/gpt-4o-2024-11-20",
      ];
      const found = preferred.find((id) => ids.includes(id));
      if (found) model = found;
      const related = ids.filter((id) => /gpt-4o|o4-mini|chatgpt-4o/i.test(id)).slice(0, 20);
      console.log(JSON.stringify({ resolvedModel: model, relatedModels: related }, null, 2));
    }
  } catch (e) {
    console.warn("models list failed, using", model, e);
  }

  const lines = posts.map((p, i) => {
    const text = compactText(p.text || (p.hasMedia ? "[media]" : ""));
    return `${i + 1}. ${messageKey(p)} | @${p.channelUsername} | ${text}`;
  });

  const approxChars = lines.join("\n").length;
  console.log(JSON.stringify({ promptChars: approxChars, approxTokens: Math.round(approxChars / 3.5) }, null, 2));

  const system = [
    "Ты аналитик крипты и рынков. Ответ ТОЛЬКО JSON.",
    'Схема: {"s":0-100,"formula":"…","picks":[{"id":"ch:msgId","why":"…","impact":"…"}]}',
    "s — дневной сентимент 0=плохо, 100=хорошо для крипты/рынков по ВСЕМ новостям дня.",
    "formula — на русском: как посчитан s (соотношение позитив/негатив или веса, итоговый %).",
    "picks — ровно 5 id из списка: самые важные новости дня (не дубли).",
    "why — почему в топе (1 короткое предложение).",
    "impact — влияние на рынок/крипту (1 короткое предложение).",
    "Игнорируй рекламу, кликбейт и повторы одного события.",
    "Пиши кратко, без воды.",
  ].join(" ");

  const user = `Новости за день (МСК ${String(dayMsk).slice(0, 10)}, с 00:00 до 23:59), всего ${posts.length}:\n${lines.join("\n")}`;

  const started = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    console.error(JSON.stringify({ http: res.status, body: rawText.slice(0, 800) }, null, 2));
    process.exit(1);
  }

  const data = JSON.parse(rawText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJsonObject(content) as {
    s?: number;
    formula?: string;
    picks?: Array<{ id?: string; why?: string; impact?: string }>;
  };

  const byId = new Map(posts.map((p) => [messageKey(p), p]));
  const picks = (parsed.picks ?? [])
    .filter((p) => p.id && byId.has(p.id))
    .slice(0, 5)
    .map((p) => {
      const post = byId.get(p.id!)!;
      return {
        id: p.id,
        why: p.why,
        impact: p.impact,
        channel: post.channelUsername,
        text: compactText(post.text, 220),
        date: post.date,
      };
    });

  console.log(
    JSON.stringify(
      {
        elapsedMs: Date.now() - started,
        modelUsed: data.model ?? model,
        usage: data.usage ?? null,
        sentiment: parsed.s,
        formula: parsed.formula,
        picks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
