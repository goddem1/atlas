export interface KlineDrawingToolPin {
  groupId: string;
  toolKey: string;
}

export interface KlineDrawingPinsResponse {
  pins: KlineDrawingToolPin[];
}

const MAX_PINS = 100;

export function normalizeKlineDrawingPins(raw: unknown): KlineDrawingToolPin[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: KlineDrawingToolPin[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const groupId = typeof record.groupId === "string" ? record.groupId.trim() : "";
    const toolKey = typeof record.toolKey === "string" ? record.toolKey.trim() : "";
    if (!groupId || !toolKey) continue;

    const key = `${groupId}:${toolKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ groupId, toolKey });
    if (result.length >= MAX_PINS) break;
  }

  return result;
}
