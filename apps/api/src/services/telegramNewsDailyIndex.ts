import type { PrismaClient } from "@prisma/client";
import type {
  TelegramNewsDailyIndexPoint,
  TelegramNewsDailyIndexResponse,
  TelegramNewsWidgetItemNote,
} from "@atlas-v1/shared";
import { parseTelegramNewsWidgetCategory } from "@atlas-v1/shared";

export type PersistDailyIndexInput = {
  day: string;
  sentiment: number;
  formula: string;
  candidateCount: number;
  usernames: string[];
  notes: TelegramNewsWidgetItemNote[];
  source: "llm" | "heuristic";
  model?: string | null;
  /** Cron/ручной пересчёт — всегда пишем поверх. */
  force?: boolean;
};

export type TelegramNewsDailyIndexRow = {
  day: string;
  sentiment: number;
  formula: string;
  candidateCount: number;
  usernames: string[];
  notes: TelegramNewsWidgetItemNote[];
  source: "llm" | "heuristic";
  model: string | null;
  updatedAt: string;
};

function parseNotes(raw: unknown): TelegramNewsWidgetItemNote[] {
  if (!Array.isArray(raw)) return [];
  const out: TelegramNewsWidgetItemNote[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id) continue;
    const kind =
      o.kind === "moved" || o.kind === "will_move" || o.kind === "narrative"
        ? o.kind
        : undefined;
    const category = parseTelegramNewsWidgetCategory(o.category ?? o.cat);
    out.push({
      id,
      why: typeof o.why === "string" ? o.why : "",
      impact: typeof o.impact === "string" ? o.impact : "",
      ...(typeof o.headline === "string" && o.headline.trim()
        ? { headline: o.headline.trim() }
        : {}),
      ...(kind ? { kind } : {}),
      ...(category ? { category } : {}),
    });
  }
  return out;
}

function parseUsernames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && Boolean(u.trim()));
}

/** Не затираем LLM-снимок эвристикой и не понижаем покрытие дня. */
function shouldOverwrite(
  existing: { source: string; candidateCount: number } | null,
  next: PersistDailyIndexInput,
): boolean {
  if (next.force) return true;
  if (!existing) return true;
  if (existing.source === "llm" && next.source === "heuristic") return false;
  if (next.source === "llm" && existing.source !== "llm") return true;
  if (next.candidateCount < existing.candidateCount) return false;
  return true;
}

export async function getTelegramNewsDailyIndexRow(
  prisma: PrismaClient,
  day: string,
): Promise<TelegramNewsDailyIndexRow | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const row = await prisma.telegramNewsDailyIndex.findUnique({ where: { day } });
  if (!row) return null;
  return {
    day: row.day,
    sentiment: row.sentiment,
    formula: row.formula,
    candidateCount: row.candidateCount,
    usernames: parseUsernames(row.usernames),
    notes: parseNotes(row.topItems),
    source: row.source === "llm" ? "llm" : "heuristic",
    model: row.model,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertTelegramNewsDailyIndex(
  prisma: PrismaClient,
  input: PersistDailyIndexInput,
  log?: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return;
  const sentiment = Math.round(Math.min(100, Math.max(0, input.sentiment)));

  try {
    const existing = await prisma.telegramNewsDailyIndex.findUnique({
      where: { day: input.day },
      select: { source: true, candidateCount: true },
    });
    if (!shouldOverwrite(existing, input)) return;

    await prisma.telegramNewsDailyIndex.upsert({
      where: { day: input.day },
      create: {
        day: input.day,
        sentiment,
        formula: input.formula,
        candidateCount: input.candidateCount,
        usernames: input.usernames,
        topItems: input.notes,
        source: input.source,
        model: input.model ?? null,
      },
      update: {
        sentiment,
        formula: input.formula,
        candidateCount: input.candidateCount,
        usernames: input.usernames,
        topItems: input.notes,
        source: input.source,
        model: input.model ?? null,
      },
    });
  } catch (err) {
    log?.warn({ err, day: input.day }, "[news-index] upsert failed");
  }
}

export async function listTelegramNewsDailyIndex(
  prisma: PrismaClient,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<TelegramNewsDailyIndexResponse> {
  const limit = Math.min(366, Math.max(1, options.limit ?? 90));
  const from = options.from && /^\d{4}-\d{2}-\d{2}$/.test(options.from) ? options.from : undefined;
  const to = options.to && /^\d{4}-\d{2}-\d{2}$/.test(options.to) ? options.to : undefined;

  if (from || to) {
    const rows = await prisma.telegramNewsDailyIndex.findMany({
      where: {
        day: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
      orderBy: { day: "asc" },
    });
    return { points: rows.map(toPoint) };
  }

  const rows = await prisma.telegramNewsDailyIndex.findMany({
    orderBy: { day: "desc" },
    take: limit,
  });
  const points = rows.map(toPoint).sort((a, b) => a.day.localeCompare(b.day));
  return { points };
}

function toPoint(row: {
  day: string;
  sentiment: number;
  candidateCount: number;
  source: string;
  updatedAt: Date;
}): TelegramNewsDailyIndexPoint {
  return {
    day: row.day,
    sentiment: row.sentiment,
    candidateCount: row.candidateCount,
    source: row.source === "llm" ? "llm" : "heuristic",
    updatedAt: row.updatedAt.toISOString(),
  };
}
