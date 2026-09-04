import type { PrismaClient } from "@prisma/client";
import type {
  TelegramNewsMessage,
  TelegramNewsWidgetCategory,
  TelegramNewsWidgetExplanation,
  TelegramNewsWidgetItemKind,
  TelegramNewsWidgetItemNote,
  TelegramNewsWidgetResponse,
} from "@atlas-v1/shared";
import {
  TELEGRAM_CHANNELS_MAX,
  normalizeTelegramUsername,
  parseTelegramNewsWidgetCategory,
} from "@atlas-v1/shared";
import {
  getStoredTelegramFeedForMskDay,
  getTelegramMessagesByKeys,
  listWatchedUsernames,
} from "./telegramNewsStore.js";
import {
  getTelegramNewsDailyIndexRow,
  upsertTelegramNewsDailyIndex,
} from "./telegramNewsDailyIndex.js";
import { formatDurableRulesBlock } from "../config/newsCalibrationRules.js";
import {
  findRelevantFeedback,
  generateEmbeddingsBatch,
  readFeedbackFewshotConfig,
} from "./newsFeedbackEmbedding.js";
import { loadFeedbackForCalibration } from "./newsFeedbackService.js";
import type { NewsPickFeedback } from "@prisma/client";

const TEXT_MAX = 320;
const TOP_N = 5;
/** Жёсткий лимит под 3 строки виджета (~350px минус тег). */
const HEADLINE_MAX = 100;

type LlmPick = {
  s: number;
  formula: string;
  picks: Array<{
    id: string;
    headline: string;
    why: string;
    impact: string;
    kind?: TelegramNewsWidgetItemKind;
    category: TelegramNewsWidgetCategory;
  }>;
};

function parseItemKind(raw: unknown): TelegramNewsWidgetItemKind | undefined {
  if (raw === "moved" || raw === "will_move" || raw === "narrative") return raw;
  return undefined;
}

function messageKey(msg: TelegramNewsMessage): string {
  return `${msg.channelUsername}:${msg.id}`;
}

function normalizeUsernames(raw: string[]): string[] {
  return Array.from(
    new Set(raw.map((u) => normalizeTelegramUsername(u)).filter(Boolean)),
  ).slice(0, TELEGRAM_CHANNELS_MAX);
}

function normalizeFilters(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const word = item.trim().replace(/\s+/g, " ").slice(0, 64);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= 40) break;
  }
  return out;
}

function applyFilters(messages: TelegramNewsMessage[], filters: string[]): TelegramNewsMessage[] {
  if (filters.length === 0) return messages;
  return messages.filter((msg) => {
    const text = msg.text.toLowerCase();
    if (!text) return true;
    return !filters.some((word) => text.includes(word.toLowerCase()));
  });
}

function compactText(text: string, max = TEXT_MAX): string {
  const oneLine = sanitizeForLlm(text).replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/** Убирает control/unpaired surrogates — иначе Polza отвечает 400 parse JSON. */
function sanitizeForLlm(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
      } else {
        out += "\uFFFD";
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    out += text[i]!;
  }
  return out;
}

function isLlmDisabled(): boolean {
  return process.env.NEWS_WIDGET_LLM_DISABLED === "true";
}

function readLlmConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  if (!apiKey) return null;
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://polza.ai/api/v1").replace(
    /\/$/,
    "",
  );
  // Дневной разбор — более сильная модель по умолчанию
  const model = process.env.LLM_MODEL?.trim() || "openai/gpt-4o";
  return { apiKey, baseUrl, model };
}

const POSITIVE_PATTERN =
  "рост|ралли|рекорд|прибыл|быч|surge|rally|high|strong|beat|upgrade|позитив|укрепил|взлет|взлёт";
const NEGATIVE_PATTERN =
  "паден|обвал|убыт|медвеж|crash|sell|war|санкц|слаб|снижен|рисков|рецесс|дефолт|продаж|негатив";

function countKeywordHits(text: string, pattern: string): number {
  return (text.match(new RegExp(`\\b(?:${pattern})\\b`, "gi")) ?? []).length;
}

function heuristicSentimentDetailed(texts: string[]): { score: number; pos: number; neg: number } {
  let pos = 0;
  let neg = 0;
  for (const text of texts) {
    pos += countKeywordHits(text, POSITIVE_PATTERN);
    neg += countKeywordHits(text, NEGATIVE_PATTERN);
  }
  const total = pos + neg;
  if (total === 0) return { score: 54, pos: 0, neg: 0 };
  const ratio = (pos - neg) / total;
  const score = Math.round(Math.min(92, Math.max(12, 50 + ratio * 40)));
  return { score, pos, neg };
}

/** Последний завершённый МСК-день: с 23:00 — сегодня, иначе вчера. */
export function resolveNewsWidgetMskDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  // ICU sometimes still emits "24" for midnight; treat as 0.
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const today = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (hour >= 23) return today;
  const utc = Date.UTC(y, m - 1, d);
  const prev = new Date(utc - 24 * 60 * 60 * 1000);
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  const pd = prev.getUTCDate();
  return `${String(py).padStart(4, "0")}-${String(pm).padStart(2, "0")}-${String(pd).padStart(2, "0")}`;
}

function emptyExplanation(formula: string): TelegramNewsWidgetExplanation {
  return { formula, notes: [] };
}

function fallbackResponse(
  candidates: TelegramNewsMessage[],
  cached: boolean,
  why: string,
  day: string,
): TelegramNewsWidgetResponse {
  const items = candidates.slice(0, TOP_N);
  const { score, pos, neg } = heuristicSentimentDetailed(candidates.map((m) => m.text));
  const total = pos + neg;
  const formula =
    total === 0
      ? `Сентимент ${score}% за ${day}: явных позитивных/негативных сигналов мало, нейтральное значение. Кандидатов: ${candidates.length}.`
      : `Сентимент ${score}% за ${day} (эвристика): pos=${pos}, neg=${neg}, постов=${candidates.length}.`;

  const notes: TelegramNewsWidgetItemNote[] = items.map((msg) => ({
    id: messageKey(msg),
    headline: fitHeadline(msg.text || (msg.hasMedia ? "[медиа]" : "")),
    why: "Свежий пост дня (fallback без LLM).",
    impact: "Влияние на рынок не оценено — LLM недоступен.",
    category: "markets",
  }));

  return {
    sentiment: score,
    why,
    explanation: { formula, notes },
    items: applyHeadlinesToItems(items, notes),
    cached,
    updatedAt: new Date().toISOString(),
    day,
    candidateCount: candidates.length,
  };
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

function clipRu(text: string, max: number): string {
  const one = text.trim().replace(/\s+/g, " ");
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1).trimEnd()}…`;
}

/** Укладывает headline в 3 строки: без «…», обрезка по границе слова/предложения. */
function fitHeadline(text: string, max = HEADLINE_MAX): string {
  let one = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/…+/g, "")
    .replace(/\.{3,}/g, ".")
    .trim();
  if (one.length <= max) return one;

  const slice = one.slice(0, max);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(max * 0.55)) {
    return slice.slice(0, sentenceEnd + 1).trim();
  }
  const space = slice.lastIndexOf(" ");
  const cut = space >= Math.floor(max * 0.55) ? space : max;
  let out = slice.slice(0, cut).trim().replace(/[,:;–—-]+$/, "").trim();
  if (out && !/[.!?]$/.test(out)) out = `${out}.`;
  return out;
}

function parseLlmPick(raw: unknown, allowed: Set<string>): LlmPick | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sRaw = typeof o.s === "number" ? o.s : Number(o.s);
  if (!Number.isFinite(sRaw)) return null;
  const s = Math.round(Math.min(100, Math.max(0, sRaw)));

  const formula =
    typeof o.formula === "string" && o.formula.trim()
      ? clipRu(o.formula, 420)
      : `Сентимент ${s}% для крипты и рынков по оценке модели.`;

  const picksRaw = Array.isArray(o.picks) ? o.picks : [];
  const picks: LlmPick["picks"] = [];
  for (const row of picksRaw) {
    if (!row || typeof row !== "object") continue;
    const p = row as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id : "";
    if (!id || !allowed.has(id)) continue;
    if (picks.some((x) => x.id === id)) continue;
    picks.push({
      id,
      headline: fitHeadline(
        typeof p.headline === "string" && p.headline.trim()
          ? p.headline
          : typeof p.title === "string" && p.title.trim()
            ? p.title
            : "Важная новость дня.",
      ),
      why: clipRu(typeof p.why === "string" ? p.why : "Важная новость для рынка.", 180),
      impact: clipRu(typeof p.impact === "string" ? p.impact : "Влияние на рынок неоднозначно.", 180),
      kind: parseItemKind(p.t ?? p.kind),
      category: parseTelegramNewsWidgetCategory(p.cat ?? p.category) ?? "markets",
    });
    if (picks.length >= TOP_N) break;
  }

  if (picks.length === 0 && Array.isArray(o.ids)) {
    for (const idRaw of o.ids) {
      const id = String(idRaw);
      if (!allowed.has(id)) continue;
      picks.push({
        id,
        headline: "Важная новость дня.",
        why: "Вошла в топ по оценке модели.",
        impact: "Влияние описано в общем сентименте.",
        category: "markets",
      });
      if (picks.length >= TOP_N) break;
    }
  }

  if (picks.length === 0) return null;
  return { s, formula, picks };
}

export function formatCalibrationExamplesBlock(entries: NewsPickFeedback[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const priceInfo =
      e.priceMoveBtc != null
        ? `BTC за ${e.priceMoveWindowHours ?? 4}ч после: ${e.priceMoveBtc > 0 ? "+" : ""}${e.priceMoveBtc.toFixed(1)}%`
        : "";
    return `Новость: "${e.postText}"
Оценка LLM: w=${e.llmWeight ?? "?"}, p=${e.llmPolarity ?? "?"}, t=${e.llmType ?? "?"}
Комментарий автора: "${e.humanNote}"
${priceInfo}`.trim();
  });
  return `## Примеры калибровки от автора проекта:\n\n${lines.join("\n\n")}`;
}

function buildBaseSystemPrompt(): string {
  return [
    "Ты аналитик крипты и рынков. Ответ ТОЛЬКО JSON без markdown.",
    'Схема: {"s":0-100,"formula":"…","picks":[{"id":"ch:msgId","t":"moved|will_move|narrative","w":1-5,"p":-1|0|1,"r":number,"cat":"macro|crypto|funds|markets","headline":"…","why":"…","impact":"…"}]}',
    "",
    "Шаг 0 — фильтрация (не входят в Σ и не в топ): реклама, розыгрыши, кликбейт без факта, заявления без действий, чистые репосты-дубли одного события (оставь 1 лучший).",
    "",
    "Шаг 1 — для каждой оставшейся новости i:",
    "p_i ∈ {−1, 0, +1} — только знак (негатив / нейтрал / позитив). Полярность ГРУБАЯ: «SEC одобрила Bitcoin ETF» и «альткоин +3%» обе могут быть +1 — величину влияния несёт ТОЛЬКО w_i. Не пытайся «подкрутить» p.",
    "",
    "w_i ∈ {1,2,3,4,5} — калибруй СТРОГО по иерархии (не размывай границы между сессиями):",
    "ВЫСОКОЕ (4–5):",
    "  5 = системный шок: кризис/банкротство крупной биржи или кастодиана, крупный взлом с потерей средств пользователей, жёсткое регуляторное решение по BTC/ETH/рынку в целом (SEC ETF approve/deny, запрет), макро-шок уровня ФРС/CPI/NFP с явным рыночным эффектом.",
    "  4 = крупное институциональное действие (BlackRock, MicroStrategy, крупные ETF-потоки), хак/эксплойт крупного протокола, значимое регуляторное событие (MiCA и аналоги) без полного системного шока.",
    "СРЕДНЕЕ (2–3):",
    "  3 = листинг на Binance/Coinbase для значимого актива, крупное обновление протокола топ-монеты, геополитика с прямым влиянием на доллар/риск-аппетит.",
    "  2 = отраслевая новость средней силы: заметный ончейн-поток, вторичный регуляторный сигнал, движение без системного масштаба.",
    "НИЗКОЕ (1):",
    "  1 = отдельный альткоин, партнёрство без продукта, локальная новость, слабый/косвенный сигнал.",
    "Правило: если сомневаешься между соседними весами — бери МЕНЬШИЙ.",
    "",
    "t_i ∈ {moved, will_move, narrative} — тип важности (обязателен для топа, желателен для всех):",
    "  moved — уже двинула / объясняет сегодняшнее движение цены;",
    "  will_move — предстоящее событие (решение ФРС, листинг, экспирация опционов) на часы/дни;",
    "  narrative — не двигает цену мгновенно, но меняет sentiment на дни/неделю (вход крупного игрока, смена нарратива).",
    "Не смешивай типы: одна новость = один t_i.",
    "",
    "m_i ∈ [0,1] — прямая связь с ценой/ликвидностью/регуляторикой крипты.",
    "u_i ∈ [0,1] — уникальность события дня (1 = главное/первое освещение).",
    "",
    "Шаг 2 — индекс дня:",
    "S_raw = 50 + 50 × (Σ w_i·p_i) / (Σ w_i)",
    "s = round(clamp(S_raw, 0, 100))",
    "Нейтральный день → около 50. Если после фильтра нет новостей: s=50.",
    "В Σ входят все прошедшие фильтр новости (не только топ-5).",
    "",
    "Шаг 3 — отбор топ-5 (не одна куча «важных»):",
    "R_i = w_i × (0.50·|p_i| + 0.25·m_i + 0.15·u_i + 0.10·τ_i)",
    "где τ_i = 1.0 если t=moved, 0.85 если will_move, 0.70 если narrative.",
    "Цель топа: объяснить день + дать форвард + нарратив. Стремись к миксу: ≥1 moved, ≥1 will_move или narrative, если такие есть в кандидатах.",
    "picks — ровно 5 id с наибольшим R_i после дедупа событий; сортировка по R_i убыв.",
    "В каждом pick обязательно: t, w, p, r(=R_i), cat, headline, why, impact.",
    "t обязателен для каждого pick — без t ответ считается неполным.",
    "",
    "cat — ОБЯЗАТЕЛЬНО ровно одна категория тега (английский id):",
    "  macro — макроэкономика и ЦБ (ФРС, ставка, CPI, NFP, бюджет, инфляция);",
    "  crypto — криптоактивы/протоколы/биржи/ончейн (BTC, ETH, Solana, хаки, листинги);",
    "  funds — фонды и ETF-потоки (BlackRock, спотовые ETF, приток/отток в фонды);",
    "  markets — общие рыночные новости (акции, индексы, нефть, валюта, ликвидация, риск-аппетит).",
    "Если сомневаешься между crypto и funds — funds, если речь про ETF/потоки фондов; иначе crypto.",
    "Если не подходит ни к чему узкому — markets.",
    "",
    "headline — ОБЯЗАТЕЛЬНО: перефразируй пост так, чтобы целиком влезал в 3 строки виджета БЕЗ обрезки.",
    `  • СТРОГО ≤${HEADLINE_MAX} символов (лучше 85–${HEADLINE_MAX}); длиннее — брак;`,
    "  • одно законченное предложение (или два очень коротких), точка в конце, без «…» и обрыва;",
    "  • сохрани главный факт и 1–2 ключевые цифры/имени, без воды, эмодзи, хэштегов, ссылок;",
    "  • не копируй исходник дословно;",
    "  • эталон длины: «Zcash активировал Ironwood — устранена уязвимость Orchard и усилен протокол.»;",
    "  • плохо: длинный текст, который обрежется на «неожиданное…».",
    "",
    "formula — одна строка с цифрами: N, Σ(w·p), Σw, S_raw, s. Пример:",
    '"N=62; Σ(w·p)=−18; Σw=140; S_raw=50+50×(−18/140)=43.6 → s=44".',
    "why / impact — по 1 короткому предложению на русском.",
  ].join("\n");
}

export function buildSystemPrompt(calibrationExamplesBlock = ""): string {
  const durable = formatDurableRulesBlock();
  const parts = [buildBaseSystemPrompt(), durable, calibrationExamplesBlock.trim()].filter(Boolean);
  return parts.join("\n\n");
}

async function buildCalibrationExamplesBlock(
  prisma: PrismaClient,
  candidates: TelegramNewsMessage[],
  log?: ComputeLog,
): Promise<string> {
  try {
    const allFeedback = await loadFeedbackForCalibration(prisma);
    if (allFeedback.length === 0) return "";

    const candidateTexts = candidates.map((c) =>
      compactText(c.text || (c.hasMedia ? "[media]" : "")),
    );
    const candidateEmbeddings = await generateEmbeddingsBatch(candidateTexts);
    const { topK, minSimilarity } = readFeedbackFewshotConfig();
    const relevantIds = findRelevantFeedback(
      candidateEmbeddings,
      allFeedback.map((f) => ({ id: f.id, embedding: f.embedding })),
      topK,
      minSimilarity,
    );
    if (relevantIds.length === 0) return "";

    const relevantFeedback = allFeedback.filter((f) => relevantIds.includes(f.id));
    log?.info?.(
      { count: relevantFeedback.length, topK, minSimilarity },
      "[news-index] loaded calibration feedback examples",
    );
    return formatCalibrationExamplesBlock(relevantFeedback);
  } catch (err) {
    log?.warn?.({ err }, "[news-index] calibration examples skipped");
    return "";
  }
}

async function callLlm(
  config: { apiKey: string; baseUrl: string; model: string },
  candidates: TelegramNewsMessage[],
  day: string,
  systemPrompt: string,
): Promise<LlmPick> {
  const lines = candidates.map((m, i) => {
    const text = compactText(m.text || (m.hasMedia ? "[media]" : ""));
    return `${i + 1}. ${messageKey(m)} | @${m.channelUsername} | ${text}`;
  });


  const user = [
    `День МСК ${day} (00:00–23:59). Кандидатов: ${candidates.length}.`,
    "Посчитай индекс, отбери топ-5. Для каждой — cat (macro|crypto|funds|markets) и headline ≤100 символов.",
    "Кандидаты:",
    lines.join("\n"),
  ].join("\n");

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseLlmPick(extractJsonObject(content), new Set(candidates.map(messageKey)));
  if (!parsed) throw new Error("LLM JSON missing valid picks");
  return parsed;
}

function resolveItems(
  candidates: TelegramNewsMessage[],
  ids: string[],
): TelegramNewsMessage[] {
  const map = new Map(candidates.map((m) => [messageKey(m), m]));
  const out: TelegramNewsMessage[] = [];
  for (const id of ids) {
    const msg = map.get(id);
    if (msg) out.push(msg);
  }
  if (out.length < TOP_N) {
    for (const msg of candidates) {
      if (out.length >= TOP_N) break;
      if (!out.some((x) => messageKey(x) === messageKey(msg))) out.push(msg);
    }
  }
  return out.slice(0, TOP_N);
}

function buildNotesForItems(
  items: TelegramNewsMessage[],
  picks: LlmPick["picks"],
): TelegramNewsWidgetItemNote[] {
  const byId = new Map(picks.map((p) => [p.id, p]));
  return items.map((msg) => {
    const id = messageKey(msg);
    const pick = byId.get(id);
    const fallbackHeadline = fitHeadline(msg.text || (msg.hasMedia ? "[медиа]" : ""));
    return {
      id,
      headline: pick?.headline ? fitHeadline(pick.headline) : fallbackHeadline,
      why: pick?.why ?? "Вошла в топ по оценке модели.",
      impact: pick?.impact ?? "Влияние на рынок не уточнено.",
      category: pick?.category ?? "markets",
      ...(pick?.kind ? { kind: pick.kind } : {}),
    };
  });
}

/** Подставляет короткий headline в text сообщений для виджета. */
function applyHeadlinesToItems(
  items: TelegramNewsMessage[],
  notes: TelegramNewsWidgetItemNote[],
): TelegramNewsMessage[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  return items.map((msg) => {
    const note = byId.get(messageKey(msg));
    const headline = note?.headline?.trim();
    if (!headline) return msg;
    return {
      ...msg,
      text: headline,
      entities: [],
    };
  });
}

export type ComputeDailyNewsIndexResult = {
  day: string;
  skipped: boolean;
  source: "llm" | "heuristic" | null;
  sentiment: number | null;
  candidateCount: number;
};

type ComputeLog = {
  info?: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * Один LLM-вызов на МСК-день → запись в TelegramNewsDailyIndex.
 * Вызывается cron'ом (~23:00 МСК), не из HTTP-запросов виджета.
 */
export async function computeAndPersistDailyNewsIndex(
  prisma: PrismaClient,
  options: {
    day?: string;
    usernames?: string[];
    /** Если уже есть LLM-снимок за день — не вызывать повторно. */
    skipIfLlmExists?: boolean;
    log?: ComputeLog;
  } = {},
): Promise<ComputeDailyNewsIndexResult> {
  const day = options.day ?? resolveNewsWidgetMskDay();
  const usernames = normalizeUsernames(
    options.usernames?.length ? options.usernames : await listWatchedUsernames(prisma),
  );

  if (options.skipIfLlmExists !== false) {
    const existing = await getTelegramNewsDailyIndexRow(prisma, day);
    if (existing?.source === "llm") {
      return {
        day,
        skipped: true,
        source: "llm",
        sentiment: existing.sentiment,
        candidateCount: existing.candidateCount,
      };
    }
  }

  if (usernames.length === 0) {
    options.log?.warn({ day }, "[news-index] no channels to compute");
    return { day, skipped: false, source: null, sentiment: null, candidateCount: 0 };
  }

  const feed = await getStoredTelegramFeedForMskDay(prisma, usernames, day);
  const candidates = feed.filter((m) => (m.text && m.text.trim()) || m.hasMedia);

  if (candidates.length === 0) {
    const formula = `Нет постов за ${day} — индекс не считался.`;
    await upsertTelegramNewsDailyIndex(
      prisma,
      {
        day,
        sentiment: 50,
        formula,
        candidateCount: 0,
        usernames,
        notes: [],
        source: "heuristic",
        force: true,
      },
      options.log,
    );
    return { day, skipped: false, source: "heuristic", sentiment: 50, candidateCount: 0 };
  }

  const config = readLlmConfig();
  if (!config || isLlmDisabled()) {
    const response = fallbackResponse(
      candidates,
      false,
      config
        ? "LLM отключён (NEWS_WIDGET_LLM_DISABLED) — эвристика."
        : "LLM_API_KEY не задан — эвристика.",
      day,
    );
    await upsertTelegramNewsDailyIndex(
      prisma,
      {
        day,
        sentiment: response.sentiment,
        formula: response.explanation.formula,
        candidateCount: candidates.length,
        usernames,
        notes: response.explanation.notes,
        source: "heuristic",
        force: true,
      },
      options.log,
    );
    return {
      day,
      skipped: false,
      source: "heuristic",
      sentiment: response.sentiment,
      candidateCount: candidates.length,
    };
  }

  try {
    const calibrationBlock = await buildCalibrationExamplesBlock(prisma, candidates, options.log);
    const systemPrompt = buildSystemPrompt(calibrationBlock);
    const pick = await callLlm(config, candidates, day, systemPrompt);
    const items = resolveItems(
      candidates,
      pick.picks.map((p) => p.id),
    );
    const notes = buildNotesForItems(items, pick.picks);
    await upsertTelegramNewsDailyIndex(
      prisma,
      {
        day,
        sentiment: pick.s,
        formula: pick.formula,
        candidateCount: candidates.length,
        usernames,
        notes,
        source: "llm",
        model: config.model,
        force: true,
      },
      options.log,
    );
    return {
      day,
      skipped: false,
      source: "llm",
      sentiment: pick.s,
      candidateCount: candidates.length,
    };
  } catch (err) {
    options.log?.warn({ err, day }, "[news-index] LLM failed, writing heuristic");
    const response = fallbackResponse(
      candidates,
      false,
      "Не удалось вызвать LLM — эвристический сентимент.",
      day,
    );
    await upsertTelegramNewsDailyIndex(
      prisma,
      {
        day,
        sentiment: response.sentiment,
        formula: response.explanation.formula,
        candidateCount: candidates.length,
        usernames,
        notes: response.explanation.notes,
        source: "heuristic",
        force: true,
      },
      options.log,
    );
    return {
      day,
      skipped: false,
      source: "heuristic",
      sentiment: response.sentiment,
      candidateCount: candidates.length,
    };
  }
}

function fallbackItemNote(msg: TelegramNewsMessage): TelegramNewsWidgetItemNote {
  return {
    id: messageKey(msg),
    headline: fitHeadline(msg.text || (msg.hasMedia ? "[медиа]" : "")),
    why: "Новость дня (дополнение к топу).",
    impact: "Влияние на рынок не уточнено.",
    category: "markets",
  };
}

async function ensureTopWidgetItems(
  prisma: PrismaClient,
  options: {
    day: string;
    usernames: string[];
    filters: string[];
    preferredKeys: string[];
    noteById: Map<string, TelegramNewsWidgetItemNote>;
  },
): Promise<{ items: TelegramNewsMessage[]; notes: TelegramNewsWidgetItemNote[] }> {
  let items = applyFilters(
    await getTelegramMessagesByKeys(prisma, options.preferredKeys),
    options.filters,
  );
  const used = new Set(items.map(messageKey));

  if (items.length < TOP_N) {
    const dayFeed = await getStoredTelegramFeedForMskDay(prisma, options.usernames, options.day);
    const pool = applyFilters(
      dayFeed.filter((m) => (m.text && m.text.trim()) || m.hasMedia),
      options.filters,
    );
    for (let i = pool.length - 1; i >= 0 && items.length < TOP_N; i -= 1) {
      const msg = pool[i]!;
      const key = messageKey(msg);
      if (used.has(key)) continue;
      used.add(key);
      items.push(msg);
      if (!options.noteById.has(key)) {
        options.noteById.set(key, fallbackItemNote(msg));
      }
    }
  }

  items = items.slice(0, TOP_N);
  const notes = items.map(
    (msg) => options.noteById.get(messageKey(msg)) ?? fallbackItemNote(msg),
  );
  return { items, notes };
}

/** Виджет: только чтение дневного снимка из БД (без LLM). */
export async function getNewsWidgetInsight(
  prisma: PrismaClient,
  usernamesRaw: string[],
  filtersRaw: string[] = [],
  _log?: { warn: (obj: unknown, msg?: string) => void },
): Promise<TelegramNewsWidgetResponse> {
  const filters = normalizeFilters(filtersRaw);
  const day = resolveNewsWidgetMskDay();
  const row = await getTelegramNewsDailyIndexRow(prisma, day);

  if (!row) {
    return {
      sentiment: 50,
      why: `Индекс за ${day} ещё не посчитан — расчёт в 23:00 МСК.`,
      explanation: emptyExplanation(
        `Снимок за ${day} появится после ежедневного расчёта (23:00 МСК).`,
      ),
      items: [],
      cached: true,
      updatedAt: new Date().toISOString(),
      day,
      candidateCount: 0,
    };
  }

  const usernames = normalizeUsernames(
    usernamesRaw.length > 0 ? usernamesRaw : row.usernames,
  );
  const noteById = new Map(row.notes.map((n) => [n.id, n]));
  const { items, notes } = await ensureTopWidgetItems(prisma, {
    day: row.day,
    usernames,
    filters,
    preferredKeys: row.notes.map((n) => n.id),
    noteById,
  });

  return {
    sentiment: row.sentiment,
    why: row.formula,
    explanation: {
      formula: row.formula,
      notes,
    },
    items: applyHeadlinesToItems(items, notes),
    cached: true,
    updatedAt: row.updatedAt,
    day: row.day,
    candidateCount: row.candidateCount,
  };
}
