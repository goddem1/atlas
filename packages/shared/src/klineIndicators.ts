export interface KlineStoredIndicatorEntry {
  name: string;
  calcParams: number[];
  visible: boolean;
}

export interface KlineStoredIndicators {
  main: KlineStoredIndicatorEntry[];
  sub: KlineStoredIndicatorEntry[];
}

export interface KlineIndicatorsResponse {
  indicators: KlineStoredIndicators | null;
}

const MAX_INDICATORS = 32;

function normalizeCalcParams(params: unknown): number[] {
  if (!Array.isArray(params)) return [];
  return params
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value))
    .slice(0, 16);
}

function normalizeEntry(value: unknown): KlineStoredIndicatorEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim().toUpperCase() : "";
  if (!name) return null;
  return {
    name,
    calcParams: normalizeCalcParams(record.calcParams),
    visible: record.visible !== false,
  };
}

function normalizeList(raw: unknown): KlineStoredIndicatorEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: KlineStoredIndicatorEntry[] = [];
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push(entry);
    if (result.length >= MAX_INDICATORS) break;
  }
  return result;
}

/** Возвращает null, если payload отсутствует или повреждён. */
export function normalizeKlineIndicators(raw: unknown): KlineStoredIndicators | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!("main" in record) && !("sub" in record)) return null;
  return {
    main: normalizeList(record.main),
    sub: normalizeList(record.sub),
  };
}
