import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

const DAY = 24 * 60 * 60 * 1000;

export type SentimentParams = {
  assumptions: string;
  halfLifeDays: number;
  lookbackDays: number;
  overheatedScore: number;
  overheatedShare: number;
  overheatedDispersionMax: number;
  coordinatedChannels: number;
  coordinatedWindowMin: number;
  majorSymbols: string[];
  minChannels: number;
  minMessages: number;
  similarity: number;
};

export const DEFAULT_SENTIMENT: SentimentParams = {
  assumptions: "начальные, подберите по данным. Веса каналов равные и равны 1, вес тестера не применяется.",
  halfLifeDays: 3,
  lookbackDays: 14,
  overheatedScore: 0.5,
  overheatedShare: 0.7,
  overheatedDispersionMax: 0.25,
  coordinatedChannels: 3,
  coordinatedWindowMin: 60,
  majorSymbols: ["BTC", "ETH", "SOL", "BNB", "XRP"],
  minChannels: 5,
  minMessages: 30,
  similarity: 0.8,
};

export type RawSentiment = {
  messageId: string;
  channelId: string;
  postedAt: number;
  text: string;
  isAd: boolean;
  msgType: string | null;
  stance: number | null;
  confidence: number | null;
  market: { stance: number; confidence: number; themes: string[] } | null;
  coins: Array<{ symbol: string; stance: number | null; confidence: number | null }>;
};

export type SentimentVoice = {
  channelId: string;
  messageId: string;
  postedAt: number;
  text: string;
  stance: number;
  confidence: number;
  key: string;
};

export type SentimentDay = {
  date: Date;
  scope: "market" | "coin" | "theme";
  scopeKey: string;
  score: number;
  dispersion: number;
  nMessages: number;
  nChannels: number;
  effectiveNChannels: number;
  overheated: boolean;
  details: {
    weights: string;
    channelScores: Record<string, number>;
    clusters: string[][];
    coordinated: Array<{ symbol: string; at: string; channels: string[] }>;
  };
};

export function readSentimentParams(value: unknown): SentimentParams {
  const raw = value && typeof value === "object" ? (value as Partial<SentimentParams>) : {};
  return {
    ...DEFAULT_SENTIMENT,
    ...raw,
    majorSymbols: raw.majorSymbols ?? DEFAULT_SENTIMENT.majorSymbols,
  };
}

export function textsSimilar(left: string, right: string, threshold: number): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.length < 20 || b.length < 20) return false;
  if (a === b) return true;
  const ta = new Set(a.split(" ").filter((word) => word.length > 2));
  const tb = new Set(b.split(" ").filter((word) => word.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared += 1;
  return shared / (ta.size + tb.size - shared) >= threshold;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function voicesFrom(rows: RawSentiment[]): { market: SentimentVoice[]; coins: SentimentVoice[]; themes: SentimentVoice[] } {
  const market: SentimentVoice[] = [];
  const coins: SentimentVoice[] = [];
  const themes: SentimentVoice[] = [];
  for (const row of rows) {
    if (row.isAd) continue;
    const marketStance = row.market?.stance ?? (row.msgType === "view" || row.msgType === "signal" || row.msgType === "news" ? row.stance : null);
    const marketConfidence = row.market?.confidence ?? row.confidence;
    if (marketStance != null && marketConfidence != null && marketConfidence > 0) {
      market.push(voice(row, "", marketStance, marketConfidence));
    }
    for (const coin of row.coins) {
      const stance = coin.stance ?? row.stance;
      const confidence = coin.confidence ?? row.confidence;
      if (!coin.symbol || stance == null || confidence == null || confidence <= 0) continue;
      coins.push(voice(row, coin.symbol, stance, confidence));
    }
    for (const theme of row.market?.themes ?? []) {
      const label = theme.trim();
      if (!label || marketStance == null || marketConfidence == null || marketConfidence <= 0) continue;
      themes.push(voice(row, label, marketStance, marketConfidence));
    }
  }
  return { market, coins, themes };
}

function voice(row: RawSentiment, key: string, stance: number, confidence: number): SentimentVoice {
  return {
    channelId: row.channelId,
    messageId: row.messageId,
    postedAt: row.postedAt,
    text: row.text,
    stance: Math.max(-1, Math.min(1, stance)),
    confidence: Math.max(0, Math.min(1, confidence)),
    key,
  };
}

export function scoreDay(voices: SentimentVoice[], dayStart: number, params: SentimentParams, scope: SentimentDay["scope"], scopeKey: string): SentimentDay | null {
  const asOf = dayStart + DAY;
  const usable = voices.filter((item) => item.postedAt < asOf && asOf - item.postedAt <= params.lookbackDays * DAY);
  const byChannel = new Map<string, SentimentVoice[]>();
  for (const item of usable) {
    const list = byChannel.get(item.channelId) ?? [];
    list.push(item);
    byChannel.set(item.channelId, list);
  }
  const channelScores = new Map<string, number>();
  let nMessages = 0;
  for (const [channelId, items] of byChannel) {
    let weighted = 0;
    let weightSum = 0;
    for (const item of items) {
      const ageDays = (asOf - item.postedAt) / DAY;
      const weight = item.confidence * 0.5 ** (ageDays / params.halfLifeDays);
      if (weight <= 0) continue;
      weighted += item.stance * weight;
      weightSum += weight;
      nMessages += 1;
    }
    if (weightSum > 0) channelScores.set(channelId, weighted / weightSum);
  }
  if (channelScores.size === 0) return null;
  const links: Array<[string, string]> = [];
  const channels = [...channelScores.keys()];
  for (let i = 0; i < channels.length; i += 1) {
    for (let j = i + 1; j < channels.length; j += 1) {
      const left = byChannel.get(channels[i] ?? "") ?? [];
      const right = byChannel.get(channels[j] ?? "") ?? [];
      const similar = left.some((a) => right.some((b) => textsSimilar(a.text, b.text, params.similarity)));
      if (similar) links.push([channels[i] ?? "", channels[j] ?? ""]);
    }
  }
  const parent = new Map(channels.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  for (const [left, right] of links) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  }
  const clusters = new Map<string, string[]>();
  for (const channelId of channelScores.keys()) {
    const root = find(channelId);
    const list = clusters.get(root) ?? [];
    list.push(channelId);
    clusters.set(root, list);
  }
  const means = [...clusters.values()].map((ids) => ids.reduce((sum, id) => sum + (channelScores.get(id) ?? 0), 0) / ids.length);
  const score = means.reduce((sum, value) => sum + value, 0) / means.length;
  const values = [...channelScores.values()];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const dispersion = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const hotShare = values.filter((value) => value > params.overheatedScore).length / values.length;
  return {
    date: new Date(dayStart),
    scope,
    scopeKey,
    score,
    dispersion,
    nMessages,
    nChannels: channelScores.size,
    effectiveNChannels: clusters.size,
    overheated: values.length >= 2 && hotShare >= params.overheatedShare && dispersion <= params.overheatedDispersionMax,
    details: {
      weights: "равные, вес тестера не применяется",
      channelScores: Object.fromEntries(channelScores),
      clusters: [...clusters.values()],
      coordinated: [],
    },
  };
}

export function coordinatedMentions(
  events: Array<{ channelId: string; symbol: string; postedAt: number }>,
  params: SentimentParams,
): Array<{ symbol: string; at: string; channels: string[] }> {
  const major = new Set(params.majorSymbols);
  const windowMs = params.coordinatedWindowMin * 60 * 1000;
  const ordered = [...events].sort((a, b) => a.postedAt - b.postedAt);
  const flags: Array<{ symbol: string; at: string; channels: string[] }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < ordered.length; i += 1) {
    const start = ordered[i];
    if (!start || major.has(start.symbol)) continue;
    const channels = new Set<string>();
    for (let j = i; j < ordered.length; j += 1) {
      const next = ordered[j];
      if (!next || next.postedAt - start.postedAt > windowMs) break;
      if (next.symbol !== start.symbol) continue;
      channels.add(next.channelId);
    }
    if (channels.size < params.coordinatedChannels) continue;
    const key = `${start.symbol}:${Math.floor(start.postedAt / windowMs)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push({ symbol: start.symbol, at: new Date(start.postedAt).toISOString(), channels: [...channels] });
  }
  return flags;
}

function utcDay(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function writeSentiment(prisma: PrismaClient): Promise<{ snapshots: number; flags: number }> {
  const paramsRow = await prisma.paramSet.findFirst({ where: { kind: "sentiment", isActive: true }, orderBy: { version: "desc" } });
  if (!paramsRow) throw new Error("Нет активного набора sentiment");
  const params = readSentimentParams(paramsRow.paramsJson);
  const extractions = await prisma.extraction.findMany({
    where: { schemaValid: true },
    orderBy: { createdAt: "desc" },
    include: {
      coins: { include: { coin: { select: { symbol: true } } } },
      messageVersion: { include: { message: { select: { id: true, channelId: true, postedAt: true, isForward: true } } } },
    },
  });
  const seen = new Set<string>();
  const rows: RawSentiment[] = [];
  for (const row of extractions) {
    const message = row.messageVersion.message;
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const parsed = row.parsedJson && typeof row.parsedJson === "object" ? (row.parsedJson as Record<string, unknown>) : {};
    const marketRaw = parsed.market_view && typeof parsed.market_view === "object" ? (parsed.market_view as Record<string, unknown>) : null;
    const coinStance = new Map<string, { stance: number | null; confidence: number | null }>();
    if (Array.isArray(parsed.coins)) {
      for (const coin of parsed.coins) {
        if (!coin || typeof coin !== "object") continue;
        const record = coin as Record<string, unknown>;
        const mention = typeof record.raw_mention === "string" ? record.raw_mention : "";
        coinStance.set(mention, { stance: numberOrNull(record.stance), confidence: numberOrNull(record.confidence) });
      }
    }
    rows.push({
      messageId: message.id,
      channelId: message.channelId,
      postedAt: message.postedAt.getTime(),
      text: row.messageVersion.text,
      isAd: row.isAd,
      msgType: row.msgType,
      stance: numberOrNull(parsed.stance),
      confidence: numberOrNull(parsed.confidence),
      market: marketRaw && numberOrNull(marketRaw.stance) != null && numberOrNull(marketRaw.confidence) != null
        ? {
            stance: numberOrNull(marketRaw.stance) as number,
            confidence: numberOrNull(marketRaw.confidence) as number,
            themes: Array.isArray(marketRaw.themes) ? marketRaw.themes.filter((theme): theme is string => typeof theme === "string") : [],
          }
        : null,
      coins: row.coins.flatMap((coin) => {
        if (!coin.coin?.symbol || coin.resolveStatus !== "resolved") return [];
        const parsedCoin = coinStance.get(coin.rawMention);
        return [{ symbol: coin.coin.symbol, stance: parsedCoin?.stance ?? null, confidence: parsedCoin?.confidence ?? null }];
      }),
    });
  }
  const voices = voicesFrom(rows);
  const times = rows.filter((row) => !row.isAd).map((row) => row.postedAt);
  if (times.length === 0) return { snapshots: 0, flags: 0 };
  const first = utcDay(Math.min(...times));
  const last = utcDay(Math.min(Date.now(), Math.max(...times)));
  const days: SentimentDay[] = [];
  for (let day = first; day <= last; day += DAY) {
    const market = scoreDay(voices.market, day, params, "market", "");
    const flags = coordinatedMentions(
      voices.coins.filter((item) => utcDay(item.postedAt) === day).map((item) => ({ channelId: item.channelId, symbol: item.key, postedAt: item.postedAt })),
      params,
    );
    if (market) {
      market.details.coordinated = flags;
      days.push(market);
    }
    for (const symbol of new Set(voices.coins.map((item) => item.key))) {
      const scored = scoreDay(voices.coins.filter((item) => item.key === symbol), day, params, "coin", symbol);
      if (scored) days.push(scored);
    }
    for (const theme of new Set(voices.themes.map((item) => item.key))) {
      const scored = scoreDay(voices.themes.filter((item) => item.key === theme), day, params, "theme", theme);
      if (scored) days.push(scored);
    }
  }
  await prisma.sentimentSnapshot.deleteMany({ where: { paramSetId: paramsRow.id } });
  if (days.length > 0) {
    await prisma.sentimentSnapshot.createMany({
      data: days.map((day) => ({
        date: day.date,
        scope: day.scope,
        scopeKey: day.scopeKey,
        score: day.score,
        dispersion: day.dispersion,
        nMessages: day.nMessages,
        nChannels: day.nChannels,
        effectiveNChannels: day.effectiveNChannels,
        overheated: day.overheated,
        paramSetId: paramsRow.id,
        detailsJson: day.details,
      })),
    });
  }
  return { snapshots: days.length, flags: days.reduce((sum, day) => sum + day.details.coordinated.length, 0) };
}
