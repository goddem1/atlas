export interface KlineStoredOverlayPoint {
  timestamp?: number;
  value?: number;
  dataIndex?: number;
}

export type KlineOverlayLabelAlong = "start" | "center" | "end";
export type KlineOverlayLabelSide = "top" | "middle" | "bottom";

export interface KlineOverlayLabelData {
  text: string;
  along: KlineOverlayLabelAlong;
  side: KlineOverlayLabelSide;
  /** Размер шрифта подписи в px. */
  size: number;
}

export interface KlineStoredOverlay {
  id: string;
  groupId: string;
  name: string;
  paneId: string;
  lock: boolean;
  visible: boolean;
  mode: string;
  points: KlineStoredOverlayPoint[];
  styles?: Record<string, unknown>;
  /** Подпись на линии (строка — legacy). */
  extendData?: string | KlineOverlayLabelData;
}

export interface KlineOverlaysResponse {
  overlays: KlineStoredOverlay[];
}

const MAX_OVERLAYS = 500;
const MAX_POINTS_PER_OVERLAY = 64;
const MAX_LABEL_LENGTH = 120;
const DEFAULT_LABEL_SIZE = 12;
const MIN_LABEL_SIZE = 10;
const MAX_LABEL_SIZE = 28;

function normalizeLabelSize(value: unknown): number {
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(size)) return DEFAULT_LABEL_SIZE;
  return Math.min(MAX_LABEL_SIZE, Math.max(MIN_LABEL_SIZE, Math.round(size)));
}

function isOverlayPoint(value: unknown): value is KlineStoredOverlayPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as KlineStoredOverlayPoint;
  if (point.timestamp !== undefined && !Number.isFinite(point.timestamp)) return false;
  if (point.value !== undefined && !Number.isFinite(point.value)) return false;
  if (point.dataIndex !== undefined && !Number.isFinite(point.dataIndex)) return false;
  return point.value !== undefined || point.timestamp !== undefined || point.dataIndex !== undefined;
}

function isLabelAlong(value: unknown): value is KlineOverlayLabelAlong {
  return value === "start" || value === "center" || value === "end";
}

function isLabelSide(value: unknown): value is KlineOverlayLabelSide {
  return value === "top" || value === "middle" || value === "bottom";
}

export function normalizeKlineOverlayLabelData(raw: unknown): KlineOverlayLabelData | undefined {
  if (typeof raw === "string") {
    const text = raw.trim().slice(0, MAX_LABEL_LENGTH);
    if (!text) return undefined;
    return { text, along: "start", side: "top", size: DEFAULT_LABEL_SIZE };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim().slice(0, MAX_LABEL_LENGTH) : "";
  if (!text) return undefined;

  return {
    text,
    along: isLabelAlong(record.along) ? record.along : "start",
    side: isLabelSide(record.side) ? record.side : "top",
    size: normalizeLabelSize(record.size),
  };
}

export function normalizeKlinePairSymbol(pair: string): string {
  return pair.trim().toUpperCase();
}

export function normalizeKlineOverlays(raw: unknown): KlineStoredOverlay[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: KlineStoredOverlay[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const groupId = typeof record.groupId === "string" ? record.groupId.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const paneId = typeof record.paneId === "string" ? record.paneId.trim() : "candle_pane";
    const mode = typeof record.mode === "string" ? record.mode.trim() : "normal";
    if (!id || !groupId || !name) continue;
    if (!Array.isArray(record.points)) continue;

    const points = record.points
      .filter(isOverlayPoint)
      .slice(0, MAX_POINTS_PER_OVERLAY)
      .filter((point) => Number.isFinite(point.value));
    if (points.length === 0) continue;

    if (seen.has(id)) continue;
    seen.add(id);

    const overlay: KlineStoredOverlay = {
      id,
      groupId,
      name,
      paneId: paneId || "candle_pane",
      lock: Boolean(record.lock),
      visible: record.visible !== false,
      mode: mode || "normal",
      points,
    };

    if (record.styles && typeof record.styles === "object" && !Array.isArray(record.styles)) {
      overlay.styles = record.styles as Record<string, unknown>;
    }

    const label = normalizeKlineOverlayLabelData(record.extendData);
    if (label) overlay.extendData = label;

    result.push(overlay);
    if (result.length >= MAX_OVERLAYS) break;
  }

  return result;
}
