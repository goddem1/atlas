import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { getMacroReleaseInProgressIds } from "../jobs/macroReleaseActualsScheduler.js";

function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseActualNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "string") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildBarsSvg(params: {
  width: number;
  height: number;
  points: number[];
  fill: string;
  negativeFill?: string;
  background?: string;
  border?: string;
}): string {
  const { width, height, points, fill, negativeFill = "#FF7977", background = "transparent", border = "transparent" } = params;
  const safePoints = points.length > 0 ? points : [0];
  let min = Math.min(...safePoints);
  let max = Math.max(...safePoints);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    const span = Math.max(Math.abs(min) * 0.2, 1);
    min -= span;
    max += span;
  }

  const padX = 4;
  const padY = 3;
  const chartW = Math.max(1, width - padX * 2);
  const chartH = Math.max(1, height - padY * 2);
  const gap = points.length > 24 ? 1 : 2;
  const barW = Math.max(1, (chartW - (points.length - 1) * gap) / Math.max(1, points.length));
  const zeroT = (0 - min) / (max - min);
  const zeroY = padY + (chartH - zeroT * chartH);
  const clampedZeroY = Math.max(padY, Math.min(padY + chartH, zeroY));

  const bars: string[] = [];
  let x = padX;
  for (const value of safePoints) {
    const valueT = (value - min) / (max - min);
    const valueY = padY + (chartH - valueT * chartH);
    const top = Math.min(valueY, clampedZeroY);
    const bottom = Math.max(valueY, clampedZeroY);
    const barH = Math.max(1, Math.round(bottom - top));
    const y = Math.round(top);
    const barFill = value < 0 ? negativeFill : fill;
    bars.push(`<rect x="${x.toFixed(2)}" y="${y}" width="${barW.toFixed(2)}" height="${barH}" rx="2" fill="${barFill}" />`);
    x += barW + gap;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${background}" stroke="${border}" />
  <line x1="${padX}" y1="${clampedZeroY.toFixed(2)}" x2="${(padX + chartW).toFixed(2)}" y2="${clampedZeroY.toFixed(2)}" stroke="rgba(148,163,184,0.35)" stroke-width="1" />
  ${bars.join("")}
</svg>`;
}

export function registerMacroRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get<{
    Querystring: { from?: string; to?: string; locale?: string };
  }>("/macro/events", async (req, reply) => {
    const from = parseIsoDate(req.query.from) ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = parseIsoDate(req.query.to) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const locale = (req.query.locale ?? "en").trim().toLowerCase() || "en";

    if (!(from < to)) {
      return reply.status(400).send({ error: "query from must be < to" });
    }

    reply.header("Cache-Control", "no-store");

    const rows = await prisma.macroDataPoint.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      include: {
        indicator: {
          include: {
            translations: {
              where: { locale },
              take: 1,
            },
          },
        },
      },
    });

    const indicatorIds = Array.from(new Set(rows.map((row) => row.indicatorId)));
    const historyCountsByIndicator: Record<string, number> = {};
    if (indicatorIds.length > 0) {
      const counts = await prisma.macroDataPoint.groupBy({
        by: ["indicatorId"],
        where: {
          indicatorId: { in: indicatorIds },
          actual: { not: null },
        },
        _count: {
          _all: true,
        },
      });

      for (const row of counts) {
        historyCountsByIndicator[row.indicatorId] = row._count._all;
      }
    }

    return {
      events: rows.map((r) => {
        const t = r.indicator.translations[0] ?? null;
        return {
          id: r.id,
          indicatorId: r.indicatorId,
          locale,
          country: t?.country ?? r.indicator.country,
          category: t?.category ?? r.indicator.category,
          name: t?.name ?? r.indicator.name,
          unit: t?.unit ?? r.indicator.unit,
          importance: r.indicator.importance,
          date: r.date.toISOString(),
          reference: r.reference,
          isPending: r.isPending,
          actual: r.actual ? r.actual.toString() : null,
          forecast: r.forecast ? r.forecast.toString() : null,
          previous: r.previous ? r.previous.toString() : null,
        };
      }),
      historyCountsByIndicator,
    };
  });

  app.get("/macro/release-status", async () => {
    return {
      inProgressEventIds: getMacroReleaseInProgressIds(),
      serverNowIso: new Date().toISOString(),
    };
  });

  app.get<{
    Querystring: { indicatorId?: string; indicatorName?: string; locale?: string; compact?: string };
  }>("/macro/series", async (req, reply) => {
    const indicatorId = typeof req.query.indicatorId === "string" ? req.query.indicatorId.trim() : "";
    const indicatorName =
      typeof req.query.indicatorName === "string" ? req.query.indicatorName.trim() : "";
    const locale = (req.query.locale ?? "en").trim().toLowerCase() || "en";
    const compact = req.query.compact === "1";

    if (!indicatorId && !indicatorName) {
      return reply.status(400).send({ error: "indicatorId or indicatorName is required" });
    }

    let indicator:
      | {
          id: string;
          name: string;
          unit: string;
          country: string;
          category: string;
          frequency: string;
          translations: Array<{
            name: string;
            unit: string;
            country: string;
            category: string;
            frequency: string;
          }>;
        }
      | null = null;

    if (indicatorId) {
      indicator = await prisma.macroIndicator.findUnique({
        where: { id: indicatorId },
        include: {
          translations: {
            where: { locale },
            take: 1,
          },
        },
      });
    } else {
      // Если у имени есть дубли (например, календарь + FRED), берём индикатор с максимальной историей.
      // Иначе tiny-слот в календаре может попасть на "пустой" id и ничего не отрисовать.
      const list = await prisma.macroIndicator.findMany({
        where: { name: indicatorName },
        include: {
          translations: {
            where: { locale },
            take: 1,
          },
          _count: {
            select: { dataPoints: true },
          },
        },
      });
      if (list.length > 0) {
        list.sort((a, b) => b._count.dataPoints - a._count.dataPoints);
        indicator = list[0] ?? null;
      }
    }

    if (!indicator) {
      return reply.status(404).send({ error: "indicator not found" });
    }

    const compactFrom = new Date();
    compactFrom.setMonth(compactFrom.getMonth() - 18);

    const points = await prisma.macroDataPoint.findMany({
      where: {
        indicatorId: indicator.id,
        ...(compact ? { date: { gte: compactFrom } } : {}),
      },
      orderBy: { date: "asc" },
    });

    const t = indicator.translations[0] ?? null;

    reply.header("Cache-Control", "no-store");

    return {
      indicator: {
        id: indicator.id,
        name: t?.name ?? indicator.name,
        unit: t?.unit ?? indicator.unit,
        country: t?.country ?? indicator.country,
        category: t?.category ?? indicator.category,
        frequency: t?.frequency ?? indicator.frequency,
      },
      points: points.map((p) => ({
        id: p.id,
        date: p.date.toISOString(),
        reference: p.reference,
        isPending: p.isPending,
        actual: p.actual ? p.actual.toString() : null,
        forecast: p.forecast ? p.forecast.toString() : null,
        previous: p.previous ? p.previous.toString() : null,
      })),
    };
  });

  app.get<{
    Querystring: { indicatorIds?: string; locale?: string };
  }>("/macro/slots", async (req, reply) => {
    const rawIds = typeof req.query.indicatorIds === "string" ? req.query.indicatorIds : "";
    const locale = (req.query.locale ?? "en").trim().toLowerCase() || "en";
    const indicatorIds = [...new Set(rawIds.split(",").map((s) => s.trim()).filter(Boolean))];

    if (indicatorIds.length === 0) {
      return reply.status(400).send({ error: "indicatorIds is required" });
    }

    const points = await prisma.macroDataPoint.findMany({
      where: {
        indicatorId: { in: indicatorIds },
        actual: { not: null },
      },
      orderBy: { date: "asc" },
      include: {
        indicator: {
          include: {
            translations: {
              where: { locale },
              take: 1,
            },
          },
        },
      },
    });

    const byIndicator = new Map<
      string,
      {
        unit: string;
        rows: Array<{ date: Date; value: number }>;
      }
    >();

    for (const p of points) {
      const value = Number(p.actual);
      if (!Number.isFinite(value)) continue;

      const existing = byIndicator.get(p.indicatorId);
      if (existing) {
        existing.rows.push({ date: p.date, value });
        continue;
      }

      const t = p.indicator.translations[0] ?? null;
      byIndicator.set(p.indicatorId, {
        unit: t?.unit ?? p.indicator.unit,
        rows: [{ date: p.date, value }],
      });
    }

    const cut = new Date();
    cut.setFullYear(cut.getFullYear() - 1);

    const slots: Record<
      string,
      {
        unit: string;
        tiny: Array<{ label: string; value: number }>;
        year: Array<{ label: string; value: number }>;
      }
    > = {};

    for (const [indicatorId, data] of byIndicator.entries()) {
      const tiny = data.rows.slice(-5).map((r) => ({
        label: r.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
        value: r.value,
      }));

      const inYear = data.rows.filter((r) => r.date >= cut);
      const yearSrc = inYear.length > 0 ? inYear : data.rows.slice(-12);
      const year = yearSrc.map((r) => ({
        label: r.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
        value: r.value,
      }));

      slots[indicatorId] = {
        unit: data.unit,
        tiny,
        year,
      };
    }

    reply.header("Cache-Control", "no-store");
    return { slots };
  });

  app.get<{
    Querystring: {
      indicatorId?: string;
      indicatorName?: string;
      mode?: "tiny" | "preview";
      width?: string;
      height?: string;
    };
  }>("/macro/slot-image", async (req, reply) => {
    const indicatorId = typeof req.query.indicatorId === "string" ? req.query.indicatorId.trim() : "";
    const indicatorName = typeof req.query.indicatorName === "string" ? req.query.indicatorName.trim() : "";
    const mode = req.query.mode === "preview" ? "preview" : "tiny";

    if (!indicatorId && !indicatorName) {
      return reply.status(400).send({ error: "indicatorId or indicatorName is required" });
    }

    const defaultW = mode === "preview" ? 204 : 56;
    const defaultH = mode === "preview" ? 96 : 24;
    const width = clampInt(req.query.width, defaultW, 24, 1200);
    const height = clampInt(req.query.height, defaultH, 16, 800);

    let resolvedId = indicatorId;
    if (!resolvedId && indicatorName) {
      const list = await prisma.macroIndicator.findMany({
        where: { name: indicatorName },
        include: {
          _count: {
            select: { dataPoints: true },
          },
        },
      });
      list.sort((a, b) => b._count.dataPoints - a._count.dataPoints);
      resolvedId = list[0]?.id ?? "";
    }
    if (!resolvedId) {
      return reply.status(404).send({ error: "indicator not found" });
    }

    const rows = await prisma.macroDataPoint.findMany({
      where: { indicatorId: resolvedId, actual: { not: null } },
      orderBy: { date: "asc" },
      select: { actual: true, date: true },
    });
    const values = rows
      .map((r) => parseActualNumber(r.actual))
      .filter((v): v is number => v != null);
    if (values.length === 0) {
      const emptyPng = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      reply.header("Content-Type", "image/png");
      reply.header("Cache-Control", "no-store");
      return reply.send(emptyPng);
    }

    const slice = mode === "preview" ? values.slice(-12) : values.slice(-5);
    const svg = buildBarsSvg({
      width,
      height,
      points: slice,
      fill: "#60a5fa",
      background: "transparent",
      border: "transparent",
    });
    const png = await sharp(Buffer.from(svg, "utf-8"))
      .png()
      .toBuffer();

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return reply.send(png);
  });
}

