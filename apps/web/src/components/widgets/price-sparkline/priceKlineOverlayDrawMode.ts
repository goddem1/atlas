import { OverlayMode, type Chart } from "klinecharts";

/** Постоянный режим из тулбара. Normal = свободное редактирование. */
let currentMode: OverlayMode = OverlayMode.Normal;
/** Временный магнит, пока зажат Ctrl. Не меняет currentMode. */
let ctrlMagnetHeld = false;
let nativeOverrideOverlay: Chart["overrideOverlay"] | null = null;

type OverlayInstanceInternal = {
  id: string;
  setMode: (mode: OverlayMode) => boolean;
};

type OverlayStoreInternal = {
  getInstances: (paneId?: string) => OverlayInstanceInternal[];
  getProgressInstanceInfo: () => { instance: OverlayInstanceInternal } | null;
};

type ChartInternal = Chart & {
  _chartStore?: {
    getOverlayStore: () => OverlayStoreInternal;
  };
};

function getOverlayStore(chart: Chart): OverlayStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getOverlayStore?.() ?? null;
}

function isOverlayMode(mode: unknown): mode is OverlayMode {
  return (
    mode === OverlayMode.Normal ||
    mode === OverlayMode.WeakMagnet ||
    mode === OverlayMode.StrongMagnet
  );
}

export function isDrawingBarTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(".klinecharts-pro-drawing-bar") ||
      target.closest(".price-kline-drawing-pins-shell") ||
      target.closest(".price-kline-drawing-sidebar"),
  );
}

export function isKlineMagnetEnabled(): boolean {
  return ctrlMagnetHeld || currentMode !== OverlayMode.Normal;
}

function getAppliedOverlayDrawMode(): OverlayMode {
  if (ctrlMagnetHeld) return OverlayMode.StrongMagnet;
  return currentMode;
}

export function getKlineOverlayDrawMode(): OverlayMode {
  return currentMode;
}

export function setKlineOverlayDrawMode(mode: OverlayMode): void {
  if (!isOverlayMode(mode)) return;
  currentMode = mode;
}

function syncInstanceModes(chart: Chart, mode: OverlayMode): void {
  const store = getOverlayStore(chart);
  if (!store) return;

  for (const instance of store.getInstances()) {
    instance.setMode(mode);
  }

  const progress = store.getProgressInstanceInfo();
  progress?.instance.setMode(mode);
}

function applyGlobalMode(chart: Chart, mode: OverlayMode): void {
  const overrideFn = nativeOverrideOverlay ?? chart.overrideOverlay.bind(chart);
  overrideFn.call(chart, { mode });
  syncInstanceModes(chart, mode);
}

function findDrawingBar(scope?: HTMLElement | null, chart?: Chart): HTMLElement | null {
  return (
    scope?.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar") ??
    chart?.getDom()?.closest(".klinecharts-pro")?.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar") ??
    null
  );
}

function findMagnetItem(bar: HTMLElement | null): HTMLElement | null {
  if (!bar) return null;
  const splitIndex = [...bar.children].findIndex(
    (node) => node instanceof HTMLElement && node.classList.contains("split-line"),
  );
  if (splitIndex < 0) return null;
  const next = bar.children[splitIndex + 1];
  return next instanceof HTMLElement ? next : null;
}

function setMagnetButtonPressed(scope: HTMLElement | null | undefined, chart: Chart, pressed: boolean) {
  const bar = findDrawingBar(scope, chart);
  const magnetItem = findMagnetItem(bar);
  bar?.classList.toggle("price-kline-magnet-active", pressed);
  magnetItem?.classList.toggle("price-kline-magnet-active", pressed);
}

function updateMagnetButtonUi(scope: HTMLElement | null | undefined, chart: Chart) {
  setMagnetButtonPressed(scope, chart, isKlineMagnetEnabled());
}

export function syncGlobalOverlayDrawMode(chart: Chart, mode: OverlayMode = currentMode): void {
  if (!isOverlayMode(mode)) return;
  currentMode = mode;
  applyGlobalMode(chart, getAppliedOverlayDrawMode());
  updateMagnetButtonUi(undefined, chart);
}

export function attachKlineOverlayDrawModeSync(chart: Chart, scope?: HTMLElement | null): () => void {
  nativeOverrideOverlay = chart.overrideOverlay.bind(chart);
  syncInstanceModes(chart, currentMode);
  updateMagnetButtonUi(scope, chart);

  return () => {
    nativeOverrideOverlay = null;
    ctrlMagnetHeld = false;
    setMagnetButtonPressed(scope, chart, false);
  };
}

export function attachKlineCtrlMagnetShortcut(chart: Chart, scope?: HTMLElement | null): () => void {
  const enableCtrlMagnet = () => {
    if (ctrlMagnetHeld) return;
    ctrlMagnetHeld = true;
    syncInstanceModes(chart, OverlayMode.StrongMagnet);
    updateMagnetButtonUi(scope, chart);
  };

  const disableCtrlMagnet = () => {
    if (!ctrlMagnetHeld) return;
    ctrlMagnetHeld = false;
    syncInstanceModes(chart, currentMode);
    updateMagnetButtonUi(scope, chart);
  };

  const isCtrlKeyEvent = (event: KeyboardEvent) =>
    event.key === "Control" || event.code === "ControlLeft" || event.code === "ControlRight";

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isCtrlKeyEvent(event) || event.repeat) return;
    enableCtrlMagnet();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (isCtrlKeyEvent(event)) {
      disableCtrlMagnet();
      return;
    }
    if (!event.ctrlKey) {
      disableCtrlMagnet();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (ctrlMagnetHeld && !event.ctrlKey) {
      disableCtrlMagnet();
    }
  };

  const onWindowBlur = () => {
    if (!document.hasFocus()) {
      disableCtrlMagnet();
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) disableCtrlMagnet();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    disableCtrlMagnet();
  };
}

export function attachOverlayStoreDrawModeSync(
  chart: Chart,
  nativeStoreOverride: (...args: unknown[]) => unknown,
  scope?: HTMLElement | null,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const overlayArg = args[0];
    const overlay =
      typeof overlayArg === "object" && overlayArg != null
        ? (overlayArg as { mode?: OverlayMode; id?: string })
        : null;
    const isGlobalModeChange = overlay != null && isOverlayMode(overlay.mode) && !overlay.id;

    if (isGlobalModeChange && overlay.mode && !ctrlMagnetHeld) {
      setKlineOverlayDrawMode(overlay.mode);
    }

    const result = nativeStoreOverride(...args);

    if (isGlobalModeChange) {
      syncInstanceModes(chart, getAppliedOverlayDrawMode());
      updateMagnetButtonUi(scope, chart);
    }

    return result;
  };
}

/** Режим для новых рисунков: магнит вкл → snap, выкл → свободно. */
export function getKlineOverlayDrawModeForNewOverlay(): OverlayMode {
  return getAppliedOverlayDrawMode();
}
