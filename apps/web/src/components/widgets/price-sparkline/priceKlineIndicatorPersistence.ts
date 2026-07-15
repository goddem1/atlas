import {
  ActionType,
  type Chart,
  type Indicator,
} from "klinecharts";
import {
  resolveKlineChartFromProContainer,
} from "./priceKlineOverlayPersistence";

const STORAGE_PREFIX = "atlas.price-kline-indicators.v1:";
const CANDLE_PANE_ID = "candle_pane";
const X_AXIS_PANE_ID = "x_axis_pane";

export const DEFAULT_KLINE_MAIN_INDICATORS = ["MA"] as const;
export const DEFAULT_KLINE_SUB_INDICATORS = ["VOL", "MACD"] as const;

export type StoredKlineIndicatorEntry = {
  name: string;
  calcParams: number[];
  visible: boolean;
};

export type StoredKlineIndicators = {
  main: StoredKlineIndicatorEntry[];
  sub: StoredKlineIndicatorEntry[];
};

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

function storageKey(pair: string): string {
  return `${STORAGE_PREFIX}${pair.trim().toUpperCase()}`;
}

function getIndicatorStore(chart: Chart): IndicatorStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getIndicatorStore?.() ?? null;
}

function isChartReady(chart: Chart): boolean {
  return chart.getDataList().length > 0;
}

function normalizeCalcParams(params: unknown): number[] {
  if (!Array.isArray(params)) return [];
  return params
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
}

function serializeIndicator(indicator: Indicator): StoredKlineIndicatorEntry {
  return {
    name: indicator.name,
    calcParams: normalizeCalcParams(indicator.calcParams),
    visible: indicator.visible,
  };
}

function isValidEntry(value: unknown): value is StoredKlineIndicatorEntry {
  return (
    typeof value === "object" &&
    value != null &&
    typeof (value as StoredKlineIndicatorEntry).name === "string" &&
    Array.isArray((value as StoredKlineIndicatorEntry).calcParams) &&
    typeof (value as StoredKlineIndicatorEntry).visible === "boolean"
  );
}

function isValidStored(value: unknown): value is StoredKlineIndicators {
  if (typeof value !== "object" || value == null) return false;
  const record = value as StoredKlineIndicators;
  return (
    Array.isArray(record.main) &&
    record.main.every(isValidEntry) &&
    Array.isArray(record.sub) &&
    record.sub.every(isValidEntry)
  );
}

function getOrderedSubPaneIds(chart: Chart): string[] {
  const panes = (chart as ChartInternal)._drawPanes ?? [];
  return panes
    .map((pane) => pane.getId())
    .filter((paneId) => paneId !== CANDLE_PANE_ID && paneId !== X_AXIS_PANE_ID);
}

export function loadStoredKlineIndicators(pair: string): StoredKlineIndicators | null {
  try {
    const raw = localStorage.getItem(storageKey(pair));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidStored(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredKlineIndicators(pair: string, indicators: StoredKlineIndicators): void {
  try {
    localStorage.setItem(storageKey(pair), JSON.stringify(indicators));
  } catch {
    // ignore quota / private mode
  }
}

export function getInitialKlineIndicatorNames(pair: string): {
  mainIndicators: string[];
  subIndicators: string[];
  stored: StoredKlineIndicators | null;
} {
  const stored = loadStoredKlineIndicators(pair);
  if (!stored) {
    return {
      mainIndicators: [...DEFAULT_KLINE_MAIN_INDICATORS],
      subIndicators: [...DEFAULT_KLINE_SUB_INDICATORS],
      stored: null,
    };
  }

  const mainIndicators = stored.main.map((entry) => entry.name);
  const subIndicators = stored.sub.map((entry) => entry.name);

  return {
    mainIndicators,
    subIndicators,
    stored,
  };
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

export function persistKlineIndicators(
  chart: Chart | null,
  pair: string,
  options?: { allowClear?: boolean },
): void {
  if (!chart || !isChartReady(chart)) return;

  const indicators = collectKlineIndicators(chart);
  if (!indicators) return;

  if (
    indicators.main.length === 0 &&
    indicators.sub.length === 0 &&
    !options?.allowClear
  ) {
    return;
  }

  saveStoredKlineIndicators(pair, indicators);
}

export function applyStoredKlineIndicatorOverrides(
  chart: Chart,
  stored: StoredKlineIndicators,
): void {
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

  const subPaneIds = getOrderedSubPaneIds(chart);
  stored.sub.forEach((entry, index) => {
    const paneId = subPaneIds[index];
    if (!paneId) return;
    chart.overrideIndicator(
      {
        name: entry.name,
        calcParams: entry.calcParams,
        visible: entry.visible,
      },
      paneId,
    );
  });
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
  stored: StoredKlineIndicators | null;
}): () => void {
  const { container, pair, stored } = params;
  let disposed = false;
  let chart: Chart | null = null;
  let restored = false;
  let sawIndicatorsThisSession = stored != null;
  let saveTimer: number | null = null;
  let pollTimer: number | null = null;
  let restoreTimer: number | null = null;
  let unhookStore: (() => void) | null = null;
  let lastSnapshot =
    stored != null ? JSON.stringify(stored) : loadStoredKlineIndicators(pair) ? "__seed__" : "";

  const scheduleSave = (allowClear = false) => {
    if (saveTimer != null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!chart || !isChartReady(chart)) return;
      const indicators = collectKlineIndicators(chart);
      if (!indicators) return;
      if (indicators.main.length > 0 || indicators.sub.length > 0) {
        sawIndicatorsThisSession = true;
      }
      if (
        indicators.main.length === 0 &&
        indicators.sub.length === 0 &&
        !allowClear &&
        !sawIndicatorsThisSession
      ) {
        return;
      }
      const next = JSON.stringify(indicators);
      if (next === lastSnapshot) return;
      lastSnapshot = next;
      saveStoredKlineIndicators(pair, indicators);
    }, 250);
  };

  const tryRestore = () => {
    if (disposed || restored || !chart || !isChartReady(chart) || !stored) return;
    restored = true;
    applyStoredKlineIndicatorOverrides(chart, stored);
    const indicators = collectKlineIndicators(chart);
    if (indicators) {
      sawIndicatorsThisSession = true;
      lastSnapshot = JSON.stringify(indicators);
    }
  };

  let detachChartListeners: (() => void) | null = null;
  let rafId = 0;

  const attachToChart = (resolved: Chart) => {
    chart = resolved;

    const onDataReady = () => {
      tryRestore();
      scheduleSave();
    };

    const onTooltipIconClick = () => {
      scheduleSave();
    };

    chart.subscribeAction(ActionType.OnDataReady, onDataReady);
    chart.subscribeAction(ActionType.OnTooltipIconClick, onTooltipIconClick);
    unhookStore = hookIndicatorStore(
      chart,
      () => scheduleSave(),
      () => {
        sawIndicatorsThisSession = true;
        scheduleSave(true);
      },
    );

    restoreTimer = window.setTimeout(tryRestore, 0);
    window.setTimeout(tryRestore, 400);
    window.setTimeout(tryRestore, 1200);

    pollTimer = window.setInterval(() => scheduleSave(), 800);

    detachChartListeners = () => {
      chart?.unsubscribeAction(ActionType.OnDataReady, onDataReady);
      chart?.unsubscribeAction(ActionType.OnTooltipIconClick, onTooltipIconClick);
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
    if (restoreTimer != null) window.clearTimeout(restoreTimer);
    if (saveTimer != null) window.clearTimeout(saveTimer);
    detachChartListeners?.();
    unhookStore?.();
    persistKlineIndicators(chart, pair, { allowClear: sawIndicatorsThisSession });
    chart = null;
  };
}
