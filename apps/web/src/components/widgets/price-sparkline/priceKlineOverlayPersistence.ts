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
  getProgressInstanceInfo: () => { instance: OverlayInstance; paneId: string } | null;
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

/** Инструменты, которым достаточно одной точки (totalStep === 2 в klinecharts). */
const SINGLE_POINT_OVERLAY_NAMES = new Set([
  "horizontalStraightLine",
  "verticalStraightLine",
  "priceLine",
]);

function minPointsForOverlayName(name: string): number {
  return SINGLE_POINT_OVERLAY_NAMES.has(name) ? 1 : 2;
}

function isCompleteOverlay(overlay: OverlayInstance): boolean {
  if (overlay.currentStep !== undefined && overlay.currentStep !== OVERLAY_DRAW_STEP_FINISHED) {
    return false;
  }
  if (!overlay.points?.length) return false;
  const valued = overlay.points.filter((point) => Number.isFinite(point.value));
  if (valued.length < minPointsForOverlayName(overlay.name)) return false;
  return true;
}

/**
 * Сбрасывает только реально незавершённую отрисовку (мало точек).
 * Готовые фигуры с достаточным числом точек не трогаем — иначе отрезок «пропадает».
 */
export function cancelInProgressKlineOverlay(chart: Chart): void {
  const store = getOverlayStore(chart);
  const progress = store?.getProgressInstanceInfo?.() ?? null;
  const instance = progress?.instance;
  if (!instance?.id) return;

  const pointCount = instance.points?.filter((point) => Number.isFinite(point.value)).length ?? 0;
  if (pointCount >= minPointsForOverlayName(instance.name)) {
    const forceComplete = (instance as OverlayInstance & { forceComplete?: () => void }).forceComplete;
    if (typeof forceComplete === "function") {
      forceComplete.call(instance);
      store?.progressInstanceComplete?.();
      return;
    }
  }

  chart.removeOverlay({ id: instance.id });
}

/** Resolve overlay point for persist — keeps points in the empty right area. */
function canonicalizeOverlayPoint(
  chart: Chart,
  point: Partial<Point> | KlineStoredOverlayPoint,
): KlineStoredOverlayPoint | null {
  const valueRaw = typeof point.value === "number" ? point.value : Number(point.value);
  if (!Number.isFinite(valueRaw)) return null;
  const value = valueRaw;
  const dataList = chart.getDataList();
  const lastIndex = dataList.length - 1;

  const beyondEndRaw = (point as KlineStoredOverlayPoint).beyondEnd;
  if (typeof beyondEndRaw === "number" && Number.isFinite(beyondEndRaw) && beyondEndRaw > 0) {
    return { value, beyondEnd: beyondEndRaw };
  }

  let dataIndex: number | undefined;
  const indexRaw =
    typeof point.dataIndex === "number" ? point.dataIndex : Number(point.dataIndex);
  if (Number.isFinite(indexRaw)) {
    dataIndex = indexRaw;
  }

  let timestamp: number | undefined;
  const tsRaw = point.timestamp as unknown;
  if (typeof tsRaw === "number" && Number.isFinite(tsRaw)) {
    timestamp = tsRaw;
  } else if (typeof tsRaw === "string" && tsRaw.trim() !== "") {
    const parsed = Number(tsRaw);
    if (Number.isFinite(parsed)) timestamp = parsed;
  }

  // Точка справа от последнего бара: timestamp нет, dataIndex > lastIndex.
  // Нельзя clamp'ить к последнему бару — иначе отрезок «съезжает».
  if (dataList.length > 0 && dataIndex != null && dataIndex > lastIndex) {
    return { value, beyondEnd: dataIndex - lastIndex };
  }

  if (timestamp == null && dataIndex != null && dataList.length > 0) {
    if (dataIndex >= 0 && dataIndex <= lastIndex) {
      const bar = dataList[Math.round(dataIndex)];
      if (bar && Number.isFinite(bar.timestamp)) {
        timestamp = bar.timestamp;
      }
    }
  }

  if (timestamp != null) {
    return { timestamp, value };
  }

  // Уже сохранённый beyondEnd / dataIndex без value-path выше
  if (dataIndex != null && Number.isFinite(dataIndex)) {
    return { value, dataIndex };
  }

  return null;
}

function canonicalizeOverlayPoints(
  chart: Chart,
  points: Array<Partial<Point> | KlineStoredOverlayPoint>,
): KlineStoredOverlayPoint[] {
  const result: KlineStoredOverlayPoint[] = [];
  for (const point of points) {
    const canonical = canonicalizeOverlayPoint(chart, point);
    if (canonical) result.push(canonical);
  }
  return result;
}

type RestoreOverlayPoint = {
  value: number;
  timestamp?: number;
  dataIndex?: number;
};

function prepareOverlayPointsForRestore(
  chart: Chart,
  points: KlineStoredOverlayPoint[],
): RestoreOverlayPoint[] | null {
  const dataList = chart.getDataList();
  const lastIndex = dataList.length - 1;
  const prepared: RestoreOverlayPoint[] = [];

  for (const point of points) {
    const value = point.value;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    const beyondEnd =
      typeof point.beyondEnd === "number" && Number.isFinite(point.beyondEnd)
        ? point.beyondEnd
        : undefined;

    if (beyondEnd != null && beyondEnd > 0 && lastIndex >= 0) {
      // Только dataIndex — если передать timestamp, klinecharts притянет к последнему бару.
      prepared.push({ value, dataIndex: lastIndex + beyondEnd });
      continue;
    }

    if (typeof point.timestamp === "number" && Number.isFinite(point.timestamp)) {
      prepared.push({ value, timestamp: point.timestamp });
      continue;
    }

    if (typeof point.dataIndex === "number" && Number.isFinite(point.dataIndex)) {
      prepared.push({ value, dataIndex: point.dataIndex });
      continue;
    }
  }

  return prepared.length > 0 ? prepared : null;
}

/** Отсекает линии с чужой шкалы цен (например BTC 74k на PEPE). */
export function overlayFitsSymbolPriceScale(
  points: Array<Pick<KlineStoredOverlayPoint, "value">>,
  closes: number[],
): boolean {
  if (closes.length === 0) return true;

  let histMin = Infinity;
  let histMax = -Infinity;
  for (const close of closes) {
    if (!Number.isFinite(close)) continue;
    if (close < histMin) histMin = close;
    if (close > histMax) histMax = close;
  }
  if (!Number.isFinite(histMin) || !Number.isFinite(histMax) || histMin <= 0) {
    return true;
  }

  const lo = histMin / 100;
  const hi = histMax * 100;

  for (const point of points) {
    const value = point.value;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < lo || value > hi) return false;
  }
  return true;
}

function filterOverlaysForChart(chart: Chart, stored: StoredKlineOverlay[]): StoredKlineOverlay[] {
  const closes = chart
    .getDataList()
    .map((bar) => bar.close)
    .filter((close): close is number => typeof close === "number" && Number.isFinite(close));

  if (closes.length === 0) return stored;

  return stored.filter((overlay) => overlayFitsSymbolPriceScale(overlay.points, closes));
}

function serializeOverlay(chart: Chart, overlay: OverlayInstance): StoredKlineOverlay | null {
  const points = canonicalizeOverlayPoints(chart, overlay.points);

  if (points.length < minPointsForOverlayName(overlay.name)) return null;

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
  // Без аргументов klinecharts удаляет все инстансы и progress-drawing.
  chart.removeOverlay();
}

export function persistKlineOverlays(
  _chart: Chart | null,
  _pair: string,
  _options?: { allowClear?: boolean },
): void {
  // Persistence is handled per authenticated user via API.
}

export function restoreKlineOverlaysFromStored(chart: Chart, stored: StoredKlineOverlay[]): boolean {
  if (stored.length === 0) {
    cancelInProgressKlineOverlay(chart);
    return true;
  }

  const existingIds = new Set(listOverlays(chart).map((overlay) => overlay.id));
  let restoredCount = 0;
  let deferred = false;
  const store = getOverlayStore(chart);

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

    // Неполный набор точек → createOverlay оставит progress-drawing (конец на курсоре).
    if (points.length < minPointsForOverlayName(overlay.name)) {
      restoredCount += 1;
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

    // Если фигура всё ещё в progress — дожимаем, а не удаляем (иначе отрезок пропадает).
    const progress = store?.getProgressInstanceInfo?.() ?? null;
    if (progress?.instance?.id === overlay.id) {
      const forceComplete = (
        progress.instance as OverlayInstance & { forceComplete?: () => void }
      ).forceComplete;
      if (typeof forceComplete === "function") {
        forceComplete.call(progress.instance);
        store?.progressInstanceComplete?.();
      } else {
        chart.removeOverlay({ id: overlay.id });
        restoredCount += 1;
        continue;
      }
    }

    existingIds.add(overlay.id);
    restoredCount += 1;
  }

  cancelInProgressKlineOverlay(chart);

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
  let readyToPersist = false;
  let saveTimer: number | null = null;
  let pollTimer: number | null = null;
  let restoreTimer: number | null = null;
  let unhookStore: (() => void) | null = null;
  let detachDrawModeSync: (() => void) | null = null;
  let detachCtrlMagnetShortcut: (() => void) | null = null;
  let lastSnapshot = "";

  const scheduleSave = (allowClear = false) => {
    if (!readyToPersist) return;
    if (saveTimer != null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!readyToPersist || !chart || !isChartReady(chart)) return;
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

  const markRestored = (overlays: StoredKlineOverlay[]) => {
    restored = true;
    pendingStored = null;
    readyToPersist = true;
    if (chart) {
      cancelInProgressKlineOverlay(chart);
      syncGlobalOverlayDrawMode(chart);
      if (isKlineOverlaysLocked()) {
        syncKlineOverlaysLock(chart);
      }
    }
    if (overlays.length > 0) {
      sawOverlaysThisSession = true;
    }
    lastSnapshot = JSON.stringify(overlays);
  };

  const applyPendingRestore = () => {
    if (disposed || restored || !chart || !isChartReady(chart) || pendingStored == null) return;

    const scaleFiltered = filterOverlaysForChart(chart, pendingStored);
    const filtered = scaleFiltered.filter(
      (overlay) => overlay.points.length >= minPointsForOverlayName(overlay.name),
    );
    const droppedJunk = filtered.length !== pendingStored.length;
    const ok = restoreKlineOverlaysFromStored(chart, filtered);
    if (!ok) return;

    markRestored(filtered);
    // Убрать из API чужие/битые фигуры, из‑за которых конец «липнет» к мыши.
    if (droppedJunk) {
      storage.save(filtered, { immediate: true });
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
        markRestored([]);
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
    if (chart && isChartReady(chart) && readyToPersist) {
      const overlays = collectKlineOverlays(chart);
      if (overlays.length > 0 || sawOverlaysThisSession) {
        void storage.flush(overlays);
      }
    }
    storage.dispose();
    chart = null;
  };
}
