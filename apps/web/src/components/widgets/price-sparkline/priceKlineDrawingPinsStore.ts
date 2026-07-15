import type { KlineDrawingToolPin } from "@atlas-v1/shared";
import { fetchKlineDrawingPins, saveKlineDrawingPins } from "../../../services/api";

const LOCAL_STORAGE_KEY_V2 = "atlas.price-kline-drawing-pins.v2";
const LOCAL_STORAGE_KEY_V1 = "atlas.price-kline-drawing-pins.v1";
const SAVE_DEBOUNCE_MS = 400;

function readLegacyLocalPins(
  normalize: (pins: KlineDrawingToolPin[]) => KlineDrawingToolPin[],
): KlineDrawingToolPin[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_V2);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalize(parsed as KlineDrawingToolPin[]);
      }
    }

    const legacyRaw = localStorage.getItem(LOCAL_STORAGE_KEY_V1);
    if (!legacyRaw) return [];
    const legacyParsed: unknown = JSON.parse(legacyRaw);
    if (!legacyParsed || typeof legacyParsed !== "object" || Array.isArray(legacyParsed)) return [];

    return normalize(
      Object.entries(legacyParsed as Record<string, string>).map(([groupId, toolKey]) => ({
        groupId,
        toolKey,
      })),
    );
  } catch {
    return [];
  }
}

function clearLegacyLocalPins(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY_V2);
    localStorage.removeItem(LOCAL_STORAGE_KEY_V1);
  } catch {
    // ignore quota / private mode
  }
}

export function createKlineDrawingPinsStore(params: {
  isLoggedIn: boolean;
  normalize: (pins: KlineDrawingToolPin[]) => KlineDrawingToolPin[];
}) {
  let pins: KlineDrawingToolPin[] = [];
  let ready = false;
  let saveTimer: number | null = null;
  let saveGeneration = 0;

  const persist = async (next: KlineDrawingToolPin[]): Promise<KlineDrawingToolPin[]> => {
    const normalized = params.normalize(next);
    const saved = await saveKlineDrawingPins(normalized);
    pins = params.normalize(saved);
    return pins;
  };

  const scheduleSave = () => {
    if (!params.isLoggedIn) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    const generation = ++saveGeneration;
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      if (generation !== saveGeneration) return;
      void persist(pins).catch(() => {
        /* сеть / 401 — не блокируем UI */
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const load = async (): Promise<KlineDrawingToolPin[]> => {
    if (ready) return pins;

    if (!params.isLoggedIn) {
      pins = [];
      ready = true;
      return pins;
    }

    try {
      const remote = await fetchKlineDrawingPins();
      const normalized = params.normalize(remote);
      if (normalized.length > 0) {
        pins = normalized;
      } else {
        const legacy = readLegacyLocalPins(params.normalize);
        pins = legacy;
        if (pins.length > 0) {
          await persist(pins);
          clearLegacyLocalPins();
        }
      }
    } catch {
      pins = readLegacyLocalPins(params.normalize);
    }

    ready = true;
    return pins;
  };

  const getPins = (): KlineDrawingToolPin[] => pins;

  const setPins = (next: KlineDrawingToolPin[]): void => {
    pins = params.normalize(next);
    scheduleSave();
  };

  const flush = async (): Promise<void> => {
    if (!params.isLoggedIn || !ready) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await persist(pins);
    } catch {
      // ignore network errors on teardown
    }
  };

  const dispose = (): void => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  return { load, getPins, setPins, flush, dispose };
}
