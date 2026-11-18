import { z } from "zod";
import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

const DAY = 24 * 60 * 60 * 1000;

const claimSchema = z.object({
  text: z.string().default(""),
  messageIds: z.array(z.string()).default([]),
});

export const profileSchema = z.object({
  mood: z.string().default(""),
  moodMessageIds: z.array(z.string()).default([]),
  watches: z.array(claimSchema).default([]),
  expectations: z.array(claimSchema).default([]),
  horizon: z.enum(["days", "weeks", "months", "unknown"]).default("unknown"),
  style: z.string().default(""),
  styleMessageIds: z.array(z.string()).default([]),
  themes: z.array(claimSchema).default([]),
  changedViews: z.array(claimSchema).default([]),
});

export type ProfileClaim = { text: string; messageIds: string[] };
export type KeptProfile = {
  mood: string;
  watches: ProfileClaim[];
  expectations: ProfileClaim[];
  horizon: "days" | "weeks" | "months" | "unknown";
  style: string;
  themes: ProfileClaim[];
  changedViews: ProfileClaim[];
};

export type CheckedProfile = {
  profile: KeptProfile;
  stats: { claims: number; kept: number; dropped: number };
  evidenceMessageIds: string[];
};

export function weekStartUtc(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(midnight - offset * DAY);
}

function keepClaim(claim: { text: string; messageIds: string[] }, allowed: Set<string>): ProfileClaim | null {
  const text = claim.text.trim();
  const ids = [...new Set(claim.messageIds.map((id) => id.trim()).filter(Boolean))];
  if (!text || ids.length === 0 || ids.some((id) => !allowed.has(id))) return null;
  return { text, messageIds: ids };
}

export function checkProfile(raw: unknown, allowedIds: Iterable<string>): CheckedProfile | null {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const allowed = new Set(allowedIds);
  let claims = 0;
  let kept = 0;
  const lists = (items: Array<{ text: string; messageIds: string[] }>) => {
    const saved: ProfileClaim[] = [];
    for (const item of items) {
      if (!item.text.trim()) continue;
      claims += 1;
      const claim = keepClaim(item, allowed);
      if (!claim) continue;
      kept += 1;
      saved.push(claim);
    }
    return saved;
  };
  let mood = "";
  if (parsed.data.mood.trim()) {
    claims += 1;
    const claim = keepClaim({ text: parsed.data.mood, messageIds: parsed.data.moodMessageIds }, allowed);
    if (claim) {
      kept += 1;
      mood = claim.text;
    }
  }
  let style = "";
  if (parsed.data.style.trim()) {
    claims += 1;
    const claim = keepClaim({ text: parsed.data.style, messageIds: parsed.data.styleMessageIds }, allowed);
    if (claim) {
      kept += 1;
      style = claim.text;
    }
  }
  const profile: KeptProfile = {
    mood,
    watches: lists(parsed.data.watches),
    expectations: lists(parsed.data.expectations),
    horizon: parsed.data.horizon,
    style,
    themes: lists(parsed.data.themes),
    changedViews: lists(parsed.data.changedViews),
  };
  const evidenceMessageIds = [
    ...(mood ? parsed.data.moodMessageIds.filter((id) => allowed.has(id)) : []),
    ...(style ? parsed.data.styleMessageIds.filter((id) => allowed.has(id)) : []),
    ...profile.watches.flatMap((claim) => claim.messageIds),
    ...profile.expectations.flatMap((claim) => claim.messageIds),
    ...profile.themes.flatMap((claim) => claim.messageIds),
    ...profile.changedViews.flatMap((claim) => claim.messageIds),
  ];
  return {
    profile,
    stats: { claims, kept, dropped: claims - kept },
    evidenceMessageIds: [...new Set(evidenceMessageIds)],
  };
}

export function diffProfiles(previous: KeptProfile | null, next: KeptProfile): { changed: boolean; moodChanged: boolean; horizonChanged: boolean; addedThemes: string[]; removedThemes: string[] } | null {
  if (!previous) return null;
  const prevThemes = new Set(previous.themes.map((theme) => theme.text));
  const nextThemes = new Set(next.themes.map((theme) => theme.text));
  const addedThemes = [...nextThemes].filter((theme) => !prevThemes.has(theme));
  const removedThemes = [...prevThemes].filter((theme) => !nextThemes.has(theme));
  const moodChanged = previous.mood !== next.mood;
  const horizonChanged = previous.horizon !== next.horizon;
  return {
    changed: moodChanged || horizonChanged || addedThemes.length > 0 || removedThemes.length > 0 || next.changedViews.length > 0,
    moodChanged,
    horizonChanged,
    addedThemes,
    removedThemes,
  };
}

type ProfileFact = {
  messageId: string;
  postedAt: string;
  msgType: string | null;
  direction: unknown;
  coins: unknown;
  themes: unknown;
  evidence: string;
};

function factOf(messageId: string, postedAt: Date, msgType: string | null, parsed: unknown): ProfileFact {
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const market = record.market_view && typeof record.market_view === "object" ? (record.market_view as { themes?: unknown }) : null;
  return {
    messageId,
    postedAt: postedAt.toISOString(),
    msgType,
    direction: record.direction ?? null,
    coins: Array.isArray(record.coins) ? record.coins : [],
    themes: market?.themes ?? [],
    evidence: typeof record.evidence === "string" ? record.evidence.slice(0, 240) : "",
  };
}

export async function writeWeeklyProfiles(
  prisma: PrismaClient,
  complete: (system: string, user: string) => Promise<string>,
): Promise<{ created: number; skipped: number; openWeeks: number; failed: number; stopped: string | null }> {
  const prompt = await prisma.promptVersion.findFirst({ where: { name: "profile", isActive: true }, orderBy: { version: "desc" } });
  if (!prompt) throw new Error("Нет активного промпта profile");
  const rows = await prisma.extraction.findMany({
    where: { schemaValid: true, isAd: false },
    include: { messageVersion: { include: { message: { select: { id: true, channelId: true, postedAt: true } } } } },
  });
  const groups = new Map<string, { channelId: string; week: Date; facts: ProfileFact[] }>();
  for (const row of rows) {
    const message = row.messageVersion.message;
    const week = weekStartUtc(message.postedAt);
    const key = `${message.channelId}:${week.toISOString()}`;
    const group = groups.get(key) ?? { channelId: message.channelId, week, facts: [] };
    group.facts.push(factOf(message.id, message.postedAt, row.msgType, row.parsedJson));
    groups.set(key, group);
  }
  const now = Date.now();
  let created = 0;
  let skipped = 0;
  let openWeeks = 0;
  let failed = 0;
  let stopped: string | null = null;
  for (const group of [...groups.values()].sort((a, b) => a.week.getTime() - b.week.getTime())) {
    if (group.week.getTime() + 7 * DAY > now) {
      openWeeks += 1;
      continue;
    }
    const existing = await prisma.channelProfile.findFirst({
      where: { channelId: group.channelId, weekStart: group.week, promptVersionId: prompt.id },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const previous = await prisma.channelProfile.findFirst({
      where: { channelId: group.channelId, promptVersionId: prompt.id, weekStart: { lt: group.week } },
      orderBy: { weekStart: "desc" },
    });
    const previousProfile = previous && previous.profileJson && typeof previous.profileJson === "object" && "profile" in previous.profileJson
      ? (previous.profileJson as { profile?: KeptProfile }).profile ?? null
      : null;
    const allowed = group.facts.map((fact) => fact.messageId);
    const user = JSON.stringify({
      weekStart: group.week.toISOString(),
      facts: group.facts.slice(0, 60),
      previous: previousProfile
        ? { mood: previousProfile.mood, horizon: previousProfile.horizon, themes: previousProfile.themes.map((theme) => theme.text) }
        : null,
    });
    let content = "";
    try {
      content = await complete(prompt.body, user);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/лимит|limit|quota|insufficient/i.test(message)) {
        stopped = message;
        break;
      }
      failed += 1;
      continue;
    }
    let raw: unknown;
    try {
      const { parseModelJson } = await import("./validate.js");
      raw = parseModelJson(content);
    } catch {
      failed += 1;
      continue;
    }
    const checked = checkProfile(raw, allowed);
    if (!checked) {
      failed += 1;
      continue;
    }
    await prisma.channelProfile.create({
      data: {
        channelId: group.channelId,
        weekStart: group.week,
        promptVersionId: prompt.id,
        profileJson: { profile: checked.profile, stats: checked.stats },
        evidenceMessageIds: checked.evidenceMessageIds,
        diffFromPrevJson: diffProfiles(previousProfile, checked.profile) ?? undefined,
      },
    });
    created += 1;
  }
  return { created, skipped, openWeeks, failed, stopped };
}
