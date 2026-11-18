import type { CallEventType, CallStatus, Direction, Horizon, PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

export type OpenCallRef = { id: string; coinId: string };

export function pickOpenCall(args: {
  coinId: string | null;
  replyCallIds: string[];
  openCalls: OpenCallRef[];
}): { kind: "call"; id: string } | { kind: "review"; reason: "no_open_call" | "multiple_open_calls" } {
  const replyOpen = args.openCalls.filter((call) => args.replyCallIds.includes(call.id));
  if (replyOpen.length === 1) {
    const only = replyOpen[0];
    if (only) return { kind: "call", id: only.id };
  }
  if (replyOpen.length > 1) {
    const sameCoin = args.coinId ? replyOpen.filter((call) => call.coinId === args.coinId) : [];
    if (sameCoin.length === 1 && sameCoin[0]) return { kind: "call", id: sameCoin[0].id };
    return { kind: "review", reason: "multiple_open_calls" };
  }
  if (!args.coinId) return { kind: "review", reason: "no_open_call" };
  const sameCoin = args.openCalls.filter((call) => call.coinId === args.coinId);
  if (sameCoin.length === 1 && sameCoin[0]) return { kind: "call", id: sameCoin[0].id };
  if (sameCoin.length === 0) return { kind: "review", reason: "no_open_call" };
  return { kind: "review", reason: "multiple_open_calls" };
}

type Parsed = {
  msg_type?: string;
  direction?: string | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop?: number | null;
  targets?: unknown;
  horizon?: string;
  leverage_mentioned?: number | null;
  refers_to_previous?: boolean;
  update_type?: string | null;
  rejectedLevels?: unknown;
};

const UPDATE_TYPES = ["stop_moved", "partial_take", "closed_profit", "closed_loss", "invalidated", "comment", "update"] as const;

function parsedOf(value: unknown): Parsed {
  return value && typeof value === "object" ? (value as Parsed) : {};
}

function asDirection(value: string | null | undefined): Direction | null {
  if (value === "long" || value === "short" || value === "neutral") return value;
  return null;
}

function asHorizon(value: string | undefined): Horizon {
  if (value === "days" || value === "weeks" || value === "months") return value;
  return "unknown";
}

function asEvent(value: string | null | undefined): CallEventType {
  if (value && UPDATE_TYPES.includes(value as (typeof UPDATE_TYPES)[number])) return value as CallEventType;
  return "update";
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function isOpen(status: CallStatus): boolean {
  return status === "open" || status === "updated";
}

export async function linkCalls(prisma: PrismaClient): Promise<{ created: number; linked: number; reviews: number }> {
  const channels = await prisma.channel.findMany({ select: { id: true } });
  let created = 0;
  let linked = 0;
  let reviews = 0;
  for (const channel of channels) {
    const result = await linkChannel(prisma, channel.id);
    created += result.created;
    linked += result.linked;
    reviews += result.reviews;
  }
  return { created, linked, reviews };
}

async function linkChannel(prisma: PrismaClient, channelId: string): Promise<{ created: number; linked: number; reviews: number }> {
  const messages = await prisma.message.findMany({
    where: { channelId },
    orderBy: { postedAt: "asc" },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { extractions: { where: { schemaValid: true }, orderBy: { createdAt: "desc" }, take: 1, include: { coins: true } } },
      },
    },
  });
  const byTg = new Map(messages.map((message) => [message.tgMsgId, message]));
  const calls = await prisma.call.findMany({ where: { channelId } });
  const open: OpenCallRef[] = calls.filter((call) => isOpen(call.status)).map((call) => ({ id: call.id, coinId: call.coinId }));
  const callsByMessage = new Map<string, string[]>();
  for (const call of calls) {
    const list = callsByMessage.get(call.openedByMessageId) ?? [];
    list.push(call.id);
    callsByMessage.set(call.openedByMessageId, list);
  }
  let created = 0;
  let linked = 0;
  let reviews = 0;

  for (const message of messages) {
    const extraction = message.versions[0]?.extractions[0];
    if (!extraction || extraction.isAd) continue;
    const parsed = parsedOf(extraction.parsedJson);
    const updateType = parsed.update_type ?? null;
    const isUpdate = parsed.msg_type === "result" || Boolean(updateType) || parsed.refers_to_previous === true;
    const isIdea = parsed.msg_type === "signal" || parsed.msg_type === "view";
    if (!isUpdate && !isIdea) continue;

    const reply = message.replyToTgMsgId != null ? byTg.get(message.replyToTgMsgId) : undefined;
    const replyCallIds = reply ? callsByMessage.get(reply.id) ?? [] : [];

    if (isUpdate) {
      const mentions = extraction.coins.length > 0 ? extraction.coins : [{ rawMention: "", coinId: null, resolveStatus: "unknown" as const }];
      for (const mention of mentions) {
        if (mention.resolveStatus === "ambiguous" || mention.resolveStatus === "unknown") {
          reviews += await saveReview(prisma, message.id, extraction.id, mention.resolveStatus === "ambiguous" ? "ambiguous_coin" : "unknown_coin", mention.rawMention, [], []);
          continue;
        }
        const picked = pickOpenCall({ coinId: mention.coinId, replyCallIds, openCalls: open });
        if (picked.kind === "review") {
          const candidates = open.filter((call) => !mention.coinId || call.coinId === mention.coinId).map((call) => call.id);
          reviews += await saveReview(prisma, message.id, extraction.id, picked.reason, mention.rawMention, candidates, []);
          continue;
        }
        const attached = await attachUpdate(prisma, picked.id, message, extraction.id, parsed);
        if (attached) linked += 1;
        if (attached === "closed") {
          const index = open.findIndex((call) => call.id === picked.id);
          if (index >= 0) open.splice(index, 1);
        }
      }
      continue;
    }

    for (const mention of extraction.coins) {
      if (mention.resolveStatus !== "resolved" || !mention.coinId) {
        reviews += await saveReview(
          prisma,
          message.id,
          extraction.id,
          mention.resolveStatus === "ambiguous" ? "ambiguous_coin" : "unknown_coin",
          mention.rawMention,
          [],
          [],
        );
        continue;
      }
      const existing = calls.find((call) => call.extractionId === extraction.id && call.coinId === mention.coinId);
      if (existing) {
        if (isOpen(existing.status) && !open.some((call) => call.id === existing.id)) open.push({ id: existing.id, coinId: existing.coinId });
        continue;
      }
      const direction = asDirection(parsed.direction);
      const levelsOk = extraction.evidenceValid;
      const rejected = Array.isArray(parsed.rejectedLevels) && parsed.rejectedLevels.length > 0;
      const hasLevels = parsed.entry_low != null || parsed.entry_high != null || parsed.stop != null || numbers(parsed.targets).length > 0 || rejected;
      const reasons: string[] = [];
      if (message.editedBeforeIngest) reasons.push("правка до сбора");
      if (!levelsOk && hasLevels) reasons.push("цитата не подтверждает уровни");
      if (!direction) reasons.push("нет направления");
      const call = await prisma.call.create({
        data: {
          channelId,
          coinId: mention.coinId,
          extractionId: extraction.id,
          kind: parsed.msg_type === "signal" ? "signal" : "view",
          direction: direction ?? "neutral",
          horizon: asHorizon(parsed.horizon),
          openedByMessageId: message.id,
          openedAt: message.postedAt,
          entryLow: levelsOk ? parsed.entry_low ?? null : null,
          entryHigh: levelsOk ? parsed.entry_high ?? null : null,
          stop: levelsOk ? parsed.stop ?? null : null,
          targets: levelsOk ? numbers(parsed.targets) : [],
          leverageMentioned: levelsOk ? parsed.leverage_mentioned ?? null : null,
          status: reasons.length > 0 ? "untestable" : "open",
          untestableReason: reasons.join("; ") || null,
        },
      });
      created += 1;
      calls.push(call);
      const opened = callsByMessage.get(message.id) ?? [];
      opened.push(call.id);
      callsByMessage.set(message.id, opened);
      if (call.status === "open") open.push({ id: call.id, coinId: call.coinId });
    }
  }
  return { created, linked, reviews };
}

async function attachUpdate(
  prisma: PrismaClient,
  callId: string,
  message: { id: string; postedAt: Date },
  extractionId: string,
  parsed: Parsed,
): Promise<"open" | "closed" | null> {
  const type = asEvent(parsed.update_type ?? (parsed.msg_type === "result" ? "update" : parsed.update_type));
  const existing = await prisma.callEvent.findFirst({ where: { callId, messageId: message.id, type } });
  if (existing) return null;
  const closes = type === "closed_profit" || type === "closed_loss" || type === "invalidated";
  await prisma.callEvent.create({
    data: { callId, messageId: message.id, type, at: message.postedAt, payloadJson: { extractionId } },
  });
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: closes ? "closed" : "updated",
      closedAt: closes ? message.postedAt : undefined,
      closeReason: closes ? type : undefined,
      stop: type === "stop_moved" && typeof parsed.stop === "number" ? parsed.stop : undefined,
    },
  });
  return closes ? "closed" : "open";
}

async function saveReview(
  prisma: PrismaClient,
  messageId: string,
  extractionId: string,
  reason: string,
  rawMention: string,
  candidateCallIds: string[],
  candidateCoinIds: string[],
): Promise<number> {
  const existing = await prisma.linkReview.findUnique({
    where: { extractionId_reason_rawMention: { extractionId, reason, rawMention } },
  });
  if (existing) return 0;
  await prisma.linkReview.create({
    data: { messageId, extractionId, reason, rawMention, candidateCallIds, candidateCoinIds },
  });
  return 1;
}
