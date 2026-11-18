import type { FastifyInstance } from "fastify";
import type { LabelVerdict, PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { activationDecision, DEFAULT_SENTIMENT, DEFAULT_TESTER, DEFAULT_THRESHOLDS, METRICS, ensureCatalog, evaluateStoredCalls, latestDigestDay, loadDigest, loadPriceSnapshots, readTesterParams, storeMetrics, testerReady, writeSentiment } from "@atlas-v1/news-core";
import { runGoldEval } from "./gold-eval.js";
import { requireUser } from "./auth.js";

const FIELDS = ["msgType", "direction", "entry", "stop", "targets", "horizon", "coin"] as const;
const VERDICTS = ["correct", "wrong", "partial"] as const;

function confidenceOf(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object" || !("confidence" in parsed)) return null;
  const value = (parsed as { confidence?: unknown }).confidence;
  return typeof value === "number" ? value : null;
}

export function registerServiceRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/api/service/channels", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const gate = await testerReady(prisma);
    const channels = await prisma.channel.findMany({
      include: {
        _count: { select: { messages: true, calls: true } },
        calls: { select: { status: true, untestableReason: true } },
      },
    });
    const rows = [];
    for (const channel of channels) {
      const [deleted, edited, ads, types] = await Promise.all([
        prisma.message.count({ where: { channelId: channel.id, isDeleted: true } }),
        prisma.message.count({ where: { channelId: channel.id, OR: [{ editedBeforeIngest: true }, { versions: { some: { version: { gt: 1 } } } }] } }),
        prisma.message.count({ where: { channelId: channel.id, versions: { some: { extractions: { some: { isAd: true } } } } } }),
        prisma.extraction.groupBy({
          by: ["msgType"],
          where: { messageVersion: { message: { channelId: channel.id } } },
          _count: { _all: true },
        }),
      ]);
      const profile = await prisma.channelProfile.findFirst({
        where: { channelId: channel.id },
        orderBy: { weekStart: "desc" },
      });
      const stats = profile && profile.profileJson && typeof profile.profileJson === "object" && "stats" in profile.profileJson
        ? (profile.profileJson as { stats?: { claims?: number; kept?: number }; profile?: { mood?: string } })
        : null;
      const testable = channel.calls.filter((call) => call.status !== "untestable" && !call.untestableReason).length;
      rows.push({
        username: channel.username,
        title: channel.title,
        messages: channel._count.messages,
        deleted,
        edited,
        ads,
        calls: channel._count.calls,
        testable,
        open: channel.calls.filter((call) => call.status === "open" || call.status === "updated").length,
        closed: channel.calls.filter((call) => call.status === "closed").length,
        untestable: channel.calls.filter((call) => call.status === "untestable" || call.untestableReason).length,
        types: Object.fromEntries(types.map((row) => [row.msgType, row._count._all])),
        results: gate.open ? "выборка мала" : "тестер выключен",
        profile: profile
          ? {
              weekStart: profile.weekStart.toISOString(),
              freshnessDays: Math.max(0, Math.floor((Date.now() - profile.createdAt.getTime()) / 86_400_000)),
              claims: stats?.stats?.claims ?? 0,
              kept: stats?.stats?.kept ?? 0,
              mood: stats?.profile?.mood ?? "",
              changed: Boolean(profile.diffFromPrevJson && typeof profile.diffFromPrevJson === "object" && "changed" in profile.diffFromPrevJson && profile.diffFromPrevJson.changed),
            }
          : null,
      });
    }
    rows.sort((a, b) => a.username.localeCompare(b.username, "en", { sensitivity: "base" }));
    return {
      testerEnabled: gate.open,
      reason: gate.reason,
      caveat: "Удалённые до сбора посты не видны, статистика может быть приукрашена.",
      channels: rows,
    };
  });

  app.get("/api/sentiment", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const rows = await prisma.sentimentSnapshot.findMany({ orderBy: { date: "desc" }, take: 500 });
    const channels = await prisma.channel.findMany({ select: { id: true, username: true } });
    const names = new Map(channels.map((channel) => [channel.id, channel.username]));
    const marketAll = rows.filter((row) => row.scope === "market");
    const market = marketAll.slice(0, 21).reverse();
    const newest = (scope: "coin" | "theme") => {
      const picked = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (row.scope === scope && !picked.has(row.scopeKey)) picked.set(row.scopeKey, row);
      }
      return [...picked.values()].sort((a, b) => a.scopeKey.localeCompare(b.scopeKey, "en"));
    };
    const flags = marketAll.flatMap((row) => {
      const details = row.detailsJson && typeof row.detailsJson === "object" && "coordinated" in row.detailsJson ? row.detailsJson.coordinated : [];
      if (!Array.isArray(details)) return [];
      return details.flatMap((flag) => {
        if (!flag || typeof flag !== "object") return [];
        const record = flag as { symbol?: unknown; at?: unknown; channels?: unknown };
        return [{
          symbol: typeof record.symbol === "string" ? record.symbol : "",
          at: typeof record.at === "string" ? record.at : row.date.toISOString(),
          channels: Array.isArray(record.channels) ? record.channels.filter((id): id is string => typeof id === "string").map((id) => names.get(id) ?? id) : [],
        }];
      });
    });
    const point = (row: (typeof rows)[number]) => ({
      date: row.date.toISOString(),
      key: row.scopeKey,
      score: row.score,
      dispersion: row.dispersion,
      nMessages: row.nMessages,
      nChannels: row.nChannels,
      effectiveNChannels: row.effectiveNChannels,
      overheated: row.overheated,
    });
    return {
      note: DEFAULT_SENTIMENT.assumptions,
      market: market.map(point),
      coins: newest("coin").map(point),
      themes: newest("theme").map(point),
      flags,
    };
  });

  app.get("/api/profiles", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const profiles = await prisma.channelProfile.findMany({
      orderBy: [{ weekStart: "desc" }],
      include: { channel: { select: { username: true } } },
      take: 50,
    });
    return profiles.map((profile) => ({
      username: profile.channel.username,
      weekStart: profile.weekStart.toISOString(),
      evidenceMessageIds: profile.evidenceMessageIds,
      profile: profile.profileJson,
      diff: profile.diffFromPrevJson,
    }));
  });

  app.post("/api/tester/recompute", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    await ensureCatalog(prisma);
    const prices = await loadPriceSnapshots(prisma);
    const gate = await testerReady(prisma);
    const thresholds = await prisma.paramSet.findFirst({ where: { kind: "thresholds", isActive: true } });
    await storeMetrics(prisma, thresholds?.id ?? null);
    if (!gate.open) return { skipped: true, reason: gate.reason, prices, evaluated: 0 };
    const body = (req.body ?? {}) as { params?: unknown };
    const current = await prisma.paramSet.findFirst({ where: { kind: "tester", isActive: true }, orderBy: { version: "desc" } });
    const nextParams = readTesterParams(body.params ?? current?.paramsJson ?? DEFAULT_TESTER);
    const last = await prisma.paramSet.findFirst({ where: { kind: "tester" }, orderBy: { version: "desc" } });
    await prisma.paramSet.updateMany({ where: { kind: "tester", isActive: true }, data: { isActive: false } });
    const created = await prisma.paramSet.create({
      data: { kind: "tester", version: (last?.version ?? 0) + 1, paramsJson: nextParams, isActive: true },
    });
    const evaluated = await evaluateStoredCalls(prisma, created.id);
    return { skipped: false, reason: gate.reason, prices, evaluated, version: created.version };
  });

  app.get("/api/digest", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const query = req.query as { date?: string };
    const latest = await prisma.message.findFirst({ orderBy: { postedAt: "desc" }, select: { postedAt: true } });
    const day = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : latestDigestDay(latest?.postedAt ?? null);
    const result = await loadDigest(prisma, day, {
      lagBadMin: DEFAULT_THRESHOLDS.ingestLagBadMin,
      queueWarn: DEFAULT_THRESHOLDS.queueWarn,
      queueBad: DEFAULT_THRESHOLDS.queueBad,
    });
    return result;
  });

  app.get("/api/prompts", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const [prompts, labeled, evals] = await Promise.all([
      prisma.promptVersion.findMany({ orderBy: [{ name: "asc" }, { version: "desc" }] }),
      prisma.labelRecord.count(),
      prisma.metricSnapshot.findMany({ where: { scopeType: "prompt", metricKey: "gold_set_size" }, select: { scopeKey: true, n: true } }),
    ]);
    return {
      labeled,
      prompts: prompts.map((prompt) => {
        const ran = evals.some((row) => row.scopeKey === prompt.id && row.n > 0);
        return {
          id: prompt.id,
          name: prompt.name,
          version: prompt.version,
          isActive: prompt.isActive,
          createdAt: prompt.createdAt.toISOString(),
          body: prompt.body,
          activation: prompt.isActive ? { ok: false, reason: "Уже включена" } : activationDecision({ labeled, evalRan: ran }),
        };
      }),
    };
  });

  app.post<{ Body: { name?: string; body?: string } }>("/api/prompts", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const name = req.body?.name;
    const body = req.body?.body?.trim() ?? "";
    if (name !== "extract" && name !== "profile" && name !== "sentiment") return reply.status(400).send({ error: "Неизвестное имя промпта" });
    if (!body) return reply.status(400).send({ error: "Пустой текст промпта" });
    const last = await prisma.promptVersion.findFirst({ where: { name }, orderBy: { version: "desc" } });
    const created = await prisma.promptVersion.create({
      data: { name, version: (last?.version ?? 0) + 1, body, isActive: false },
    });
    return { id: created.id, version: created.version, isActive: false };
  });

  app.post<{ Params: { id: string } }>("/api/prompts/:id/eval", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const prompt = await prisma.promptVersion.findUnique({ where: { id: req.params.id } });
    if (!prompt) return reply.status(404).send({ error: "Версия не найдена" });
    return runGoldEval(prisma, prompt.id);
  });

  app.post<{ Params: { id: string } }>("/api/prompts/:id/activate", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const prompt = await prisma.promptVersion.findUnique({ where: { id: req.params.id } });
    if (!prompt) return reply.status(404).send({ error: "Версия не найдена" });
    if (prompt.isActive) return { ok: false, reason: "Уже включена" };
    const [labeled, ran] = await Promise.all([
      prisma.labelRecord.count(),
      prisma.metricSnapshot.count({ where: { scopeType: "prompt", scopeKey: prompt.id, metricKey: "gold_set_size", n: { gt: 0 } } }),
    ]);
    const decision = activationDecision({ labeled, evalRan: ran > 0 });
    if (!decision.ok) return reply.status(400).send({ error: decision.reason });
    await prisma.promptVersion.updateMany({ where: { name: prompt.name, isActive: true }, data: { isActive: false } });
    await prisma.promptVersion.update({ where: { id: prompt.id }, data: { isActive: true } });
    return { ok: true, reason: decision.reason };
  });

  app.get("/api/params", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const sets = await prisma.paramSet.findMany({ orderBy: [{ kind: "asc" }, { version: "desc" }] });
    return {
      sets: sets.map((set) => ({
        id: set.id,
        kind: set.kind,
        version: set.version,
        isActive: set.isActive,
        createdAt: set.createdAt.toISOString(),
        params: set.paramsJson,
      })),
    };
  });

  app.post<{ Body: { kind?: string; params?: unknown } }>("/api/params", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const kind = req.body?.kind;
    if (kind !== "thresholds" && kind !== "tester" && kind !== "sentiment") return reply.status(400).send({ error: "Неизвестный набор параметров" });
    if (!req.body?.params || typeof req.body.params !== "object" || Array.isArray(req.body.params)) return reply.status(400).send({ error: "Параметры должны быть объектом" });
    const last = await prisma.paramSet.findFirst({ where: { kind }, orderBy: { version: "desc" } });
    const created = await prisma.paramSet.create({
      data: { kind, version: (last?.version ?? 0) + 1, paramsJson: req.body.params, isActive: false },
    });
    return { id: created.id, version: created.version, isActive: false };
  });

  app.post<{ Params: { id: string } }>("/api/params/:id/recompute", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const set = await prisma.paramSet.findUnique({ where: { id: req.params.id } });
    if (!set) return reply.status(404).send({ error: "Набор не найден" });
    await prisma.paramSet.updateMany({ where: { kind: set.kind, isActive: true }, data: { isActive: false } });
    await prisma.paramSet.update({ where: { id: set.id }, data: { isActive: true } });
    if (set.kind === "thresholds") {
      const drafts = await storeMetrics(prisma, set.id);
      return { activated: true, stored: drafts.length };
    }
    if (set.kind === "tester") {
      const gate = await testerReady(prisma);
      if (!gate.open) return { activated: true, evaluated: 0, reason: gate.reason };
      const evaluated = await evaluateStoredCalls(prisma, set.id);
      return { activated: true, evaluated, reason: "Старые оценки сохранены" };
    }
    const sentiment = await writeSentiment(prisma);
    return { activated: true, snapshots: sentiment.snapshots, flags: sentiment.flags };
  });

  app.post("/api/metrics/recompute", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    await ensureCatalog(prisma);
    const params = await prisma.paramSet.findFirst({ where: { kind: "thresholds", isActive: true } });
    const drafts = await storeMetrics(prisma, params?.id ?? null);
    return { stored: drafts.length };
  });

  app.get("/api/metrics", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const snapshots = await prisma.metricSnapshot.findMany({ orderBy: { computedAt: "desc" }, take: 800 });
    return {
      assumptions: DEFAULT_THRESHOLDS.assumptions,
      metrics: METRICS.map((metric) => {
        const rows = snapshots.filter((row) => row.metricKey === metric.key && row.scopeType === "global");
        const latest = rows[0] ?? null;
        return {
          ...metric,
          value: latest?.value ?? null,
          n: latest?.n ?? 0,
          ciLow: latest?.ciLow ?? null,
          ciHigh: latest?.ciHigh ?? null,
          status: latest?.status ?? "insufficient_data",
          computedAt: latest?.computedAt.toISOString() ?? null,
          trend: rows.slice(0, 12).reverse().map((row) => row.value),
        };
      }),
    };
  });

  app.get("/api/service/overview", async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const [labels, snapshots] = await Promise.all([
      prisma.labelRecord.count(),
      prisma.metricSnapshot.findMany({ where: { scopeType: "global" }, orderBy: { computedAt: "desc" }, take: 200 }),
    ]);
    const latest = (key: string) => snapshots.find((row) => row.metricKey === key) ?? null;
    const precision = latest("signal_precision");
    const labelGate = labels >= DEFAULT_THRESHOLDS.minLabels;
    const precisionGate = precision?.status === "ok";
    const open = labelGate && precisionGate;
    const reason = open
      ? "Ворота открыты. Сам расчёт тестера и весов подключается следующими этапами."
      : "Выключено, пока не набрано 100 разметок или precision сигналов ниже порога.";
    return {
      assumptions: DEFAULT_THRESHOLDS.assumptions,
      labeled: labels,
      gates: [
        { id: "labels", title: "Размечено не меньше 100 сообщений", passed: labelGate, detail: `${labels} из ${DEFAULT_THRESHOLDS.minLabels}` },
        {
          id: "precision",
          title: `Precision сигналов не ниже ${DEFAULT_THRESHOLDS.signalPrecisionMin}`,
          passed: precisionGate,
          detail: precision ? `n=${precision.n}, статус ${precision.status}` : "ещё не считалась",
        },
      ],
      features: [
        { id: "tester", title: "Тестер", enabled: open, reason: open ? "Ворота открыты. Оценки пишутся новой версией параметров и не стирают старые." : reason },
        { id: "weights", title: "Веса каналов", enabled: false, reason: open ? "Веса каналов подключаются следующим этапом." : reason },
      ],
      open,
    };
  });

  app.get("/api/labels/next", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const [labeled, rows] = await Promise.all([
      prisma.labelRecord.count(),
      prisma.extraction.findMany({
        where: { labels: { none: {} }, schemaValid: true },
        include: {
          coins: { include: { coin: { select: { symbol: true } } } },
          messageVersion: { include: { message: { include: { channel: true } } } },
        },
        take: 200,
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const ranked = rows
      .map((row) => {
        const low = (confidenceOf(row.parsedJson) ?? 1) < DEFAULT_THRESHOLDS.lowConfidence;
        const ambiguous = row.coins.some((coin) => coin.resolveStatus === "ambiguous");
        const noise = row.msgType === "noise";
        const rank = ambiguous ? 0 : low ? 1 : noise ? 2 : 3;
        return { row, rank };
      })
      .sort((a, b) => a.rank - b.rank || a.row.id.localeCompare(b.row.id));
    const picked = ranked[0]?.row;
    if (!picked) return { item: null, labeled, remaining: 0 };
    const message = picked.messageVersion.message;
    const earlier = await prisma.message.findMany({
      where: { channelId: message.channelId, postedAt: { lt: message.postedAt } },
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
    return {
      labeled,
      remaining: rows.length,
      item: {
        extractionId: picked.id,
        username: message.channel.username,
        postedAt: message.postedAt.toISOString(),
        text: picked.messageVersion.text,
        replyText: reply?.versions[0]?.text ?? "",
        context: earlier.slice().reverse().map((row) => row.versions[0]?.text ?? "").filter(Boolean),
        msgType: picked.msgType,
        evidenceValid: picked.evidenceValid,
        isAd: picked.isAd,
        parsed: picked.parsedJson,
        coins: picked.coins.map((coin) => ({
          rawMention: coin.rawMention,
          status: coin.resolveStatus,
          symbol: coin.coin?.symbol ?? null,
        })),
      },
    };
  });

  app.post<{
    Body: { extractionId?: string; verdict?: LabelVerdict; fieldErrors?: string[]; missedSignal?: boolean; note?: string };
  }>("/api/labels", async (req, response) => {
    if (!(await requireUser(req, response))) return;
    const extractionId = req.body?.extractionId ?? "";
    const verdict = req.body?.verdict;
    if (!VERDICTS.includes(verdict as (typeof VERDICTS)[number])) {
      return response.status(400).send({ error: "Нужен вердикт: верно, ошибка или частично" });
    }
    const extraction = await prisma.extraction.findUnique({ where: { id: extractionId } });
    if (!extraction) return response.status(404).send({ error: "Разбор не найден" });
    const fieldErrors = (req.body?.fieldErrors ?? []).filter((field) => FIELDS.includes(field as (typeof FIELDS)[number]));
    await prisma.labelRecord.create({
      data: {
        extractionId,
        labeler: "admin",
        verdict: verdict as LabelVerdict,
        fieldErrors,
        missedSignal: Boolean(req.body?.missedSignal),
        note: (req.body?.note ?? "").slice(0, 1000),
      },
    });
    return { ok: true };
  });
}
