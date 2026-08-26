import type { PrismaClient, NewsPickFeedback } from "@prisma/client";
import type { TelegramNewsMessage, TelegramNewsWidgetItemNote } from "@atlas-v1/shared";
import { getTelegramNewsDailyIndexRow } from "./telegramNewsDailyIndex.js";
import {
  getStoredTelegramFeedForMskDay,
  getTelegramMessagesByKeys,
  listWatchedUsernames,
} from "./telegramNewsStore.js";
import { generateEmbedding, getEmbeddingModelName } from "./newsFeedbackEmbedding.js";

const TEXT_MAX = 320;
const TOP_N = 5;

function readPriceHintWindowHours(): number {
  const raw = Number.parseInt(process.env.NEWS_FEEDBACK_PRICE_HINT_WINDOW_HOURS ?? "4", 10);
  return Number.isFinite(raw) ? Math.min(24, Math.max(1, raw)) : 4;
}

export async function getPriceMoveHint(
  symbol: "BTCUSDT" | "ETHUSDT",
  postTimestampMs: number,
  windowHours = readPriceHintWindowHours(),
): Promise<number | null> {
  const interval = "15m";
  const endTime = postTimestampMs + windowHours * 60 * 60 * 1000;
  const limit = Math.min(1000, windowHours * 4 + 1);
  const url =
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}` +
    `&interval=${interval}&startTime=${postTimestampMs}&endTime=${endTime}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const klines = (await res.json()) as unknown[];
  if (!Array.isArray(klines) || klines.length === 0) return null;

  const first = klines[0] as unknown[];
  const last = klines[klines.length - 1] as unknown[];
  const openPrice = Number.parseFloat(String(first[1]));
  const closePrice = Number.parseFloat(String(last[4]));
  if (!Number.isFinite(openPrice) || !Number.isFinite(closePrice) || openPrice === 0) return null;
  return ((closePrice - openPrice) / openPrice) * 100;
}

export async function getPriceHintsForPost(postTimestamp: Date): Promise<{
  priceMoveBtc: number | null;
  priceMoveEth: number | null;
  priceMoveWindowHours: number;
}> {
  const windowHours = readPriceHintWindowHours();
  const ts = postTimestamp.getTime();
  const [priceMoveBtc, priceMoveEth] = await Promise.all([
    getPriceMoveHint("BTCUSDT", ts, windowHours),
    getPriceMoveHint("ETHUSDT", ts, windowHours),
  ]);
  return { priceMoveBtc, priceMoveEth, priceMoveWindowHours: windowHours };
}

export type SaveFeedbackInput = {
  postKey: string;
  day: string;
  postText: string;
  postTimestamp: Date;
  source: "top5" | "candidate";
  llmWeight?: number;
  llmPolarity?: number;
  llmType?: string;
  llmCategory?: string;
  llmHeadline?: string;
  humanWeight?: number;
  humanPolarity?: number;
  humanType?: string;
  humanCorrect?: boolean;
  humanNote: string;
};

export async function saveFeedback(
  prisma: PrismaClient,
  input: SaveFeedbackInput,
): Promise<NewsPickFeedback> {
  const note = input.humanNote.trim();
  if (!note) {
    throw new Error("humanNote is required");
  }

  const postText = input.postText.trim().slice(0, TEXT_MAX);
  const [{ priceMoveBtc, priceMoveEth, priceMoveWindowHours }, embedding] = await Promise.all([
    getPriceHintsForPost(input.postTimestamp),
    generateEmbedding(postText),
  ]);

  const embeddingModel = getEmbeddingModelName();

  return prisma.newsPickFeedback.upsert({
    where: { postKey: input.postKey },
    create: {
      postKey: input.postKey,
      day: input.day,
      postText,
      postTimestamp: input.postTimestamp,
      source: input.source,
      llmWeight: input.llmWeight ?? null,
      llmPolarity: input.llmPolarity ?? null,
      llmType: input.llmType ?? null,
      llmCategory: input.llmCategory ?? null,
      llmHeadline: input.llmHeadline ?? null,
      humanWeight: input.humanWeight ?? null,
      humanPolarity: input.humanPolarity ?? null,
      humanType: input.humanType ?? null,
      humanCorrect: input.humanCorrect ?? null,
      humanNote: note,
      priceMoveBtc,
      priceMoveEth,
      priceMoveWindowHours,
      embedding,
      embeddingModel,
    },
    update: {
      humanWeight: input.humanWeight ?? null,
      humanPolarity: input.humanPolarity ?? null,
      humanType: input.humanType ?? null,
      humanCorrect: input.humanCorrect ?? null,
      humanNote: note,
      priceMoveBtc,
      priceMoveEth,
      priceMoveWindowHours,
    },
  });
}

export type NewsFeedbackCandidate = {
  postKey: string;
  channelUsername: string;
  messageId: number;
  date: string;
  text: string;
  url: string;
  source: "top5" | "candidate";
  llmWeight: number | null;
  llmPolarity: number | null;
  llmType: string | null;
  llmCategory: string | null;
  llmHeadline: string | null;
  llmWhy: string | null;
  llmImpact: string | null;
  hasFeedback: boolean;
  feedback: {
    humanNote: string;
    humanWeight: number | null;
    humanPolarity: number | null;
    humanType: string | null;
    humanCorrect: boolean | null;
    priceMoveBtc: number | null;
    priceMoveEth: number | null;
    priceMoveWindowHours: number | null;
  } | null;
};

export type NewsFeedbackCandidatesResponse = {
  day: string;
  sentiment: number | null;
  formula: string | null;
  candidateCount: number;
  top5: NewsFeedbackCandidate[];
  candidates: NewsFeedbackCandidate[];
};

function messageKey(msg: TelegramNewsMessage): string {
  return `${msg.channelUsername}:${msg.id}`;
}

function compactPostText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
}

function mapNoteMeta(note: TelegramNewsWidgetItemNote | undefined): Pick<
  NewsFeedbackCandidate,
  "llmCategory" | "llmHeadline" | "llmType" | "llmWhy" | "llmImpact"
> {
  return {
    llmCategory: note?.category ?? null,
    llmHeadline: note?.headline ?? null,
    llmType: note?.kind ?? null,
    llmWhy: note?.why ?? null,
    llmImpact: note?.impact ?? null,
  };
}

function fallbackItemNote(msg: TelegramNewsMessage): TelegramNewsWidgetItemNote {
  return {
    id: messageKey(msg),
    headline: compactPostText(msg.text || (msg.hasMedia ? "[медиа]" : "")),
    why: "Новость дня (дополнение к топу).",
    impact: "Влияние на рынок не уточнено.",
    category: "markets",
  };
}

function resolveTopMessages(
  preferredKeys: string[],
  preferredMessages: TelegramNewsMessage[],
  dayFeed: TelegramNewsMessage[],
  noteById: Map<string, TelegramNewsWidgetItemNote>,
): TelegramNewsMessage[] {
  const messagesByKey = new Map(preferredMessages.map((m) => [messageKey(m), m]));
  const items: TelegramNewsMessage[] = [];
  for (const key of preferredKeys) {
    const msg = messagesByKey.get(key);
    if (msg) items.push(msg);
  }
  const used = new Set(items.map(messageKey));

  if (items.length < TOP_N) {
    const pool = dayFeed.filter((m) => (m.text && m.text.trim()) || m.hasMedia);
    for (let i = pool.length - 1; i >= 0 && items.length < TOP_N; i -= 1) {
      const msg = pool[i]!;
      const key = messageKey(msg);
      if (used.has(key)) continue;
      used.add(key);
      items.push(msg);
      if (!noteById.has(key)) {
        noteById.set(key, fallbackItemNote(msg));
      }
    }
  }

  return items.slice(0, TOP_N);
}

function toCandidate(
  msg: TelegramNewsMessage,
  source: "top5" | "candidate",
  note: TelegramNewsWidgetItemNote | undefined,
  feedbackByKey: Map<string, NewsPickFeedback>,
): NewsFeedbackCandidate {
  const postKey = messageKey(msg);
  const fb = feedbackByKey.get(postKey);
  return {
    postKey,
    channelUsername: msg.channelUsername,
    messageId: msg.id,
    date: msg.date,
    text: compactPostText(msg.text || (msg.hasMedia ? "[медиа]" : "")),
    url: msg.url,
    source,
    llmWeight: null,
    llmPolarity: null,
    ...mapNoteMeta(note),
    hasFeedback: Boolean(fb),
    feedback: fb
      ? {
          humanNote: fb.humanNote,
          humanWeight: fb.humanWeight,
          humanPolarity: fb.humanPolarity,
          humanType: fb.humanType,
          humanCorrect: fb.humanCorrect,
          priceMoveBtc: fb.priceMoveBtc,
          priceMoveEth: fb.priceMoveEth,
          priceMoveWindowHours: fb.priceMoveWindowHours,
        }
      : null,
  };
}

export async function listNewsFeedbackCandidates(
  prisma: PrismaClient,
  day: string,
  usernamesRaw?: string[],
): Promise<NewsFeedbackCandidatesResponse> {
  const row = await getTelegramNewsDailyIndexRow(prisma, day);
  const usernames =
    usernamesRaw && usernamesRaw.length > 0
      ? usernamesRaw
      : row?.usernames?.length
        ? row.usernames
        : await listWatchedUsernames(prisma);

  const noteById = new Map((row?.notes ?? []).map((n) => [n.id, n]));
  const preferredKeys = (row?.notes ?? []).map((n) => n.id);

  const [preferredMessages, dayFeed, feedbackRows] = await Promise.all([
    preferredKeys.length > 0 ? getTelegramMessagesByKeys(prisma, preferredKeys) : Promise.resolve([]),
    getStoredTelegramFeedForMskDay(prisma, usernames, day),
    prisma.newsPickFeedback.findMany({ where: { day } }),
  ]);

  const feedbackByKey = new Map(feedbackRows.map((f) => [f.postKey, f]));
  const topMessages = resolveTopMessages(preferredKeys, preferredMessages, dayFeed, noteById);
  const topKeySet = new Set(topMessages.map(messageKey));

  const top5 = topMessages.map((msg) =>
    toCandidate(msg, "top5", noteById.get(messageKey(msg)), feedbackByKey),
  );

  const candidates = dayFeed
    .filter((m) => (m.text && m.text.trim()) || m.hasMedia)
    .filter((m) => !topKeySet.has(messageKey(m)))
    .map((msg) => toCandidate(msg, "candidate", undefined, feedbackByKey));

  return {
    day,
    sentiment: row?.sentiment ?? null,
    formula: row?.formula ?? null,
    candidateCount: row?.candidateCount ?? dayFeed.length,
    top5,
    candidates,
  };
}

export async function loadFeedbackForCalibration(prisma: PrismaClient): Promise<NewsPickFeedback[]> {
  const rows = await prisma.newsPickFeedback.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.filter((row) => row.embedding.length > 0);
}
