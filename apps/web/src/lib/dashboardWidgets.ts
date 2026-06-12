import { normalizeFedCurveCompareDays } from "./fedCurveComparePeriod";

const STORAGE_KEY = "atlas-v1-dashboard-widgets";

/** Шаг сетки (px). */
export const DASHBOARD_GRID_SIZE = 10;
/** Зона у края холста, куда нельзя ставить виджеты (px). */
export const DASHBOARD_EDGE_INSET = 20;
/** Минимальный зазор между прямоугольниками виджетов (px). */
export const DASHBOARD_WIDGET_GAP = 20;

export type DashboardWidgetType = "price-sparkline" | "portfolio" | "macro-calendar" | "fed-curve" | "watchlist";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  x: number;
  y: number;
  /** Тикер из справочника (BTC, ETH) — только для `price-sparkline`. */
  symbol?: string;
  /** Период серой линии (дней) — только для `fed-curve`. */
  compareDays?: number;
  /** Тикеры в списке — только для `watchlist`. */
  symbols?: string[];
};

export const WIDGET_CATALOG: {
  type: DashboardWidgetType;
  title: string;
  description: string;
}[] = [
  {
    type: "price-sparkline",
    title: "График цены",
    description: "Криптовалюта, свечи за 7 дней и динамика",
  },
  {
    type: "portfolio",
    title: "Портфель",
    description: "Стоимость портфеля, P&L и структура активов",
  },
  {
    type: "macro-calendar",
    title: "Календарь",
    description: "Ключевые макро-события на сегодня",
  },
  {
    type: "fed-curve",
    title: "Кривая ФРС",
    description: "Доходность Treasury: сегодня и месяц назад",
  },
  {
    type: "watchlist",
    title: "Список",
    description: "Цены криптовалют и дневное изменение",
  },
];

const PRICE_WIDGET_H = 200;
const WATCHLIST_WIDGET_H = 530;
const PORTFOLIO_WIDGET_H = 250;
const MACRO_CALENDAR_WIDGET_W = 550;
const MACRO_CALENDAR_WIDGET_H = 300;
/** ~3rem — согласовано с `calc(100vw - 3rem)` в виджетах. */
const VIEWPORT_WIDGET_GUTTER = 48;

export function createWidgetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Внешние размеры виджета для коллизий и clamp (совпадают с max-width в Draggable). */
export function dashboardWidgetOuterSize(
  type: DashboardWidgetType,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): { w: number; h: number } {
  if (type === "macro-calendar") {
    const w = Math.min(MACRO_CALENDAR_WIDGET_W, Math.max(280, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: MACRO_CALENDAR_WIDGET_H };
  }
  if (type === "watchlist") {
    const w = Math.min(350, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: WATCHLIST_WIDGET_H };
  }
  const maxW = type === "portfolio" ? 500 : 350;
  const w = Math.min(maxW, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
  const h = type === "portfolio" ? PORTFOLIO_WIDGET_H : PRICE_WIDGET_H;
  return { w, h };
}

function isWidgetType(v: unknown): v is DashboardWidgetType {
  return (
    v === "price-sparkline" ||
    v === "portfolio" ||
    v === "macro-calendar" ||
    v === "fed-curve" ||
    v === "watchlist"
  );
}

export function snapToGrid(x: number, y: number, gridSize: number = DASHBOARD_GRID_SIZE): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

/**
 * Координаты относительно области с отступом DASHBOARD_EDGE_INSET от краёв main.
 * Привязка к сетке DASHBOARD_GRID_SIZE, затем clamp внутри bounds.
 */
export function snapAndClampDashboardPosition(
  x: number,
  y: number,
  type: DashboardWidgetType,
  boundsWidth: number,
  boundsHeight: number,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): { x: number; y: number } {
  const g = DASHBOARD_GRID_SIZE;
  const { w, h } = dashboardWidgetOuterSize(type, viewportWidth);
  let sx = Math.round(x / g) * g;
  let sy = Math.round(y / g) * g;
  const maxX = Math.max(0, Math.floor((boundsWidth - w) / g) * g);
  const maxY = Math.max(0, Math.floor((boundsHeight - h) / g) * g);
  sx = Math.min(Math.max(0, sx), maxX);
  sy = Math.min(Math.max(0, sy), maxY);
  return { x: sx, y: sy };
}

/** Есть ли между двумя осями выровненными прямоугольниками зазор не меньше `gap` (включая раздельность по одной оси). */
function boxesSeparatedWithGap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): boolean {
  return ax + aw + gap <= bx || bx + bw + gap <= ax || ay + ah + gap <= by || by + bh + gap <= ay;
}

function resolvePositionAgainstOthers(
  type: DashboardWidgetType,
  candidate: { x: number; y: number },
  others: DashboardWidget[],
  boundsW: number,
  boundsH: number,
  viewportW: number,
): { x: number; y: number } {
  const selfSize = dashboardWidgetOuterSize(type, viewportW);
  const placed = others.map((o) => ({
    x: o.x,
    y: o.y,
    ...dashboardWidgetOuterSize(o.type, viewportW),
  }));

  const ok = (x: number, y: number) =>
    placed.every((o) =>
      boxesSeparatedWithGap(x, y, selfSize.w, selfSize.h, o.x, o.y, o.w, o.h, DASHBOARD_WIDGET_GAP),
    );

  let { x, y } = snapAndClampDashboardPosition(candidate.x, candidate.y, type, boundsW, boundsH, viewportW);
  if (ok(x, y)) return { x, y };

  const g = DASHBOARD_GRID_SIZE;
  const dirs: Array<[number, number]> = [
    [g, 0],
    [-g, 0],
    [0, g],
    [0, -g],
    [g, g],
    [g, -g],
    [-g, g],
    [-g, -g],
  ];
  for (let ring = 1; ring <= 80; ring++) {
    for (const [dx, dy] of dirs) {
      const nx = candidate.x + dx * ring;
      const ny = candidate.y + dy * ring;
      const p = snapAndClampDashboardPosition(nx, ny, type, boundsW, boundsH, viewportW);
      if (ok(p.x, p.y)) return p;
    }
  }
  return { x, y };
}

export function resolveCollisions(
  widgets: DashboardWidget[],
  movedId: string,
  candidate: { x: number; y: number },
  boundsW: number,
  boundsH: number,
  viewportW: number,
): { x: number; y: number } {
  const self = widgets.find((w) => w.id === movedId);
  if (!self) return candidate;
  const others = widgets.filter((w) => w.id !== movedId);
  return resolvePositionAgainstOthers(self.type, candidate, others, boundsW, boundsH, viewportW);
}

/** Последовательно укладывает виджеты: каждый к сетке и без пересечений с уже размещёнными. */
export function layoutAllWidgetsSequential(
  widgets: DashboardWidget[],
  boundsW: number,
  boundsH: number,
  viewportW: number,
): DashboardWidget[] {
  const out: DashboardWidget[] = [];
  for (const w of widgets) {
    const snapped = snapAndClampDashboardPosition(w.x, w.y, w.type, boundsW, boundsH, viewportW);
    const p = resolvePositionAgainstOthers(w.type, snapped, out, boundsW, boundsH, viewportW);
    out.push({ ...w, x: p.x, y: p.y });
  }
  return out;
}

/** Дефолтный набор виджетов для гостей (координаты пересчитываются layout-ом). */
export const GUEST_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: "guest-btc", type: "price-sparkline", symbol: "BTC", x: 0, y: 0 },
  { id: "guest-eth", type: "price-sparkline", symbol: "ETH", x: 0, y: 0 },
  { id: "guest-macro", type: "macro-calendar", x: 0, y: 0 },
];

function estimateBoardSize(viewportWidth: number): { width: number; height: number } {
  return {
    width: Math.max(400, viewportWidth - 40),
    height: Math.max(600, (typeof window !== "undefined" ? window.innerHeight : 900) - 40),
  };
}

export function layoutGuestDashboardWidgets(
  raw: DashboardWidget[] = GUEST_DASHBOARD_WIDGETS,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200,
): DashboardWidget[] {
  const { width, height } = estimateBoardSize(viewportWidth);
  return layoutAllWidgetsSequential(
    raw.map((w) => ({ ...w })),
    width,
    height,
    viewportWidth,
  );
}

/** Укладка виджетов на холст; при неизвестных размерах — оценка по viewport. */
export function layoutDashboardWidgetsForBoard(
  widgets: DashboardWidget[],
  boardWidth: number | null | undefined,
  boardHeight: number | null | undefined,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): DashboardWidget[] {
  let width = boardWidth ?? 0;
  let height = boardHeight ?? 0;
  if (width < 1 || height < 1) {
    const est = estimateBoardSize(viewportWidth);
    width = est.width;
    height = est.height;
  }
  return layoutAllWidgetsSequential(
    widgets.map((w) => ({ ...w })),
    width,
    height,
    viewportWidth,
  );
}

function defaultWidgets(): DashboardWidget[] {
  return layoutGuestDashboardWidgets();
}

function normalizeWidgets(raw: unknown): DashboardWidget[] {
  if (!Array.isArray(raw)) return defaultWidgets();
  const out: DashboardWidget[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    if (!id) continue;
    if (!isWidgetType(o.type)) continue;
    const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : 0;
    const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : 0;
    const symRaw = o.symbol;
    const symbol =
      typeof symRaw === "string" && symRaw.trim().length > 0 ? symRaw.trim().toUpperCase() : undefined;
    const compareDaysRaw = o.compareDays;
    const compareDays =
      typeof compareDaysRaw === "number" && Number.isFinite(compareDaysRaw)
        ? normalizeFedCurveCompareDays(compareDaysRaw)
        : undefined;
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
  return out.length > 0 ? out : defaultWidgets();
}

export function loadDashboardWidgets(): DashboardWidget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWidgets();
    return normalizeWidgets(JSON.parse(raw));
  } catch {
    return defaultWidgets();
  }
}

export function saveDashboardWidgets(widgets: DashboardWidget[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    /* ignore */
  }
}
