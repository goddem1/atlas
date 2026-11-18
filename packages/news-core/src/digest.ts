import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

export const PANORAMA_DISCLAIMER = "Аналитика чужих мнений. Не инвестиционная рекомендация";

export type DigestCall = { symbol: string; direction: string; username: string };
export type DigestCoin = { symbol: string; scores: number[] };
export type DigestChannel = { username: string; lastError: string | null; floodWaitUntil: number | null; lagMin: number | null };

export type DigestInput = {
  day: string;
  messages: number;
  calls: DigestCall[];
  coins: DigestCoin[];
  market: { score: number; nChannels: number; effectiveNChannels: number; nMessages: number; dispersion: number; overheated: boolean } | null;
  channels: DigestChannel[];
  queueDepth: number;
  now: number;
  lagBadMin: number;
  queueWarn: number;
  queueBad: number;
};

export type DigestAlert = { level: "warn" | "bad"; text: string };
export type InternalDigest = {
  day: string;
  newMessages: number;
  taken: DigestCall[];
  consensus: Array<{ symbol: string; side: "long" | "short"; voices: number }>;
  disagreement: Array<{ symbol: string; voices: number; spread: number }>;
  alerts: DigestAlert[];
};

export type PanoramaDigest = {
  asOf: string;
  disclaimer: string;
  market: DigestInput["market"];
  taken: Array<{ symbol: string; direction: string; count: number }>;
  consensus: InternalDigest["consensus"];
  disagreement: InternalDigest["disagreement"];
};

function stanceOf(scores: number[]): "long" | "short" | "split" | "thin" {
  if (scores.length < 2) return "thin";
  const positive = scores.filter((score) => score > 0.2).length;
  const negative = scores.filter((score) => score < -0.2).length;
  if (positive === scores.length) return "long";
  if (negative === scores.length) return "short";
  if (positive > 0 && negative > 0) return "split";
  return "thin";
}

export function buildDigest(input: DigestInput): InternalDigest {
  const consensus: InternalDigest["consensus"] = [];
  const disagreement: InternalDigest["disagreement"] = [];
  for (const coin of input.coins) {
    const stance = stanceOf(coin.scores);
    if (stance === "long" || stance === "short") consensus.push({ symbol: coin.symbol, side: stance, voices: coin.scores.length });
    if (stance === "split") {
      const spread = Math.max(...coin.scores) - Math.min(...coin.scores);
      disagreement.push({ symbol: coin.symbol, voices: coin.scores.length, spread });
    }
  }
  const alerts: DigestAlert[] = [];
  for (const channel of input.channels) {
    if (channel.lastError) alerts.push({ level: "bad", text: `Сбор @${channel.username} остановился` });
    if (channel.floodWaitUntil != null && channel.floodWaitUntil > input.now) alerts.push({ level: "warn", text: `Telegram просит подождать @${channel.username}` });
    if (channel.lagMin != null && channel.lagMin > input.lagBadMin) alerts.push({ level: "bad", text: `@${channel.username} молчит дольше порога` });
  }
  if (input.queueDepth >= input.queueBad) alerts.push({ level: "bad", text: `Очередь разбора: ${input.queueDepth}` });
  else if (input.queueDepth >= input.queueWarn) alerts.push({ level: "warn", text: `Очередь разбора: ${input.queueDepth}` });
  return { day: input.day, newMessages: input.messages, taken: input.calls, consensus, disagreement, alerts };
}

export function toPanorama(digest: InternalDigest, market: DigestInput["market"]): PanoramaDigest {
  const counts = new Map<string, number>();
  for (const call of digest.taken) {
    const key = `${call.symbol}\u0000${call.direction}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    asOf: digest.day,
    disclaimer: PANORAMA_DISCLAIMER,
    market,
    taken: [...counts.entries()].map(([key, count]) => {
      const [symbol, direction] = key.split("\u0000");
      return { symbol: symbol ?? "", direction: direction ?? "", count };
    }),
    consensus: digest.consensus,
    disagreement: digest.disagreement,
  };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadDigest(prisma: PrismaClient, day: string, limits: { lagBadMin: number; queueWarn: number; queueBad: number }): Promise<{ digest: InternalDigest; panorama: PanoramaDigest }> {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime())) throw new Error("Некорректный день");
  const [messages, calls, channels, prompt, snapshots] = await Promise.all([
    prisma.message.count({ where: { postedAt: { gte: start, lt: end } } }),
    prisma.call.findMany({
      where: { openedAt: { gte: start, lt: end } },
      include: { coin: { select: { symbol: true } }, channel: { select: { username: true } } },
    }),
    prisma.channel.findMany({ include: { ingest: true, messages: { orderBy: { postedAt: "desc" }, take: 1, select: { postedAt: true } } } }),
    prisma.promptVersion.findFirst({ where: { name: "extract", isActive: true }, orderBy: { version: "desc" } }),
    prisma.sentimentSnapshot.findMany({ where: { scope: { in: ["coin", "market"] }, date: start } }),
  ]);
  const queueDepth = await prisma.messageVersion.count({
    where: { extractions: { none: prompt ? { promptVersionId: prompt.id } : {} } },
  });
  const now = Date.now();
  const coins = snapshots
    .filter((row) => row.scope === "coin")
    .map((row) => {
      const scores = row.detailsJson && typeof row.detailsJson === "object" && "channelScores" in row.detailsJson && row.detailsJson.channelScores && typeof row.detailsJson.channelScores === "object"
        ? Object.values(row.detailsJson.channelScores as Record<string, unknown>).filter((value): value is number => typeof value === "number")
        : [];
      return { symbol: row.scopeKey, scores };
    });
  const marketRow = snapshots.find((row) => row.scope === "market") ?? null;
  const market = marketRow
    ? {
        score: marketRow.score,
        nChannels: marketRow.nChannels,
        effectiveNChannels: marketRow.effectiveNChannels,
        nMessages: marketRow.nMessages,
        dispersion: marketRow.dispersion ?? 0,
        overheated: marketRow.overheated,
      }
    : null;
  const digest = buildDigest({
    day,
    messages,
    calls: calls.map((call) => ({ symbol: call.coin.symbol, direction: call.direction, username: call.channel.username })),
    coins,
    market,
    channels: channels.map((channel) => ({
      username: channel.username,
      lastError: channel.ingest?.lastError ?? null,
      floodWaitUntil: channel.ingest?.floodWaitUntil?.getTime() ?? null,
      lagMin: channel.messages[0] ? (now - channel.messages[0].postedAt.getTime()) / 60000 : null,
    })),
    queueDepth,
    now,
    lagBadMin: limits.lagBadMin,
    queueWarn: limits.queueWarn,
    queueBad: limits.queueBad,
  });
  return { digest, panorama: toPanorama(digest, market) };
}

export function latestDigestDay(postedAt: Date | null, now = new Date()): string {
  return utcDay(postedAt ?? now);
}
