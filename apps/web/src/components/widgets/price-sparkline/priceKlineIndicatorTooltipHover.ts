import {
  ActionType,
  DomPosition,
  type Chart,
  type IndicatorCreateTooltipDataSourceCallback,
  type TooltipIconStyle,
} from "klinecharts";

const CANDLE_PANE_ID = "candle_pane";
const X_AXIS_PANE_ID = "x_axis_pane";
const UPDATE_LEVEL_OVERLAY = 1;
/** Небольшой запас по вертикали вокруг строки. */
const ROW_HIT_PADDING = 3;
/** Несколько пикселей по бокам от текста легенды. */
const SIDE_HIT_PADDING = 2;
/** Удержание hover при переходе на иконки (они появляются после имени). */
const HOVER_STICKY_MS = 220;

export type IndicatorHoverKey = `${string}:${string}`;

type IndicatorFigure = {
  key: string;
  title?: string;
};

type IndicatorInstance = {
  name: string;
  shortName?: string;
  calcParams?: Array<string | number>;
  visible?: boolean;
  precision?: number;
  figures?: IndicatorFigure[];
  result?: Array<Record<string, unknown>>;
};

type IndicatorStoreInternal = {
  addInstance: (...args: unknown[]) => Promise<unknown>;
  override: (...args: unknown[]) => Promise<unknown>;
  getInstances: (paneId: string) => IndicatorInstance[];
};

type ChartInternal = Chart & {
  _drawPanes?: Array<{ getId: () => string }>;
  _chartStore?: {
    getIndicatorStore: () => IndicatorStoreInternal;
    getTooltipStore?: () => {
      getCrosshair: () => { dataIndex?: number } | null;
    };
  };
  updatePane?: (level: number, paneId?: string) => void;
};

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

function measureTextWidth(font: string, text: string): number {
  const ctx = getMeasureContext();
  if (!ctx || !text) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const hoverStateByChart = new WeakMap<Chart, IndicatorHoverKey | null>();
const stickyHoverByChart = new WeakMap<Chart, { key: IndicatorHoverKey; until: number }>();

function getIndicatorStore(chart: Chart): IndicatorStoreInternal | null {
  return (chart as ChartInternal)._chartStore?.getIndicatorStore?.() ?? null;
}

function getOrderedSubPaneIds(chart: Chart): string[] {
  const panes = (chart as ChartInternal)._drawPanes ?? [];
  return panes
    .map((pane) => pane.getId())
    .filter((paneId) => paneId !== CANDLE_PANE_ID && paneId !== X_AXIS_PANE_ID);
}

function indicatorKey(paneId: string, name: string): IndicatorHoverKey {
  return `${paneId}:${name}`;
}

function getTextRowHeight(text: {
  marginTop: number;
  marginBottom: number;
  size: number;
}): number {
  return text.marginTop + text.size + text.marginBottom;
}

function getIndicatorTooltipOffsetLeft(chart: Chart): number {
  return chart.getStyles().indicator.tooltip.offsetLeft ?? 4;
}

function getIndicatorTooltipRowHeight(chart: Chart): number {
  const text = chart.getStyles().indicator.tooltip.text;
  const icons = chart.getStyles().indicator.tooltip.icons;
  const textH = getTextRowHeight(text);
  let iconH = 0;
  for (const icon of icons) {
    iconH = Math.max(
      iconH,
      (icon.marginTop ?? 0) +
        (icon.paddingTop ?? 0) +
        icon.size +
        (icon.paddingBottom ?? 0) +
        (icon.marginBottom ?? 0),
    );
  }
  return Math.max(textH, iconH, 20);
}

function formatIndicatorTooltipFont(text: {
  size: number;
  family?: string;
  weight?: string | number;
}): string {
  const weight = text.weight ?? "normal";
  const family = text.family ?? "Helvetica Neue";
  return `${weight} ${text.size}px ${family}`;
}

function getCrosshairDataIndex(chart: Chart): number {
  const crosshair = (chart as ChartInternal)._chartStore?.getTooltipStore?.()?.getCrosshair?.();
  const index = crosshair?.dataIndex;
  if (typeof index === "number" && Number.isFinite(index) && index >= 0) return index;
  const len = chart.getDataList().length;
  return Math.max(0, len - 1);
}

function measureIndicatorIconsWidth(icons: TooltipIconStyle[]): number {
  let width = 0;
  for (const icon of icons) {
    const font = `${icon.size}px ${icon.fontFamily ?? "icomoon"}`;
    width +=
      (icon.marginLeft ?? 0) +
      (icon.paddingLeft ?? 0) +
      measureTextWidth(font, icon.icon) +
      (icon.paddingRight ?? 0) +
      (icon.marginRight ?? 0);
  }
  return width;
}

/** Ширина содержимого строки легенды (имя/параметры/значения [+ иконки]). */
function measureIndicatorLegendWidth(
  chart: Chart,
  indicator: IndicatorInstance,
  includeIcons: boolean,
): number {
  const tooltip = chart.getStyles().indicator.tooltip;
  const text = tooltip.text;
  const font = formatIndicatorTooltipFont(text);
  let width = 0;

  let nameText = tooltip.showName === false ? "" : (indicator.shortName ?? indicator.name);
  if (tooltip.showParams !== false && indicator.calcParams && indicator.calcParams.length > 0) {
    nameText = `${nameText}(${indicator.calcParams.join(",")})`;
  }
  if (nameText) {
    width += text.marginLeft + measureTextWidth(font, nameText) + text.marginRight;
  }

  if (includeIcons) {
    const source =
      tooltip.icons.length >= 4
        ? tooltip.icons
        : chart.getStyles().indicator.tooltip.icons;
    const visible = indicator.visible !== false;
    width += measureIndicatorIconsWidth(pickIndicatorTooltipIcons(visible, source));
  }

  if (indicator.visible !== false) {
    const dataIndex = getCrosshairDataIndex(chart);
    const point = indicator.result?.[dataIndex] ?? {};
    for (const figure of indicator.figures ?? []) {
      if (typeof figure.title !== "string" || figure.title.length === 0) continue;
      const raw = point[figure.key];
      let valueText =
        typeof raw === "number"
          ? raw.toLocaleString("en-US", {
              maximumFractionDigits: indicator.precision ?? 2,
              minimumFractionDigits: 0,
            })
          : typeof raw === "string"
            ? raw
            : (tooltip.defaultValue ?? "n/a");
      const legendText = `${figure.title}${valueText}`;
      width += text.marginLeft + measureTextWidth(font, legendText) + text.marginRight;
    }
  }

  return width;
}

/**
 * На candle_pane легенды индикаторов рисуются сразу под OHLC-тултипом.
 * Без этого оффсета hit-test целится слишком высоко и «промахивается» по SAR/MA.
 */
function estimateCandleTooltipHeight(chart: Chart, paneWidth: number): number {
  const candleTooltip = chart.getStyles().candle.tooltip;
  const offsetTop = candleTooltip.offsetTop ?? 6;
  const offsetLeft = candleTooltip.offsetLeft ?? 4;
  const offsetRight = candleTooltip.offsetRight ?? 4;
  const text = candleTooltip.text;
  const custom = candleTooltip.custom;
  const rowH = getTextRowHeight(text);

  // callback: TV-like одна строка ОТКР/МАКС/МИН/ЗАКР/+%
  if (typeof custom === "function") {
    return offsetTop + rowH;
  }

  const legends = custom ?? [];
  if (legends.length === 0) return offsetTop;

  const maxWidth = Math.max(80, paneWidth - offsetRight);
  // Грубая оценка ширины подписи: библиотека меряет canvas, нам достаточно approx.
  const avgCharPx = Math.max(6, text.size * 0.62);
  let x = offsetLeft;
  let rows = 1;

  for (const legend of legends) {
    const title =
      typeof legend === "object" && legend !== null && "title" in legend
        ? typeof (legend as { title?: unknown }).title === "string"
          ? String((legend as { title: string }).title)
          : typeof (legend as { title?: { text?: string } }).title === "object"
            ? String((legend as { title?: { text?: string } }).title?.text ?? "")
            : ""
        : "";
    // {time}/{open}/… ≈ 10–14 символов на значении
    const approx = (title.length || 6) + 12;
    const w = text.marginLeft + approx * avgCharPx + text.marginRight;
    if (x + w > maxWidth && x > offsetLeft) {
      rows += 1;
      x = offsetLeft + w;
    } else {
      x += w;
    }
  }

  return offsetTop + rows * rowH;
}

function getIndicatorBandTop(chart: Chart, paneId: string, paneWidth: number): number {
  if (paneId === CANDLE_PANE_ID) {
    return estimateCandleTooltipHeight(chart, paneWidth);
  }
  return chart.getStyles().indicator.tooltip.offsetTop ?? 6;
}

export function getIndicatorHoverKey(chart: Chart): IndicatorHoverKey | null {
  return hoverStateByChart.get(chart) ?? null;
}

function requestIndicatorTooltipRedraw(chart: Chart): void {
  const chartInternal = chart as ChartInternal;
  if (chartInternal.updatePane) {
    chartInternal.updatePane(UPDATE_LEVEL_OVERLAY);
    return;
  }
  chart.resize();
}

function setIndicatorHoverKey(chart: Chart, key: IndicatorHoverKey | null): void {
  if (getIndicatorHoverKey(chart) === key) {
    if (key) stickyHoverByChart.set(chart, { key, until: performance.now() + HOVER_STICKY_MS });
    return;
  }
  hoverStateByChart.set(chart, key);
  if (key) {
    stickyHoverByChart.set(chart, { key, until: performance.now() + HOVER_STICKY_MS });
  } else {
    stickyHoverByChart.delete(chart);
  }
  requestIndicatorTooltipRedraw(chart);
}

function pickIndicatorTooltipIcons(
  visible: boolean,
  icons: TooltipIconStyle[],
): TooltipIconStyle[] {
  if (icons.length < 4) return [];
  return visible
    ? [icons[1]!, icons[2]!, icons[3]!]
    : [icons[0]!, icons[2]!, icons[3]!];
}

export function createKlineIndicatorTooltipDataSource(
  chart: Chart,
  paneId: string,
): IndicatorCreateTooltipDataSourceCallback {
  return ({ indicator, defaultStyles }) => {
    const hovered = getIndicatorHoverKey(chart) === indicatorKey(paneId, indicator.name);
    if (!hovered) {
      return { icons: [] };
    }
    const icons =
      defaultStyles.tooltip.icons.length >= 4
        ? defaultStyles.tooltip.icons
        : chart.getStyles().indicator.tooltip.icons;
    return {
      icons: pickIndicatorTooltipIcons(indicator.visible, icons),
    };
  };
}

export function applyKlineIndicatorTooltipHover(chart: Chart): void {
  const store = getIndicatorStore(chart);
  if (!store) return;

  for (const indicator of store.getInstances(CANDLE_PANE_ID)) {
    chart.overrideIndicator(
      {
        name: indicator.name,
        createTooltipDataSource: createKlineIndicatorTooltipDataSource(chart, CANDLE_PANE_ID),
      },
      CANDLE_PANE_ID,
    );
  }

  for (const paneId of getOrderedSubPaneIds(chart)) {
    for (const indicator of store.getInstances(paneId)) {
      chart.overrideIndicator(
        {
          name: indicator.name,
          createTooltipDataSource: createKlineIndicatorTooltipDataSource(chart, paneId),
        },
        paneId,
      );
    }
  }
}

function resolveIndicatorHoverKey(
  chart: Chart,
  clientX: number,
  clientY: number,
): IndicatorHoverKey | null {
  const store = getIndicatorStore(chart);
  if (!store) return null;

  const rowHeight = getIndicatorTooltipRowHeight(chart);
  const offsetLeft = getIndicatorTooltipOffsetLeft(chart);
  const paneIds = [CANDLE_PANE_ID, ...getOrderedSubPaneIds(chart)];
  const activeHover = getIndicatorHoverKey(chart);

  for (const paneId of paneIds) {
    const paneDom = chart.getDom(paneId, DomPosition.Main);
    if (!paneDom) continue;

    const rect = paneDom.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    const indicators = store.getInstances(paneId);
    if (indicators.length === 0) continue;

    const bandTop = getIndicatorBandTop(chart, paneId, rect.width);
    const localY = clientY - rect.top;
    const bandBottom = bandTop + indicators.length * rowHeight + ROW_HIT_PADDING;
    if (localY < Math.max(0, bandTop - ROW_HIT_PADDING) || localY >= bandBottom) continue;

    const rowIndex = Math.min(
      indicators.length - 1,
      Math.max(0, Math.floor((localY - bandTop) / rowHeight)),
    );
    const indicator = indicators[rowIndex];
    if (!indicator) continue;

    const key = indicatorKey(paneId, indicator.name);
    const includeIcons = activeHover === key;
    const contentWidth = measureIndicatorLegendWidth(chart, indicator, includeIcons);
    if (contentWidth <= 0) continue;

    const localX = clientX - rect.left;
    const hitLeft = Math.max(0, offsetLeft - SIDE_HIT_PADDING);
    const hitRight = offsetLeft + contentWidth + SIDE_HIT_PADDING;
    if (localX < hitLeft || localX > hitRight) continue;

    return key;
  }

  return null;
}

function hookIndicatorStore(chart: Chart, onIndicatorsChanged: () => void): () => void {
  const store = getIndicatorStore(chart);
  if (!store) return () => undefined;

  const previousAddInstance = store.addInstance.bind(store);

  store.addInstance = async (...args: unknown[]) => {
    const result = await previousAddInstance(...args);
    onIndicatorsChanged();
    return result;
  };

  return () => {
    store.addInstance = previousAddInstance;
  };
}

export function attachKlineIndicatorTooltipHover(params: {
  container: HTMLElement;
  getChart: () => Chart | null;
}): () => void {
  const { container, getChart } = params;
  let disposed = false;
  let rafId = 0;
  let unhookStore: (() => void) | null = null;
  let detachDataReady: (() => void) | null = null;
  let chart: Chart | null = null;

  let syncing = false;
  const syncIndicators = () => {
    if (!chart || syncing) return;
    syncing = true;
    try {
      applyKlineIndicatorTooltipHover(chart);
      requestIndicatorTooltipRedraw(chart);
    } finally {
      syncing = false;
    }
  };

  const attachToChart = (resolved: Chart) => {
    chart = resolved;
    unhookStore = hookIndicatorStore(chart, syncIndicators);

    const onDataReady = () => {
      window.requestAnimationFrame(syncIndicators);
    };
    chart.subscribeAction(ActionType.OnDataReady, onDataReady);
    detachDataReady = () => {
      chart?.unsubscribeAction(ActionType.OnDataReady, onDataReady);
    };

    syncIndicators();
    window.setTimeout(syncIndicators, 400);
    window.setTimeout(syncIndicators, 1200);
  };

  const waitForChart = () => {
    if (disposed || chart) return;
    const resolved = getChart();
    if (resolved) {
      attachToChart(resolved);
      return;
    }
    rafId = window.requestAnimationFrame(waitForChart);
  };

  waitForChart();

  let moveRaf = 0;
  let lastEvent: PointerEvent | null = null;

  const flushPointerMove = () => {
    moveRaf = 0;
    if (!chart || !lastEvent) return;
    const next = resolveIndicatorHoverKey(chart, lastEvent.clientX, lastEvent.clientY);
    if (next) {
      setIndicatorHoverKey(chart, next);
      return;
    }
    // Короткая задержка, чтобы курсор успел дойти до появившихся иконок.
    const sticky = stickyHoverByChart.get(chart);
    if (sticky && performance.now() < sticky.until && getIndicatorHoverKey(chart) === sticky.key) {
      return;
    }
    setIndicatorHoverKey(chart, null);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!chart) return;
    lastEvent = event;
    if (moveRaf) return;
    moveRaf = window.requestAnimationFrame(flushPointerMove);
  };

  const onPointerLeave = () => {
    lastEvent = null;
    if (!chart) return;
    stickyHoverByChart.delete(chart);
    setIndicatorHoverKey(chart, null);
  };

  container.addEventListener("pointermove", onPointerMove, true);
  container.addEventListener("pointerleave", onPointerLeave, true);

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    if (moveRaf) window.cancelAnimationFrame(moveRaf);
    unhookStore?.();
    detachDataReady?.();
    if (chart) {
      hoverStateByChart.delete(chart);
      stickyHoverByChart.delete(chart);
    }
    container.removeEventListener("pointermove", onPointerMove, true);
    container.removeEventListener("pointerleave", onPointerLeave, true);
    chart = null;
  };
}
