import { useCallback, useSyncExternalStore } from "react";
import type { CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint } from "@atlas-v1/shared";
import { fetchMarketIndicesHistory, fetchMarketIndicesLatest, fetchMarketIndexDailyBars } from "../../../services/api";
import type { MarketIndexId, MarketIndexSnapshot } from "./marketIndexCatalog";
import {
  buildMarketIndexSnapshots,
  buildTvMarketIndexSnapshots,
  CMC_MARKET_INDEX_HISTORY_FIELDS,
} from "./marketIndexFromApi";

/** Автообновление раз в час без перезагрузки страницы. */
const POLL_MS = 60 * 60_000;

type MarketIndicesStoreState = {
  loading: boolean;
  error: string | null;
  day: string | null;
  snapshots: Partial<Record<MarketIndexId, MarketIndexSnapshot>> | null;
};

const initialState: MarketIndicesStoreState = {
  loading: false,
  error: null,
  day: null,
  snapshots: null,
};

let state: MarketIndicesStoreState = initialState;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
let subscriberCount = 0;
let paused = false;
let historyByFieldCache: Partial<
  Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>
> | null = null;
let tvBarsCache: { vix: Awaited<ReturnType<typeof fetchMarketIndexDailyBars>>["points"]; dxy: Awaited<ReturnType<typeof fetchMarketIndexDailyBars>>["points"] } | null =
  null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<MarketIndicesStoreState>): void {
  state = { ...state, ...patch };
  emit();
}

async function loadBaselineHistory(): Promise<{
  historyByField: Partial<Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>>;
  vix: Awaited<ReturnType<typeof fetchMarketIndexDailyBars>>["points"];
  dxy: Awaited<ReturnType<typeof fetchMarketIndexDailyBars>>["points"];
}> {
  const [historyEntries, vixBars, dxyBars] = await Promise.all([
    Promise.all(
      CMC_MARKET_INDEX_HISTORY_FIELDS.map(async (field) => {
        const response = await fetchMarketIndicesHistory(field, 2);
        return [field, response.points] as const;
      }),
    ),
    fetchMarketIndexDailyBars({ indexId: "vix", limit: 2 }),
    fetchMarketIndexDailyBars({ indexId: "dxy", limit: 2 }),
  ]);
  return {
    historyByField: Object.fromEntries(historyEntries) as Partial<
      Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>
    >,
    vix: vixBars.points ?? [],
    dxy: dxyBars.points ?? [],
  };
}

async function refreshMarketIndicesData(options?: { forceBaseline?: boolean }): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    setState({ loading: state.snapshots == null, error: null });
    try {
      const latest = await fetchMarketIndicesLatest();
      const needBaseline =
        options?.forceBaseline ||
        historyByFieldCache == null ||
        tvBarsCache == null ||
        state.day !== latest.day;

      if (needBaseline) {
        const baseline = await loadBaselineHistory();
        historyByFieldCache = baseline.historyByField;
        tvBarsCache = { vix: baseline.vix, dxy: baseline.dxy };
      }

      setState({
        loading: false,
        error: null,
        day: latest.day,
        snapshots: {
          ...buildMarketIndexSnapshots(latest, historyByFieldCache ?? {}),
          ...buildTvMarketIndexSnapshots({
            vix: tvBarsCache?.vix ?? [],
            dxy: tvBarsCache?.dxy ?? [],
          }),
        },
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Не удалось загрузить индексы",
      });
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible" && !paused && subscriberCount > 0) {
    void refreshMarketIndicesData();
  }
}

function startPolling(): void {
  if (pollTimer != null) return;
  pollTimer = setInterval(() => {
    if (!paused) void refreshMarketIndicesData();
  }, POLL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function stopPolling(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    void refreshMarketIndicesData({ forceBaseline: true });
    startPolling();
  }
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) stopPolling();
  };
}

function getSnapshot(): MarketIndicesStoreState {
  return state;
}

export function setMarketIndicesPollingPaused(nextPaused: boolean): void {
  paused = nextPaused;
}

export function useMarketIndicesData(enabled = true): MarketIndicesStoreState {
  const subscribeWhenEnabled = useCallback(
    (listener: () => void) => (enabled ? subscribe(listener) : () => {}),
    [enabled],
  );

  const store = useSyncExternalStore(subscribeWhenEnabled, getSnapshot, getSnapshot);
  return enabled ? store : initialState;
}
