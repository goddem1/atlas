import type { KlineStoredIndicators } from "@atlas-v1/shared";
import { normalizeKlineIndicators, normalizeKlinePairSymbol } from "@atlas-v1/shared";
import { fetchKlineIndicators, saveKlineIndicators } from "../../../services/api";

const STORAGE_PREFIX = "atlas.price-kline-indicators.v1:";
const SAVE_DEBOUNCE_MS = 400;

function storageKey(pair: string): string {
  return `${STORAGE_PREFIX}${normalizeKlinePairSymbol(pair)}`;
}

function readLocalIndicators(pair: string): KlineStoredIndicators | null {
  try {
    const raw = localStorage.getItem(storageKey(pair));
    if (!raw) return null;
    return normalizeKlineIndicators(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeLocalIndicators(pair: string, indicators: KlineStoredIndicators): void {
  try {
    localStorage.setItem(storageKey(pair), JSON.stringify(indicators));
  } catch {
    // ignore quota / private mode
  }
}

export function createKlineIndicatorsPairStore(params: {
  isLoggedIn: boolean;
  pair: string;
}) {
  const pair = normalizeKlinePairSymbol(params.pair);
  let saveTimer: number | null = null;
  let saveGeneration = 0;
  let loadPromise: Promise<KlineStoredIndicators | null> | null = null;

  const persistRemote = async (
    indicators: KlineStoredIndicators,
  ): Promise<KlineStoredIndicators> => {
    const saved = await saveKlineIndicators(pair, indicators);
    return normalizeKlineIndicators(saved) ?? indicators;
  };

  const scheduleRemoteSave = (indicators: KlineStoredIndicators) => {
    if (!params.isLoggedIn) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    const generation = ++saveGeneration;
    const snapshot = normalizeKlineIndicators(indicators) ?? indicators;
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      if (generation !== saveGeneration) return;
      void persistRemote(snapshot).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  };

  const load = (): Promise<KlineStoredIndicators | null> => {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const local = readLocalIndicators(pair);

      if (!params.isLoggedIn) return local;

      try {
        const remote = normalizeKlineIndicators(await fetchKlineIndicators(pair));

        if (remote != null) {
          writeLocalIndicators(pair, remote);
          return remote;
        }

        if (local != null) {
          try {
            await persistRemote(local);
          } catch {
            // keep local
          }
          return local;
        }

        return null;
      } catch {
        return local;
      }
    })();

    return loadPromise;
  };

  const save = (indicators: KlineStoredIndicators, options?: { immediate?: boolean }): void => {
    const normalized = normalizeKlineIndicators(indicators) ?? { main: [], sub: [] };
    writeLocalIndicators(pair, normalized);

    if (!params.isLoggedIn) return;

    if (options?.immediate) {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      void persistRemote(normalized).catch(() => undefined);
      return;
    }

    scheduleRemoteSave(normalized);
  };

  const flush = async (indicators: KlineStoredIndicators): Promise<void> => {
    const normalized = normalizeKlineIndicators(indicators) ?? { main: [], sub: [] };
    writeLocalIndicators(pair, normalized);
    if (!params.isLoggedIn) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await persistRemote(normalized);
    } catch {
      // ignore on teardown
    }
  };

  const dispose = (): void => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  return { load, save, flush, dispose, pair };
}
