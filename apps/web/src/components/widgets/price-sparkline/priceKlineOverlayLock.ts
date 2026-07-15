import type { Chart } from "klinecharts";

const EMPTY_HOVER_INFO = {
  paneId: "",
  instance: null,
  figureType: 0,
  figureKey: "",
  figureIndex: -1,
  attrsIndex: -1,
};

const EMPTY_CLICK_INFO = {
  paneId: "",
  instance: null,
  figureType: 0,
  figureKey: "",
  figureIndex: -1,
};

let overlaysLocked = false;

type OverlayInstanceInternal = {
  id: string;
};

type OverlayStoreInternal = {
  getInstances: (paneId?: string) => OverlayInstanceInternal[];
  setHoverInstanceInfo: (info: unknown, event?: unknown) => void;
  setClickInstanceInfo: (info: unknown, event?: unknown) => void;
};

type ChartInternal = Chart & {
  _chartStore?: {
    getOverlayStore: () => OverlayStoreInternal;
  };
};

function getOverlayStore(chart: Chart): OverlayStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getOverlayStore?.() ?? null;
}

function findLockItem(scope: HTMLElement): HTMLElement | null {
  const bar = scope.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
  if (!bar) return null;

  const splitIndex = [...bar.children].findIndex(
    (node) => node instanceof HTMLElement && node.classList.contains("split-line"),
  );
  if (splitIndex < 0) return null;

  const afterFirstSplit = [...bar.children].slice(splitIndex + 1);
  const secondSplit = afterFirstSplit.findIndex(
    (node) => node instanceof HTMLElement && node.classList.contains("split-line"),
  );
  const controlItems = (
    secondSplit < 0 ? afterFirstSplit : afterFirstSplit.slice(0, secondSplit)
  ).filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("item"));

  return controlItems[1] ?? null;
}

export function isKlineOverlaysLocked(): boolean {
  return overlaysLocked;
}

export function setKlineOverlaysLocked(locked: boolean): void {
  overlaysLocked = locked;
}

export function updateKlineOverlayLockButtonUi(scope: HTMLElement, locked: boolean): void {
  const bar = scope.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
  const lockItem = findLockItem(scope);
  bar?.classList.toggle("price-kline-lock-active", locked);
  lockItem?.classList.toggle("price-kline-lock-active", locked);
  lockItem?.setAttribute("aria-pressed", locked ? "true" : "false");
  lockItem?.setAttribute(
    "title",
    locked ? "Разблокировать фигуры" : "Заблокировать фигуры",
  );
  lockItem?.setAttribute(
    "aria-label",
    locked ? "Разблокировать фигуры" : "Заблокировать фигуры",
  );
}

export function clearOverlayInteractionState(chart: Chart): void {
  const store = getOverlayStore(chart);
  if (!store) return;
  store.setHoverInstanceInfo({ ...EMPTY_HOVER_INFO });
  store.setClickInstanceInfo({ ...EMPTY_CLICK_INFO });
}

export function syncKlineOverlaysLock(chart: Chart): void {
  const store = getOverlayStore(chart);
  if (!store) return;

  for (const instance of store.getInstances()) {
    chart.overrideOverlay({ id: instance.id, lock: overlaysLocked });
  }

  if (overlaysLocked) {
    clearOverlayInteractionState(chart);
  }
}

export function shouldBlockOverlayInteraction(info: { instance?: unknown } | null | undefined): boolean {
  return overlaysLocked && Boolean(info?.instance);
}

export function toBlockedHoverInfo(info: { paneId?: string } | null | undefined): typeof EMPTY_HOVER_INFO {
  return {
    ...EMPTY_HOVER_INFO,
    paneId: typeof info?.paneId === "string" ? info.paneId : "",
  };
}

export function toBlockedClickInfo(info: { paneId?: string } | null | undefined): typeof EMPTY_CLICK_INFO {
  return {
    ...EMPTY_CLICK_INFO,
    paneId: typeof info?.paneId === "string" ? info.paneId : "",
  };
}
