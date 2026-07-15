import type { KlineStoredOverlay } from "@atlas-v1/shared";
import { normalizeKlinePairSymbol } from "@atlas-v1/shared";
import { fetchKlineOverlays, saveKlineOverlays } from "../../../services/api";

const STORAGE_PREFIX = "atlas.price-kline-overlays.v1:";
const SAVE_DEBOUNCE_MS = 400;

function storageKey(pair: string): string {
  return `${STORAGE_PREFIX}${normalizeKlinePairSymbol(pair)}`;
}

function readLegacyLocalOverlays(pair: string): KlineStoredOverlay[] {
  try {
    const raw = localStorage.getItem(storageKey(pair));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as KlineStoredOverlay[];
  } catch {
    return [];
  }
}

function clearLegacyLocalOverlays(pair: string): void {
  try {
    localStorage.removeItem(storageKey(pair));
  } catch {
    // ignore quota / private mode
  }
}

export function createKlineOverlaysPairStore(params: {
  isLoggedIn: boolean;
  pair: string;
  normalize: (overlays: KlineStoredOverlay[]) => KlineStoredOverlay[];
}) {
  const pair = normalizeKlinePairSymbol(params.pair);
  let saveTimer: number | null = null;
  let saveGeneration = 0;
  let loadPromise: Promise<KlineStoredOverlay[]> | null = null;

  const persist = async (overlays: KlineStoredOverlay[]): Promise<KlineStoredOverlay[]> => {
    const normalized = params.normalize(overlays);
    const saved = await saveKlineOverlays(pair, normalized);
    return params.normalize(saved);
  };

  const scheduleSave = (overlays: KlineStoredOverlay[]) => {
    if (!params.isLoggedIn) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    const generation = ++saveGeneration;
    const snapshot = params.normalize(overlays);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      if (generation !== saveGeneration) return;
      void persist(snapshot).catch(() => {
        /* сеть / 401 — не блокируем UI */
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const load = (): Promise<KlineStoredOverlay[]> => {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      if (!params.isLoggedIn) return [];

      try {
        const remote = await fetchKlineOverlays(pair);
        const normalized = params.normalize(remote);
        if (normalized.length > 0) {
          return normalized;
        }

        const legacy = params.normalize(readLegacyLocalOverlays(pair));
        if (legacy.length > 0) {
          await persist(legacy);
          clearLegacyLocalOverlays(pair);
          return legacy;
        }

        return [];
      } catch {
        return params.normalize(readLegacyLocalOverlays(pair));
      }
    })();

    return loadPromise;
  };

  const save = (overlays: KlineStoredOverlay[], options?: { immediate?: boolean }): void => {
    if (!params.isLoggedIn) return;
    const normalized = params.normalize(overlays);
    if (options?.immediate) {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      void persist(normalized).catch(() => {
        /* сеть / 401 — не блокируем UI */
      });
      return;
    }
    scheduleSave(normalized);
  };

  const flush = async (overlays: KlineStoredOverlay[]): Promise<void> => {
    if (!params.isLoggedIn) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await persist(params.normalize(overlays));
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

  return { load, save, flush, dispose };
}
