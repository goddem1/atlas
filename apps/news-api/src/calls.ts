import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { requireUser } from "./auth.js";

const REASONS: Record<string, string> = {
  ambiguous_coin: "неоднозначная монета",
  unknown_coin: "монета не из справочника",
  no_open_call: "нет единственного открытого вызова",
  multiple_open_calls: "несколько открытых вызовов",
};

export function registerCallRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/api/calls", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const calls = await prisma.call.findMany({
      orderBy: { openedAt: "desc" },
      include: { channel: { select: { username: true } }, coin: { select: { symbol: true } } },
    });
    return calls.map((call) => ({
      id: call.id,
      username: call.channel.username,
      symbol: call.coin.symbol,
      kind: call.kind,
      direction: call.untestableReason?.includes("нет направления") ? "не указано" : call.direction,
      horizon: call.horizon,
      status: call.status,
      openedAt: call.openedAt.toISOString(),
      untestableReason: call.untestableReason,
      entryLow: call.entryLow,
      entryHigh: call.entryHigh,
      stop: call.stop,
      targets: call.targets,
    }));
  });

  app.get<{ Params: { id: string } }>("/api/calls/:id", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const call = await prisma.call.findUnique({
      where: { id: req.params.id },
      include: {
        channel: { select: { username: true } },
        coin: { select: { symbol: true } },
        openedByMessage: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
        extraction: { select: { id: true, parsedJson: true } },
        events: { orderBy: { at: "asc" }, include: { message: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } },
        evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!call) return response.status(404).send({ error: "Вызов не найден" });
    const prices = await prisma.priceSnapshot.findMany({
      where: { coinId: call.coinId, source: "binance", ts: { gte: call.openedAt } },
      orderBy: { ts: "asc" },
      take: 8,
      select: { ts: true, price: true },
    });
    const evaluation = call.evaluations[0] ?? null;
    return {
      id: call.id,
      username: call.channel.username,
      symbol: call.coin.symbol,
      kind: call.kind,
      direction: call.untestableReason?.includes("нет направления") ? "не указано" : call.direction,
      horizon: call.horizon,
      status: call.status,
      openedAt: call.openedAt.toISOString(),
      untestableReason: call.untestableReason,
      entryLow: call.entryLow,
      entryHigh: call.entryHigh,
      stop: call.stop,
      targets: call.targets,
      closeReason: call.closeReason,
      text: call.openedByMessage.versions[0]?.text ?? "",
      parsed: call.extraction?.parsedJson ?? null,
      extractionId: call.extraction?.id ?? null,
      events: call.events.map((event) => ({
        type: event.type,
        at: event.at.toISOString(),
        text: event.message.versions[0]?.text ?? "",
      })),
      prices: prices.map((point) => ({ ts: point.ts.toISOString(), price: point.price })),
      evaluation: evaluation
        ? {
            status: evaluation.status,
            returnPct: evaluation.returnPct,
            exitReason: evaluation.exitReason,
            entryPrice: evaluation.entryPrice,
            exitPrice: evaluation.exitPrice,
          }
        : null,
      testerNote: evaluation ? "Оценка тестера по сохранённым свечам." : "Тестер не запускался: ворота разбора не пройдены.",
    };
  });

  app.get("/api/reviews", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const reviews = await prisma.linkReview.findMany({
      where: { resolvedCallId: null },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { message: { include: { channel: true, versions: { orderBy: { version: "desc" }, take: 1 } } } },
    });
    const callIds = reviews.flatMap((review) => review.candidateCallIds);
    const calls = await prisma.call.findMany({
      where: { id: { in: callIds } },
      include: { coin: { select: { symbol: true } } },
    });
    const byId = new Map(calls.map((call) => [call.id, call]));
    return reviews.map((review) => ({
      id: review.id,
      reason: REASONS[review.reason] ?? review.reason,
      rawMention: review.rawMention,
      username: review.message.channel.username,
      text: review.message.versions[0]?.text ?? "",
      candidates: review.candidateCallIds.flatMap((id) => {
        const call = byId.get(id);
        if (!call) return [];
        return [{ id: call.id, symbol: call.coin.symbol, direction: call.direction, status: call.status }];
      }),
    }));
  });

  app.post<{ Params: { id: string }; Body: { callId?: string } }>("/api/reviews/:id/resolve", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const review = await prisma.linkReview.findUnique({ where: { id: req.params.id }, include: { message: true } });
    if (!review) return response.status(404).send({ error: "Запись не найдена" });
    if (review.resolvedCallId) return response.status(409).send({ error: "Уже разобрано" });
    const callId = req.body?.callId ?? "";
    if (!review.candidateCallIds.includes(callId)) {
      return response.status(400).send({ error: "Этот вызов не из списка кандидатов" });
    }
    await prisma.callEvent.create({
      data: {
        callId,
        messageId: review.messageId,
        type: "comment",
        at: review.message.postedAt,
        payloadJson: { reviewId: review.id, manual: true },
      },
    });
    await prisma.linkReview.update({ where: { id: review.id }, data: { resolvedCallId: callId } });
    return { ok: true };
  });
}
