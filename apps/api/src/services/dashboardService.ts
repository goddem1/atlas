import type { Prisma, PrismaClient } from "@prisma/client";
import type { DashboardCanvasWidget, DashboardUserPrefs, UserDashboardState } from "@atlas-v1/shared";

const LAYOUT_VERSION = 1 as const;

const GUEST_WIDGETS: DashboardCanvasWidget[] = [
  { id: "guest-btc", type: "price-sparkline", symbol: "BTC", x: 0, y: 0 },
  { id: "guest-eth", type: "price-sparkline", symbol: "ETH", x: 0, y: 0 },
  { id: "guest-macro", type: "macro-calendar", x: 0, y: 0 },
];

const DEFAULT_PREFS: DashboardUserPrefs = {
  theme: "light",
  gridOpacity: 20,
};

function newWidgetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function isWidgetType(v: unknown): v is DashboardCanvasWidget["type"] {
  return (
    v === "price-sparkline" ||
    v === "portfolio" ||
    v === "macro-calendar" ||
    v === "fed-curve" ||
    v === "watchlist"
  );
}

function normalizeWidgets(raw: unknown): DashboardCanvasWidget[] {
  if (!Array.isArray(raw)) return [];
  const out: DashboardCanvasWidget[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    if (!id || !isWidgetType(o.type)) continue;
    const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : 0;
    const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : 0;
    const symRaw = o.symbol;
    const symbol =
      typeof symRaw === "string" && symRaw.trim().length > 0 ? symRaw.trim().toUpperCase() : undefined;
    const compareDaysRaw = o.compareDays;
    const compareDays =
      typeof compareDaysRaw === "number" && Number.isFinite(compareDaysRaw) ? compareDaysRaw : undefined;
    const symbolsRaw = o.symbols;
    const symbols = Array.isArray(symbolsRaw)
      ? [
          ...new Set(
            symbolsRaw
              .filter((s): s is string => typeof s === "string")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
          ),
        ]
      : undefined;
    out.push({
      id,
      type: o.type,
      x,
      y,
      ...(symbol ? { symbol } : {}),
      ...(compareDays !== undefined ? { compareDays } : {}),
      ...(symbols !== undefined ? { symbols } : {}),
    });
  }
  return out;
}

function clampGridOpacity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizePrefs(raw: unknown): DashboardUserPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  const theme = o.theme === "dark" ? "dark" : "light";
  const gridOpacity =
    typeof o.gridOpacity === "number" && Number.isFinite(o.gridOpacity)
      ? clampGridOpacity(o.gridOpacity)
      : DEFAULT_PREFS.gridOpacity;
  return { theme, gridOpacity };
}

export function defaultUserDashboardState(): UserDashboardState {
  return {
    version: LAYOUT_VERSION,
    widgets: [
      ...GUEST_WIDGETS.map((w) => ({ ...w, id: newWidgetId() })),
      { id: newWidgetId(), type: "portfolio", x: 0, y: 0 },
    ],
    prefs: { ...DEFAULT_PREFS },
  };
}

export function parseDashboardLayout(raw: Prisma.JsonValue | null | undefined): UserDashboardState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const widgets = normalizeWidgets(o.widgets);
  if (widgets.length === 0) return null;
  return {
    version: LAYOUT_VERSION,
    widgets,
    prefs: normalizePrefs(o.prefs),
  };
}

export function layoutToJson(state: UserDashboardState): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({
      version: LAYOUT_VERSION,
      widgets: state.widgets,
      prefs: {
        theme: state.prefs.theme,
        gridOpacity: clampGridOpacity(state.prefs.gridOpacity),
      },
    }),
  ) as Prisma.InputJsonValue;
}

export async function getUserDashboardState(
  prisma: PrismaClient,
  userId: string,
): Promise<UserDashboardState> {
  let row = await prisma.dashboard.findFirst({
    where: { userId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!row) {
    const initial = defaultUserDashboardState();
    row = await prisma.dashboard.create({
      data: {
        userId,
        name: "My Dashboard",
        isDefault: true,
        layout: layoutToJson(initial),
      },
    });
    return initial;
  }

  const parsed = parseDashboardLayout(row.layout);
  if (parsed) return parsed;

  const initial = defaultUserDashboardState();
  await prisma.dashboard.update({
    where: { id: row.id },
    data: { layout: layoutToJson(initial) },
  });
  return initial;
}

export async function saveUserDashboardState(
  prisma: PrismaClient,
  userId: string,
  state: UserDashboardState,
): Promise<UserDashboardState> {
  const widgets = normalizeWidgets(state.widgets);
  if (widgets.length === 0) {
    throw new Error("Dashboard must have at least one widget");
  }

  const normalized: UserDashboardState = {
    version: LAYOUT_VERSION,
    widgets,
    prefs: normalizePrefs(state.prefs),
  };

  const existing = await prisma.dashboard.findFirst({
    where: { userId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await prisma.dashboard.update({
      where: { id: existing.id },
      data: { layout: layoutToJson(normalized) },
    });
  } else {
    await prisma.dashboard.create({
      data: {
        userId,
        name: "My Dashboard",
        isDefault: true,
        layout: layoutToJson(normalized),
      },
    });
  }

  return normalized;
}
