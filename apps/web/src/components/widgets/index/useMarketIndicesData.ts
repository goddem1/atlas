import { useCallback, useSyncExternalStore } from "react";
import type { CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint } from "@atlas-v1/shared";
import { fetchMarketIndicesHistory, fetchMarketIndicesLatest, fetchMarketIndexDailyBars } from "../../../services/api";
import type { MarketIndexId, MarketIndexSnapshot } from "./marketIndexCatalog";
import {
  buildMarketIndexSnapshots,
  buildTvMarketIndexSnapshots,
  CMC_MARKET_INDEX_HISTORY_FIELDS,
} from "./marketIndexFromApi";

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
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<MarketIndicesStoreState>): void {
  state = { ...state, ...patch };
  emit();
}

async function refreshMarketIndicesData(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    setState({ loading: state.snapshots == null, error: null });
    try {
      const latest = await fetchMarketIndicesLatest();
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
      const historyByField = Object.fromEntries(historyEntries) as Partial<
        Record<CmcDailySnapshotHistoryField, CmcDailySnapshotHistoryPoint[]>
      >;

      setState({
        loading: false,
        error: null,
        day: latest.day,
        snapshots: {
          ...buildMarketIndexSnapshots(latest, historyByField),
          ...buildTvMarketIndexSnapshots({
            vix: vixBars.points ?? [],
            dxy: dxyBars.points ?? [],
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

function startPolling(): void {
  if (pollTimer != null) return;
  pollTimer = setInterval(() => {
    if (!paused) void refreshMarketIndicesData();
  }, POLL_MS);
}

function stopPolling(): void {
  if (pollTimer == null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    void refreshMarketIndicesData();
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
