import type { KlineStoredIndicatorEntry, KlineStoredIndicators } from "@atlas-v1/shared";
import { normalizeKlineIndicators, normalizeKlinePairSymbol } from "@atlas-v1/shared";
import {
  ActionType,
  type Chart,
  type Indicator,
} from "klinecharts";
import { createKlineIndicatorsPairStore } from "./priceKlineIndicatorsPairStore";
import { resolveKlineChartFromProContainer } from "./priceKlineOverlayPersistence";

const CANDLE_PANE_ID = "candle_pane";
const X_AXIS_PANE_ID = "x_axis_pane";
const MAIN_INDICATOR_NAMES = new Set(["MA", "EMA", "SMA", "BOLL", "SAR", "BBI"]);

export const DEFAULT_KLINE_MAIN_INDICATORS = ["MA"] as const;
export const DEFAULT_KLINE_SUB_INDICATORS = ["VOL", "MACD"] as const;

export type StoredKlineIndicatorEntry = KlineStoredIndicatorEntry;
export type StoredKlineIndicators = KlineStoredIndicators;

type IndicatorStoreInternal = {
  addInstance: (...args: unknown[]) => Promise<unknown>;
  removeInstance: (...args: unknown[]) => boolean;
  override: (...args: unknown[]) => Promise<unknown>;
  getInstances: (paneId: string) => Indicator[];
};

type ChartInternal = Chart & {
  _chartStore?: {
    getIndicatorStore: () => IndicatorStoreInternal;
  };
  _drawPanes?: Array<{ getId: () => string }>;
};

type ActivePersistence = {
  pair: string;
  saveNow: (options?: { immediate?: boolean }) => void;
};

let activePersistence: ActivePersistence | null = null;

function getIndicatorStore(chart: Chart): IndicatorStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getIndicatorStore?.() ?? null;
}

function isChartReady(chart: Chart): boolean {
  return chart.getDataList().length > 0;
}

function serializeIndicator(indicator: Indicator): StoredKlineIndicatorEntry {
  const calcParams = Array.isArray(indicator.calcParams)
    ? indicator.calcParams
        .map((value) => (typeof value === "number" ? value : Number(value)))
        .filter((value) => Number.isFinite(value))
    : [];
  return {
    name: indicator.name,
    calcParams,
    visible: indicator.visible,
  };
}

function getOrderedSubPaneIds(chart: Chart): string[] {
  const panes = (chart as ChartInternal)._drawPanes ?? [];
  return panes
    .map((pane) => pane.getId())
    .filter((paneId) => paneId !== CANDLE_PANE_ID && paneId !== X_AXIS_PANE_ID);
}

function findSubPaneId(chart: Chart, name: string): string | null {
  const store = getIndicatorStore(chart);
  if (!store) return null;
  for (const paneId of getOrderedSubPaneIds(chart)) {
    if (store.getInstances(paneId).some((item) => item.name === name)) return paneId;
  }
  return null;
}

function isMainIndicator(name: string): boolean {
  return MAIN_INDICATOR_NAMES.has(name.toUpperCase());
}

function indicatorPaneOptions(name: string) {
  if (name !== "VOL") return undefined;
  return { gap: { bottom: 2 } };
}

async function createNamedIndicator(
  chart: Chart,
  entry: StoredKlineIndicatorEntry,
): Promise<void> {
  const paneOptions = indicatorPaneOptions(entry.name);
  const payload = {
    name: entry.name,
    calcParams: entry.calcParams,
    visible: entry.visible,
  };
  if (isMainIndicator(entry.name)) {
    await chart.createIndicator(payload, true, { id: CANDLE_PANE_ID, ...paneOptions });
    return;
  }
  await chart.createIndicator(payload, false, paneOptions);
}

function removeNamedIndicator(chart: Chart, name: string): void {
  if (getIndicatorStore(chart)?.getInstances(CANDLE_PANE_ID).some((item) => item.name === name)) {
    chart.removeIndicator(CANDLE_PANE_ID, name);
    return;
  }
  const paneId = findSubPaneId(chart, name);
  if (paneId) chart.removeIndicator(paneId, name);
}

/** Sync local-only read helper kept for toolbar active state before data loads. */
export function loadStoredKlineIndicators(pair: string): StoredKlineIndicators | null {
  try {
    const raw = localStorage.getItem(
      `atlas.price-kline-indicators.v1:${normalizeKlinePairSymbol(pair)}`,
    );
    if (!raw) return null;
    return normalizeKlineIndicators(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveStoredKlineIndicators(pair: string, indicators: StoredKlineIndicators): void {
  try {
    localStorage.setItem(
      `atlas.price-kline-indicators.v1:${normalizeKlinePairSymbol(pair)}`,
      JSON.stringify(normalizeKlineIndicators(indicators) ?? indicators),
    );
  } catch {
    // ignore
  }
}

export function namesFromStoredIndicators(stored: StoredKlineIndicators | null): {
  mainIndicators: string[];
  subIndicators: string[];
} {
  if (!stored) {
    return {
      mainIndicators: [...DEFAULT_KLINE_MAIN_INDICATORS],
      subIndicators: [...DEFAULT_KLINE_SUB_INDICATORS],
    };
  }
  return {
    mainIndicators: stored.main.map((entry) => entry.name),
    subIndicators: stored.sub.map((entry) => entry.name),
  };
}

export function getDefaultStoredKlineIndicators(): StoredKlineIndicators {
  return {
    main: DEFAULT_KLINE_MAIN_INDICATORS.map((name) => ({
      name,
      calcParams: [],
      visible: true,
    })),
    sub: DEFAULT_KLINE_SUB_INDICATORS.map((name) => ({
      name,
      calcParams: [],
      visible: true,
    })),
  };
}

export function getInitialKlineIndicatorNames(pair: string): {
  mainIndicators: string[];
  subIndicators: string[];
  stored: StoredKlineIndicators | null;
} {
  const stored = loadStoredKlineIndicators(pair);
  const names = namesFromStoredIndicators(stored);
  return { ...names, stored };
}

export async function resolveInitialKlineIndicators(
  pair: string,
  isLoggedIn: boolean,
): Promise<{
  mainIndicators: string[];
  subIndicators: string[];
  stored: StoredKlineIndicators | null;
}> {
  const store = createKlineIndicatorsPairStore({ isLoggedIn, pair });
  const stored = await store.load();
  store.dispose();
  const names = namesFromStoredIndicators(stored);
  return { ...names, stored };
}

export function collectKlineIndicators(chart: Chart | null): StoredKlineIndicators | null {
  if (!chart || !isChartReady(chart)) return null;

  const store = getIndicatorStore(chart);
  if (!store) return null;

  const main = store.getInstances(CANDLE_PANE_ID).map(serializeIndicator);
  const sub: StoredKlineIndicatorEntry[] = [];

  for (const paneId of getOrderedSubPaneIds(chart)) {
    for (const indicator of store.getInstances(paneId)) {
      sub.push(serializeIndicator(indicator));
    }
  }

  return { main, sub };
}

export function persistActiveKlineIndicators(options?: { immediate?: boolean }): void {
  activePersistence?.saveNow(options);
}

export async function syncKlineIndicatorsFromStored(
  chart: Chart,
  stored: StoredKlineIndicators,
): Promise<void> {
  const desiredMain = new Map(stored.main.map((entry) => [entry.name, entry] as const));
  const desiredSub = new Map(stored.sub.map((entry) => [entry.name, entry] as const));

  const currentMain = new Set(
    (getIndicatorStore(chart)?.getInstances(CANDLE_PANE_ID) ?? []).map((item) => item.name),
  );
  const currentSub = new Set<string>();
  for (const paneId of getOrderedSubPaneIds(chart)) {
    for (const indicator of getIndicatorStore(chart)?.getInstances(paneId) ?? []) {
      currentSub.add(indicator.name);
    }
  }

  for (const name of currentMain) {
    if (!desiredMain.has(name)) removeNamedIndicator(chart, name);
  }
  for (const name of currentSub) {
    if (!desiredSub.has(name)) removeNamedIndicator(chart, name);
  }

  for (const entry of stored.main) {
    if (!currentMain.has(entry.name)) {
      await createNamedIndicator(chart, entry);
    }
  }
  for (const entry of stored.sub) {
    if (!currentSub.has(entry.name)) {
      await createNamedIndicator(chart, entry);
    }
  }

  for (const entry of stored.main) {
    chart.overrideIndicator(
      {
        name: entry.name,
        calcParams: entry.calcParams,
        visible: entry.visible,
      },
      CANDLE_PANE_ID,
    );
  }
  for (const entry of stored.sub) {
    const paneId = findSubPaneId(chart, entry.name);
    if (!paneId) continue;
    chart.overrideIndicator(
      {
        name: entry.name,
        calcParams: entry.calcParams,
        visible: entry.visible,
      },
      paneId,
    );
  }
}

function hookIndicatorStore(
  chart: Chart,
  onChange: () => void,
  onRemove?: () => void,
): () => void {
  const store = getIndicatorStore(chart);
  if (!store) return () => undefined;

  const original = {
    addInstance: store.addInstance.bind(store),
    removeInstance: store.removeInstance.bind(store),
    override: store.override.bind(store),
  };

  store.addInstance = async (...args: unknown[]) => {
    const result = await original.addInstance(...args);
    onChange();
    return result;
  };
  store.removeInstance = (...args: unknown[]) => {
    const result = original.removeInstance(...args);
    if (result) onRemove?.();
    onChange();
    return result;
  };
  store.override = async (...args: unknown[]) => {
    const result = await original.override(...args);
    onChange();
    return result;
  };

  return () => {
    store.addInstance = original.addInstance;
    store.removeInstance = original.removeInstance;
    store.override = original.override;
  };
}

export function attachKlineIndicatorPersistence(params: {
  container: HTMLElement;
  pair: string;
  isLoggedIn: boolean;
  stored: StoredKlineIndicators | null;
}): () => void {
  const { container, isLoggedIn, stored } = params;
  const pair = normalizeKlinePairSymbol(params.pair);
  const storage = createKlineIndicatorsPairStore({ isLoggedIn, pair });

  let disposed = false;
  let chart: Chart | null = null;
  let restored = false;
  let readyToSave = false;
  let userMutated = false;
  let saveTimer: number | null = null;
  let pollTimer: number | null = null;
  let unhookStore: (() => void) | null = null;
  let lastSnapshot = stored != null ? JSON.stringify(stored) : "";

  const saveNow = (options?: { immediate?: boolean }) => {
    if (disposed || !chart || !isChartReady(chart)) return;
    if (!readyToSave) {
      if (!options?.immediate) return;
      readyToSave = true;
    }
    if (options?.immediate) userMutated = true;
    const indicators = collectKlineIndicators(chart);
    if (!indicators) return;
    const next = JSON.stringify(indicators);
    if (next === lastSnapshot && !options?.immediate) return;
    lastSnapshot = next;
    storage.save(indicators, options);
  };

  const scheduleSave = () => {
    if (saveTimer != null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveNow(), 250);
  };

  const tryRestore = async () => {
    if (disposed || restored || !chart) return;
    if (stored && !userMutated) {
      if (!isChartReady(chart)) return;
      restored = true;
      try {
        await syncKlineIndicatorsFromStored(chart, stored);
      } catch {
        // keep going — still enable saves so user edits aren't lost
      }
    } else {
      restored = true;
    }
    if (disposed) return;
    readyToSave = true;
    const indicators = collectKlineIndicators(chart);
    if (indicators) {
      lastSnapshot = JSON.stringify(indicators);
      // First visit: persist defaults so next reload has a concrete baseline.
      if (!stored && !userMutated) storage.save(indicators);
    }
  };

  let detachChartListeners: (() => void) | null = null;
  let rafId = 0;

  const attachToChart = (resolved: Chart) => {
    chart = resolved;

    const onDataReady = () => {
      void tryRestore().then(() => scheduleSave());
    };

    const onTooltipIconClick = () => {
      scheduleSave();
    };

    chart.subscribeAction(ActionType.OnDataReady, onDataReady);
    chart.subscribeAction(ActionType.OnTooltipIconClick, onTooltipIconClick);
    unhookStore = hookIndicatorStore(
      chart,
      () => {
        userMutated = true;
        scheduleSave();
      },
      () => {
        userMutated = true;
        scheduleSave();
      },
    );

    void tryRestore();
    window.setTimeout(() => void tryRestore(), 400);
    window.setTimeout(() => void tryRestore(), 1200);

    pollTimer = window.setInterval(() => {
      if (readyToSave) scheduleSave();
    }, 1000);

    detachChartListeners = () => {
      chart?.unsubscribeAction(ActionType.OnDataReady, onDataReady);
      chart?.unsubscribeAction(ActionType.OnTooltipIconClick, onTooltipIconClick);
    };

    activePersistence = {
      pair,
      saveNow,
    };
  };

  const waitForChart = () => {
    if (disposed || chart) return;
    const resolved = resolveKlineChartFromProContainer(container);
    if (resolved) {
      attachToChart(resolved);
      return;
    }
    rafId = window.requestAnimationFrame(waitForChart);
  };

  waitForChart();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    if (pollTimer != null) window.clearInterval(pollTimer);
    if (saveTimer != null) window.clearTimeout(saveTimer);
    detachChartListeners?.();
    unhookStore?.();
    if (readyToSave && chart && isChartReady(chart)) {
      const indicators = collectKlineIndicators(chart);
      if (indicators) {
        void storage.flush(indicators);
      }
    }
    storage.dispose();
    if (activePersistence?.pair === pair) {
      activePersistence = null;
    }
    chart = null;
  };
}
