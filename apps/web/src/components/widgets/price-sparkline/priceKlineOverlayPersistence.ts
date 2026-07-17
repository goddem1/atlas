import type { KlineStoredOverlay, KlineStoredOverlayPoint } from "@atlas-v1/shared";
import { normalizeKlineOverlayLabelData, normalizeKlineOverlays } from "@atlas-v1/shared";
import {
  ActionType,
  init,
  type Chart,
  type OverlayMode,
  type OverlayStyle,
  type Point,
} from "klinecharts";
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

/** Resolve overlay point to a stable timestamp+value pair for persist/restore. */
function canonicalizeOverlayPoint(
  chart: Chart,
  point: Partial<Point> | KlineStoredOverlayPoint,
): KlineStoredOverlayPoint | null {
  if (!Number.isFinite(point.value)) return null;
  const value = Number(point.value);
  const dataList = chart.getDataList();

  let timestamp =
    typeof point.timestamp === "number" && Number.isFinite(point.timestamp)
      ? point.timestamp
      : undefined;

  if (timestamp == null && typeof point.dataIndex === "number" && Number.isFinite(point.dataIndex)) {
    const bar = dataList[Math.round(point.dataIndex)];
    if (bar && Number.isFinite(bar.timestamp)) {
      timestamp = bar.timestamp;
    }
  }

  // No time anchor → cannot safely restore after reopen.
  if (timestamp == null) return null;

  return { timestamp, value };
}

function prepareOverlayPointsForRestore(
  chart: Chart,
  points: KlineStoredOverlayPoint[],
): Array<Pick<KlineStoredOverlayPoint, "timestamp" | "value">> | null {
  const prepared: Array<Pick<KlineStoredOverlayPoint, "timestamp" | "value">> = [];
  for (const point of points) {
    const canonical = canonicalizeOverlayPoint(chart, point);
    if (!canonical || canonical.timestamp == null) return null;
    // Pass only timestamp+value so klinecharts never prefers a stale dataIndex.
    prepared.push({ timestamp: canonical.timestamp, value: canonical.value });
  }
  return prepared.length > 0 ? prepared : null;
}

function serializeOverlay(chart: Chart, overlay: OverlayInstance): StoredKlineOverlay | null {
  const points = overlay.points
    .map((point) => canonicalizeOverlayPoint(chart, point))
    .filter((point): point is KlineStoredOverlayPoint => point != null);

  if (points.length === 0) return null;

  const stored: StoredKlineOverlay = {
    id: overlay.id,
    groupId: overlay.groupId,
    name: overlay.name,
    paneId: overlay.paneId || CANDLE_PANE_ID,
    lock: overlay.lock,
    visible: overlay.visible,
    mode: getKlineOverlayDrawMode(),
    points,
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
  return listOverlays(chart)
    .filter(isCompleteOverlay)
    .map((overlay) => serializeOverlay(chart, overlay))
    .filter((overlay): overlay is StoredKlineOverlay => overlay != null);
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

export function restoreKlineOverlaysFromStored(chart: Chart, stored: StoredKlineOverlay[]): boolean {
  if (stored.length === 0) return true;

  const existingIds = new Set(listOverlays(chart).map((overlay) => overlay.id));
  let restoredCount = 0;
  let deferred = false;

  for (const overlay of stored) {
    if (existingIds.has(overlay.id)) {
      restoredCount += 1;
      continue;
    }

    const points = prepareOverlayPointsForRestore(chart, overlay.points);
    if (!points) {
      deferred = true;
      continue;
    }

    chart.createOverlay(
      {
        id: overlay.id,
        groupId: overlay.groupId,
        name: overlay.name,
        lock: overlay.lock,
        visible: overlay.visible,
        mode: getKlineOverlayDrawModeForNewOverlay(),
        points,
        ...(overlay.styles ? { styles: overlay.styles as Partial<OverlayStyle> } : {}),
        ...(overlay.extendData ? { extendData: overlay.extendData } : {}),
      },
      overlay.paneId || CANDLE_PANE_ID,
    );
    restoredCount += 1;
  }

  // All overlays placed (or already present) — nothing left to wait for.
  return !deferred && restoredCount >= stored.length;
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
  let pendingStored: StoredKlineOverlay[] | null = null;
  let loadStarted = false;
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

  const applyPendingRestore = () => {
    if (disposed || restored || !chart || !isChartReady(chart) || pendingStored == null) return;
    const ok = restoreKlineOverlaysFromStored(chart, pendingStored);
    if (!ok) return;

    restored = true;
    pendingStored = null;
    syncGlobalOverlayDrawMode(chart);
    if (isKlineOverlaysLocked()) {
      syncKlineOverlaysLock(chart);
    }
    const overlays = collectKlineOverlays(chart);
    if (overlays.length > 0) {
      sawOverlaysThisSession = true;
      lastSnapshot = JSON.stringify(overlays);
    }
  };

  const tryRestore = () => {
    if (disposed || restored || !chart || !isChartReady(chart)) return;

    if (pendingStored != null) {
      applyPendingRestore();
      return;
    }

    if (loadStarted) return;
    loadStarted = true;
    void storage.load().then((stored) => {
      if (disposed || restored || !chart) return;
      pendingStored = normalizeStoredOverlays(stored);
      if (pendingStored.length === 0) {
        restored = true;
        pendingStored = null;
        return;
      }
      applyPendingRestore();
    });
  };

  let detachChartListeners: (() => void) | null = null;
  let rafId = 0;

  const attachToChart = (resolved: Chart) => {
    chart = resolved;
    // Каждая пара — своё поле: не оставляем линии от предыдущего символа.
    clearAllKlineOverlays(resolved);
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
    window.setTimeout(tryRestore, 3000);

    pollTimer = window.setInterval(() => {
      tryRestore();
      scheduleSave();
    }, 800);

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
