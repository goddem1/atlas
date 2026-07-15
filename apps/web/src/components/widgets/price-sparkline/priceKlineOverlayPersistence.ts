import {
  ActionType,
  init,
  type Chart,
  type OverlayMode,
  type OverlayStyle,
  type Point,
} from "klinecharts";
import type { KlineStoredOverlay } from "@atlas-v1/shared";
import { normalizeKlineOverlayLabelData, normalizeKlineOverlays } from "@atlas-v1/shared";
import {
  attachKlineCtrlMagnetShortcut,
  attachKlineOverlayDrawModeSync,
  attachOverlayStoreDrawModeSync,
  getKlineOverlayDrawMode,
  getKlineOverlayDrawModeForNewOverlay,
  syncGlobalOverlayDrawMode,
} from "./priceKlineOverlayDrawMode";
import { createKlineOverlaysPairStore } from "./priceKlineOverlaysPairStore";
import { isKlineOverlaysLocked, syncKlineOverlaysLock } from "./priceKlineOverlayLock";

const OVERLAY_DRAW_STEP_FINISHED = -1;
const CANDLE_PANE_ID = "candle_pane";

export type StoredKlineOverlay = KlineStoredOverlay & {
  mode: OverlayMode;
};

type OverlayInstance = {
  id: string;
  groupId: string;
  name: string;
  paneId: string;
  lock: boolean;
  visible: boolean;
  mode: OverlayMode;
  points: Array<Partial<Point>>;
  currentStep?: number;
  styles?: OverlayStyle | null;
  extendData?: unknown;
};

type OverlayStoreInternal = {
  addInstances: (...args: unknown[]) => unknown;
  progressInstanceComplete: () => void;
  removeInstance: (...args: unknown[]) => unknown;
  override: (...args: unknown[]) => unknown;
  getInstances: (paneId?: string) => OverlayInstance[];
};

type ChartInternal = Chart & {
  _chartStore?: {
    getOverlayStore: () => OverlayStoreInternal;
  };
};

function normalizeStoredOverlays(overlays: KlineStoredOverlay[]): StoredKlineOverlay[] {
  return normalizeKlineOverlays(overlays) as StoredKlineOverlay[];
}

function getOverlayStore(chart: Chart): OverlayStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getOverlayStore?.() ?? null;
}

function isChartReady(chart: Chart): boolean {
  return chart.getDataList().length > 0;
}

function isCompleteOverlay(overlay: OverlayInstance): boolean {
  if (overlay.currentStep !== undefined && overlay.currentStep !== OVERLAY_DRAW_STEP_FINISHED) {
    return false;
  }
  if (!overlay.points?.length) return false;
  return overlay.points.some((point) => Number.isFinite(point.value));
}

function serializeOverlay(overlay: OverlayInstance): StoredKlineOverlay {
  const stored: StoredKlineOverlay = {
    id: overlay.id,
    groupId: overlay.groupId,
    name: overlay.name,
    paneId: overlay.paneId || CANDLE_PANE_ID,
    lock: overlay.lock,
    visible: overlay.visible,
    mode: getKlineOverlayDrawMode(),
    points: overlay.points
      .filter((point) => Number.isFinite(point.value))
      .map((point) => ({
        timestamp: point.timestamp,
        value: point.value,
        dataIndex: point.dataIndex,
      })),
  };
  if (overlay.styles) {
    stored.styles = JSON.parse(JSON.stringify(overlay.styles)) as Partial<OverlayStyle>;
  }
  const label = normalizeKlineOverlayLabelData(overlay.extendData);
  if (label) stored.extendData = label;
  return stored;
}

function listOverlays(chart: Chart): OverlayInstance[] {
  const store = getOverlayStore(chart);
  if (!store) return [];
  return store.getInstances();
}

export function resolveKlineChartFromProContainer(container: HTMLElement): Chart | null {
  const widget = container.querySelector<HTMLElement>(".klinecharts-pro-widget");
  if (!widget) return null;

  const chartId = widget.getAttribute("k-line-chart-id");
  if (!chartId) return null;

  if (widget.id !== chartId) {
    widget.id = chartId;
  }

  return init(widget);
}

export function loadStoredKlineOverlays(_pair: string): StoredKlineOverlay[] {
  return [];
}

export function saveStoredKlineOverlays(_pair: string, _overlays: StoredKlineOverlay[]): void {
  // Persistence is handled per authenticated user via API.
}

export function collectKlineOverlays(chart: Chart | null): StoredKlineOverlay[] {
  if (!chart || !isChartReady(chart)) return [];
  return listOverlays(chart).filter(isCompleteOverlay).map(serializeOverlay);
}

export function clearAllKlineOverlays(chart: Chart): void {
  for (const overlay of listOverlays(chart)) {
    chart.removeOverlay({ id: overlay.id });
  }
}

export function persistKlineOverlays(
  _chart: Chart | null,
  _pair: string,
  _options?: { allowClear?: boolean },
): void {
  // Persistence is handled per authenticated user via API.
}

export function restoreKlineOverlaysFromStored(chart: Chart, stored: StoredKlineOverlay[]): void {
  if (stored.length === 0) return;

  const existingIds = new Set(listOverlays(chart).map((overlay) => overlay.id));

  for (const overlay of stored) {
    if (existingIds.has(overlay.id)) continue;
    chart.createOverlay(
      {
        id: overlay.id,
        groupId: overlay.groupId,
        name: overlay.name,
        lock: overlay.lock,
        visible: overlay.visible,
        mode: getKlineOverlayDrawModeForNewOverlay(),
        points: overlay.points,
        ...(overlay.styles ? { styles: overlay.styles as Partial<OverlayStyle> } : {}),
        ...(overlay.extendData ? { extendData: overlay.extendData } : {}),
      },
      overlay.paneId || CANDLE_PANE_ID,
    );
  }
}

export function restoreKlineOverlays(chart: Chart, pair: string): void {
  void pair;
  restoreKlineOverlaysFromStored(chart, []);
}

function hookOverlayStore(chart: Chart, container: HTMLElement, onChange: () => void): () => void {
  const store = getOverlayStore(chart);
  if (!store) return () => undefined;

  const original = {
    addInstances: store.addInstances.bind(store),
    progressInstanceComplete: store.progressInstanceComplete.bind(store),
    removeInstance: store.removeInstance.bind(store),
    override: store.override.bind(store),
  };

  store.addInstances = (...args: unknown[]) => {
    const overlays = args[0];
    if (Array.isArray(overlays)) {
      args[0] = overlays.map((overlay) =>
        typeof overlay === "object" && overlay != null
          ? {
              ...overlay,
              mode: getKlineOverlayDrawModeForNewOverlay(),
            }
          : overlay,
      );
    }
    const result = original.addInstances(...args);
    onChange();
    return result;
  };
  store.progressInstanceComplete = () => {
    original.progressInstanceComplete();
    onChange();
  };
  store.removeInstance = (...args: unknown[]) => {
    const result = original.removeInstance(...args);
    onChange();
    return result;
  };
  const overrideWithDrawMode = attachOverlayStoreDrawModeSync(chart, original.override, container);

  store.override = (...args: unknown[]) => {
    const result = overrideWithDrawMode(...args);
    onChange();
    return result;
  };

  return () => {
    store.addInstances = original.addInstances;
    store.progressInstanceComplete = original.progressInstanceComplete;
    store.removeInstance = original.removeInstance;
    store.override = original.override;
  };
}

export function attachKlineOverlayPersistence(params: {
  container: HTMLElement;
  pair: string;
  isLoggedIn: boolean;
}): () => void {
  const { container, pair, isLoggedIn } = params;
  const storage = createKlineOverlaysPairStore({
    isLoggedIn,
    pair,
    normalize: normalizeStoredOverlays,
  });
  let disposed = false;
  let chart: Chart | null = null;
  let restored = false;
  let restoreStarted = false;
  let sawOverlaysThisSession = false;
  let saveTimer: number | null = null;
  let pollTimer: number | null = null;
  let restoreTimer: number | null = null;
  let unhookStore: (() => void) | null = null;
  let detachDrawModeSync: (() => void) | null = null;
  let detachCtrlMagnetShortcut: (() => void) | null = null;
  let lastSnapshot = "";

  const scheduleSave = (allowClear = false) => {
    if (saveTimer != null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!chart || !isChartReady(chart)) return;
      const overlays = collectKlineOverlays(chart);
      if (overlays.length > 0) {
        sawOverlaysThisSession = true;
      }
      if (overlays.length === 0 && !allowClear && !sawOverlaysThisSession) {
        return;
      }
      const next = JSON.stringify(overlays);
      if (next === lastSnapshot) return;
      lastSnapshot = next;
      storage.save(overlays);
    }, 250);
  };

  const tryRestore = () => {
    if (disposed || restored || restoreStarted || !chart || !isChartReady(chart)) return;
    restoreStarted = true;
    void storage.load().then((stored) => {
      if (disposed || restored || !chart || !isChartReady(chart)) return;
      restored = true;
      restoreKlineOverlaysFromStored(chart, normalizeStoredOverlays(stored));
      syncGlobalOverlayDrawMode(chart);
      if (isKlineOverlaysLocked()) {
        syncKlineOverlaysLock(chart);
      }
      const overlays = collectKlineOverlays(chart);
      if (overlays.length > 0) {
        sawOverlaysThisSession = true;
        lastSnapshot = JSON.stringify(overlays);
      }
    });
  };

  let detachChartListeners: (() => void) | null = null;
  let rafId = 0;

  const attachToChart = (resolved: Chart) => {
    chart = resolved;
    detachDrawModeSync = attachKlineOverlayDrawModeSync(resolved, container);
    detachCtrlMagnetShortcut = attachKlineCtrlMagnetShortcut(resolved, container);

    const onDataReady = () => {
      tryRestore();
      scheduleSave();
    };

    chart.subscribeAction(ActionType.OnDataReady, onDataReady);
    unhookStore = hookOverlayStore(chart, container, () => scheduleSave());

    restoreTimer = window.setTimeout(tryRestore, 0);
    window.setTimeout(tryRestore, 400);
    window.setTimeout(tryRestore, 1200);

    pollTimer = window.setInterval(() => scheduleSave(), 800);

    const onPointerUp = () => scheduleSave();
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("mouseup", onPointerUp);

    detachChartListeners = () => {
      chart?.unsubscribeAction(ActionType.OnDataReady, onDataReady);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("mouseup", onPointerUp);
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
    detachDrawModeSync?.();
    detachCtrlMagnetShortcut?.();
    if (chart && isChartReady(chart)) {
      const overlays = collectKlineOverlays(chart);
      if (overlays.length > 0 || sawOverlaysThisSession) {
        void storage.flush(overlays);
      }
    }
    storage.dispose();
    chart = null;
  };
}
