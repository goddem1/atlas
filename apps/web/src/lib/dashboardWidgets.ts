const STORAGE_KEY = "atlas-v1-dashboard-widgets";

export type DashboardWidgetType = "price-sparkline";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  x: number;
  y: number;
  /** Тикер из справочника (BTC, ETH) — только для `price-sparkline`. */
  symbol?: string;
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
];

export function createWidgetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function defaultWidgets(gridSize: number): DashboardWidget[] {
  return [
    {
      id: "initial",
      type: "price-sparkline",
      x: gridSize,
      y: gridSize,
    },
  ];
}

function isWidgetType(v: unknown): v is DashboardWidgetType {
  return v === "price-sparkline";
}

function normalizeWidgets(raw: unknown, gridSize: number): DashboardWidget[] {
  if (!Array.isArray(raw)) return defaultWidgets(gridSize);
  const out: DashboardWidget[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    if (!id) continue;
    if (!isWidgetType(o.type)) continue;
    const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : gridSize;
    const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : gridSize;
    const symRaw = o.symbol;
    const symbol =
      typeof symRaw === "string" && symRaw.trim().length > 0 ? symRaw.trim().toUpperCase() : undefined;
    out.push({ id, type: o.type, x, y, ...(symbol ? { symbol } : {}) });
  }
  return out.length > 0 ? out : defaultWidgets(gridSize);
}

export function loadDashboardWidgets(gridSize: number): DashboardWidget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWidgets(gridSize);
    return normalizeWidgets(JSON.parse(raw), gridSize);
  } catch {
    return defaultWidgets(gridSize);
  }
}

export function saveDashboardWidgets(widgets: DashboardWidget[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    /* ignore */
  }
}

export function snapToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}
