import type {
  KlineOverlayLabelAlong,
  KlineOverlayLabelData,
  KlineOverlayLabelSide,
} from "@atlas-v1/shared";
import type { Chart, DeepPartial, OverlayStyle } from "klinecharts";
import { isDashboardDarkTheme } from "./candleKlineUtils";
import {
  getKlineOverlayLabelData,
  getKlineOverlayLabelText,
} from "./priceKlineHorizontalPriceTags";
import { resolveKlineChartFromProContainer } from "./priceKlineOverlayPersistence";
import {
  shouldBlockOverlayInteraction,
  toBlockedClickInfo,
  toBlockedHoverInfo,
} from "./priceKlineOverlayLock";

const OVERLAY_DRAW_STEP_FINISHED = -1;
const MENU_SUPPRESS_MS = 200;

/** Палитра в духе TradingView: градации серого + насыщенные цвета. */
const OVERLAY_COLOR_PRESETS = [
  "#FFFFFF",
  "#D1D4DC",
  "#B2B5BE",
  "#9598A1",
  "#787B86",
  "#5D606B",
  "#434651",
  "#2A2E39",
  "#1E222D",
  "#000000",
  "#F23645",
  "#FF5252",
  "#FF6D00",
  "#FF9800",
  "#FFAB00",
  "#FDD835",
  "#089981",
  "#26A69A",
  "#4CAF50",
  "#00BCD4",
  "#2196F3",
  "#2962FF",
  "#2979FF",
  "#651FFF",
  "#9C27B0",
  "#E040FB",
  "#E91E63",
  "#F06292",
  "#FF4081",
  "#AB47BC",
] as const;

const COLOR_LINE_ICON_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-overlay-toolbar-icon"><path fill="currentColor" d="M3 14.5h12M4.2 12.8 12.1 4.9c.5-.5 1.3-.5 1.8 0l.2.2c.5.5.5 1.3 0 1.8L6.2 14.8l-2.6.7.6-2.7Z"/></svg>`;
const TEXT_ICON_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-overlay-toolbar-icon"><path fill="currentColor" d="M3.2 4.2h11.6v2H10.6v7.6H7.4V6.2H3.2v-2Z"/></svg>`;
const DELETE_ICON_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-overlay-toolbar-icon"><path fill="currentColor" d="M6.8 3.2h4.4l.5 1.3H15v1.4H3V4.5h3.3l.5-1.3ZM4.6 7.1h8.8l-.7 8.2c-.1.8-.8 1.4-1.6 1.4H6.9c-.8 0-1.5-.6-1.6-1.4L4.6 7.1Zm2.2 1.5-.5 6h1l.5-6h-1Zm2.6 0-.5 6h1l.5-6h-1Z"/></svg>`;
const DRAG_HANDLE_SVG = `<svg viewBox="0 0 8 12" aria-hidden="true" class="price-kline-overlay-toolbar-drag-icon"><circle cx="2" cy="2" r="1.1" fill="currentColor"/><circle cx="6" cy="2" r="1.1" fill="currentColor"/><circle cx="2" cy="6" r="1.1" fill="currentColor"/><circle cx="6" cy="6" r="1.1" fill="currentColor"/><circle cx="2" cy="10" r="1.1" fill="currentColor"/><circle cx="6" cy="10" r="1.1" fill="currentColor"/></svg>`;

type OverlayClickInstance = {
  id: string;
  name: string;
  currentStep?: number;
  points?: Array<{ value?: number }>;
  isDrawing?: () => boolean;
  styles?: OverlayStyle | null;
  extendData?: unknown;
};

type OverlayClickInfo = {
  instance: OverlayClickInstance | null;
};

type OverlayStoreMenuHook = {
  setClickInstanceInfo: (info: OverlayClickInfo & { paneId?: string }, event?: OverlayPointerEvent) => void;
  setHoverInstanceInfo: (info: OverlayClickInfo & { paneId?: string }, event?: OverlayPointerEvent) => void;
  removeInstance: (...args: unknown[]) => unknown;
  isDrawing: () => boolean;
};

type ChartInternal = Chart & {
  _chartStore?: {
    getOverlayStore: () => OverlayStoreMenuHook;
  };
};

type OverlayPointerEvent = {
  x?: number;
  y?: number;
};

function getOverlayStore(chart: Chart): OverlayStoreMenuHook | null {
  return (chart as ChartInternal)._chartStore?.getOverlayStore?.() ?? null;
}

function isCompleteOverlay(overlay: OverlayClickInstance): boolean {
  if (overlay.currentStep !== undefined && overlay.currentStep !== OVERLAY_DRAW_STEP_FINISHED) {
    return false;
  }
  if (!overlay.points?.length) return false;
  return overlay.points.some((point) => Number.isFinite(point.value));
}

function getChartTheme(container: HTMLElement): "dark" | "light" {
  const theme = container.querySelector(".klinecharts-pro")?.getAttribute("data-theme");
  if (theme === "light" || theme === "dark") return theme;
  return isDashboardDarkTheme() ? "dark" : "light";
}

function normalizeHex(color: string): string {
  const trimmed = color.trim();
  if (!trimmed.startsWith("#")) return "#FFFFFF";
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.slice(0, 7).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

function parseColorWithAlpha(color: string): { hex: string; alpha: number } {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    const alpha = rgbaMatch[4] != null ? Number(rgbaMatch[4]) : 1;
    const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    return { hex, alpha: Number.isFinite(alpha) ? alpha : 1 };
  }
  return { hex: normalizeHex(color), alpha: 1 };
}

function buildOverlayColorStyles(color: string, alpha = 1): DeepPartial<OverlayStyle> {
  const rgba = color.startsWith("rgba") ? color : hexToRgba(color, alpha);
  return {
    line: { color: rgba },
    polygon: { color: rgba, borderColor: rgba },
    rect: { color: rgba, borderColor: rgba },
    circle: { color: rgba, borderColor: rgba },
    arc: { color: rgba },
    text: { color: "#ffffff", borderColor: rgba, backgroundColor: rgba },
    point: {
      color: rgba,
      borderColor: rgba,
      activeColor: rgba,
      activeBorderColor: rgba,
    },
  };
}

function readOverlayColor(overlay: OverlayClickInstance): string | null {
  const styles = overlay.styles;
  if (!styles) return null;
  const candidates = [
    styles.line?.color,
    styles.polygon?.color,
    styles.rect?.color,
    styles.circle?.color,
    styles.arc?.color,
    styles.text?.color,
    styles.point?.color,
  ];
  for (const color of candidates) {
    if (typeof color === "string" && color.length > 0) return color;
  }
  return null;
}

function pointerToClient(
  container: HTMLElement,
  event: OverlayPointerEvent | undefined,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (event == null || !Number.isFinite(event.x) || !Number.isFinite(event.y)) {
    return fallback;
  }
  const rect = container.getBoundingClientRect();
  return {
    x: rect.left + (event.x ?? 0),
    y: rect.top + (event.y ?? 0),
  };
}

function clampToolbarPosition(toolbar: HTMLElement, left: number, top: number): { left: number; top: number } {
  const pad = 10;
  const width = toolbar.offsetWidth;
  const height = toolbar.offsetHeight;
  return {
    left: Math.min(Math.max(pad, left), Math.max(pad, window.innerWidth - width - pad)),
    top: Math.min(Math.max(pad, top), Math.max(pad, window.innerHeight - height - pad)),
  };
}
function positionToolbarBar(toolbar: HTMLElement, clientX: number, clientY: number): void {
  const pad = 10;
  toolbar.style.visibility = "hidden";

  const width = toolbar.offsetWidth;
  const height = toolbar.offsetHeight;
  let left = clientX - width / 2;
  let top = clientY - height - 14;

  if (left < pad) left = pad;
  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - width - pad);
  }
  if (top < pad) {
    top = clientY + 14;
  }
  if (top + height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - height - pad);
  }

  const clamped = clampToolbarPosition(toolbar, left, top);
  toolbar.style.left = `${clamped.left}px`;
  toolbar.style.top = `${clamped.top}px`;
  toolbar.style.visibility = "visible";
}

function positionColorMenu(colorMenu: HTMLElement, colorBtn: HTMLElement): void {
  const pad = 10;
  colorMenu.style.visibility = "hidden";

  const btnRect = colorBtn.getBoundingClientRect();
  const menuWidth = colorMenu.offsetWidth;
  const menuHeight = colorMenu.offsetHeight;
  let menuLeft = btnRect.left;
  let menuTop = btnRect.bottom + 6;

  if (menuLeft + menuWidth > window.innerWidth - pad) {
    menuLeft = Math.max(pad, window.innerWidth - menuWidth - pad);
  }
  if (menuTop + menuHeight > window.innerHeight - pad) {
    menuTop = Math.max(pad, btnRect.top - menuHeight - 6);
  }

  colorMenu.style.left = `${menuLeft}px`;
  colorMenu.style.top = `${menuTop}px`;
  colorMenu.style.visibility = "visible";
}

export function attachKlineOverlayContextMenu(params: {
  container: HTMLElement;
}): () => void {
  const { container } = params;
  let disposed = false;
  let chart: Chart | null = null;
  let rafId = 0;
  let unhookClick: (() => void) | null = null;
  let activeOverlayId: string | null = null;
  let suppressOpenUntil = 0;
  let menuOpenedAt = 0;
  let lastPointer = { x: 0, y: 0 };
  let currentHex = "#FFFFFF";
  let currentAlpha = 1;
  let colorMenuOpen = false;
  let textEditorOpen = false;
  let isDragging = false;
  let dragPointerId: number | null = null;
  let dragOffset = { x: 0, y: 0 };

  const toolbar = document.createElement("div");
  toolbar.className = "price-kline-overlay-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-hidden", "true");

  const toolbarBar = document.createElement("div");
  toolbarBar.className = "price-kline-overlay-toolbar-bar";

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "price-kline-overlay-toolbar-drag";
  dragHandle.setAttribute("aria-label", "Переместить");
  dragHandle.innerHTML = DRAG_HANDLE_SVG;

  const toolbarSep = document.createElement("span");
  toolbarSep.className = "price-kline-overlay-toolbar-sep";
  toolbarSep.setAttribute("aria-hidden", "true");

  const colorBtn = document.createElement("button");
  colorBtn.type = "button";
  colorBtn.className = "price-kline-overlay-toolbar-btn price-kline-overlay-toolbar-btn--color";
  colorBtn.setAttribute("aria-label", "Цвет");
  colorBtn.setAttribute("aria-haspopup", "true");
  colorBtn.innerHTML = `${COLOR_LINE_ICON_SVG}<span class="price-kline-overlay-toolbar-color-mark" aria-hidden="true"></span>`;

  const textBtn = document.createElement("button");
  textBtn.type = "button";
  textBtn.className = "price-kline-overlay-toolbar-btn price-kline-overlay-toolbar-btn--text";
  textBtn.setAttribute("aria-label", "Текст");
  textBtn.setAttribute("title", "Текст на линии");
  textBtn.setAttribute("aria-haspopup", "true");
  textBtn.innerHTML = TEXT_ICON_SVG;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "price-kline-overlay-toolbar-btn price-kline-overlay-toolbar-btn--delete";
  deleteBtn.setAttribute("aria-label", "Удалить");
  deleteBtn.innerHTML = DELETE_ICON_SVG;

  toolbarBar.append(dragHandle, toolbarSep, colorBtn, textBtn, deleteBtn);
  toolbar.appendChild(toolbarBar);

  const textEditor = document.createElement("div");
  textEditor.className = "price-kline-overlay-text-editor";
  textEditor.setAttribute("role", "dialog");
  textEditor.setAttribute("aria-label", "Текст линии");
  textEditor.setAttribute("aria-hidden", "true");

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "price-kline-overlay-text-editor-input";
  textInput.placeholder = "Подпись линии";
  textInput.maxLength = 120;
  textInput.autocomplete = "off";

  let selectedAlong: KlineOverlayLabelAlong = "start";
  let selectedSide: KlineOverlayLabelSide = "top";
  let selectedSize = 12;
  let applyOverlayLabelLive = () => {
    // filled after applyOverlayLabel is defined
  };

  const makeOptionGroup = <T extends string>(
    label: string,
    options: Array<{ value: T; title: string }>,
    onPick: (value: T) => void,
  ) => {
    const wrap = document.createElement("div");
    wrap.className = "price-kline-overlay-text-editor-group";

    const caption = document.createElement("div");
    caption.className = "price-kline-overlay-text-editor-group-label";
    caption.textContent = label;

    const row = document.createElement("div");
    row.className = "price-kline-overlay-text-editor-options";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", label);

    const buttons = new Map<T, HTMLButtonElement>();
    for (const option of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "price-kline-overlay-text-editor-option";
      btn.textContent = option.title;
      btn.dataset.value = option.value;
      btn.setAttribute("role", "radio");
      btn.addEventListener("click", () => {
        onPick(option.value);
        for (const [value, node] of buttons) {
          const active = value === option.value;
          node.classList.toggle("is-active", active);
          node.setAttribute("aria-checked", active ? "true" : "false");
        }
      });
      buttons.set(option.value, btn);
      row.appendChild(btn);
    }

    const sync = (value: T) => {
      for (const [item, node] of buttons) {
        const active = item === value;
        node.classList.toggle("is-active", active);
        node.setAttribute("aria-checked", active ? "true" : "false");
      }
    };

    const setPresentation = (nextLabel: string, titles: Record<T, string>) => {
      caption.textContent = nextLabel;
      row.setAttribute("aria-label", nextLabel);
      for (const [value, node] of buttons) {
        const title = titles[value];
        if (title) node.textContent = title;
      }
    };

    wrap.append(caption, row);
    return { wrap, sync, setPresentation };
  };

  const alongGroup = makeOptionGroup<KlineOverlayLabelAlong>(
    "По линии",
    [
      { value: "start", title: "В начале" },
      { value: "center", title: "По центру" },
      { value: "end", title: "В конце" },
    ],
    (value) => {
      selectedAlong = value;
      applyOverlayLabelLive();
    },
  );

  const sideGroup = makeOptionGroup<KlineOverlayLabelSide>(
    "Относительно линии",
    [
      { value: "top", title: "Сверху" },
      { value: "middle", title: "По середине" },
      { value: "bottom", title: "Снизу" },
    ],
    (value) => {
      selectedSide = value;
      applyOverlayLabelLive();
    },
  );

  const isVerticalOverlayName = (name: string | undefined): boolean =>
    Boolean(
      name &&
        (name === "verticalStraightLine" ||
          name === "verticalRayLine" ||
          name === "verticalSegment"),
    );

  const syncLabelPositionPresentation = (overlayName: string | undefined) => {
    if (isVerticalOverlayName(overlayName)) {
      alongGroup.setPresentation("По линии", {
        start: "Сверху",
        center: "По середине",
        end: "Снизу",
      });
      sideGroup.setPresentation("Относительно линии", {
        top: "Слева",
        middle: "По центру",
        bottom: "Справа",
      });
      return;
    }

    alongGroup.setPresentation("По линии", {
      start: "В начале",
      center: "По центру",
      end: "В конце",
    });
    sideGroup.setPresentation("Относительно линии", {
      top: "Сверху",
      middle: "По середине",
      bottom: "Снизу",
    });
  };

  const sizeGroup = document.createElement("div");
  sizeGroup.className = "price-kline-overlay-text-editor-group";

  const sizeLabel = document.createElement("div");
  sizeLabel.className = "price-kline-overlay-text-editor-group-label";
  sizeLabel.textContent = "Размер текста";

  const sizeRow = document.createElement("div");
  sizeRow.className = "price-kline-overlay-text-editor-size-row";

  const sizeRange = document.createElement("input");
  sizeRange.type = "range";
  sizeRange.className = "price-kline-overlay-text-editor-size-range";
  sizeRange.min = "10";
  sizeRange.max = "28";
  sizeRange.step = "1";
  sizeRange.value = "12";
  sizeRange.setAttribute("aria-label", "Размер текста");

  const sizeValue = document.createElement("span");
  sizeValue.className = "price-kline-overlay-text-editor-size-value";
  sizeValue.textContent = "12";

  const syncSizeUi = (size: number) => {
    selectedSize = size;
    sizeRange.value = String(size);
    sizeValue.textContent = String(size);
  };

  sizeRange.addEventListener("input", () => {
    syncSizeUi(Number(sizeRange.value));
    applyOverlayLabelLive();
  });

  sizeRow.append(sizeRange, sizeValue);
  sizeGroup.append(sizeLabel, sizeRow);

  const textActions = document.createElement("div");
  textActions.className = "price-kline-overlay-text-editor-actions";

  const textClearBtn = document.createElement("button");
  textClearBtn.type = "button";
  textClearBtn.className = "price-kline-overlay-text-editor-btn price-kline-overlay-text-editor-btn--ghost";
  textClearBtn.textContent = "Убрать";

  const textSaveBtn = document.createElement("button");
  textSaveBtn.type = "button";
  textSaveBtn.className = "price-kline-overlay-text-editor-btn price-kline-overlay-text-editor-btn--primary";
  textSaveBtn.textContent = "Готово";

  textActions.append(textClearBtn, textSaveBtn);
  textEditor.append(textInput, alongGroup.wrap, sideGroup.wrap, sizeGroup, textActions);

  const colorMenu = document.createElement("div");
  colorMenu.className = "price-kline-overlay-color-menu";
  colorMenu.setAttribute("role", "menu");
  colorMenu.setAttribute("aria-hidden", "true");

  const colorGrid = document.createElement("div");
  colorGrid.className = "price-kline-overlay-color-grid";

  for (const color of OVERLAY_COLOR_PRESETS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "price-kline-overlay-color-swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.setAttribute("aria-label", `Цвет ${color}`);
    swatch.dataset.color = color;
    colorGrid.appendChild(swatch);
  }

  const colorAddRow = document.createElement("div");
  colorAddRow.className = "price-kline-overlay-color-add-row";

  const colorAddBtn = document.createElement("button");
  colorAddBtn.type = "button";
  colorAddBtn.className = "price-kline-overlay-color-add";
  colorAddBtn.setAttribute("aria-label", "Свой цвет");
  colorAddBtn.textContent = "+";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "price-kline-overlay-color-input";
  colorInput.value = "#FFFFFF";
  colorInput.tabIndex = -1;

  colorAddRow.append(colorAddBtn, colorInput);

  const opacitySection = document.createElement("div");
  opacitySection.className = "price-kline-overlay-color-opacity";

  const opacityLabel = document.createElement("span");
  opacityLabel.className = "price-kline-overlay-color-opacity-label";
  opacityLabel.textContent = "Прозрачность";

  const opacityTrack = document.createElement("div");
  opacityTrack.className = "price-kline-overlay-color-opacity-track";

  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.className = "price-kline-overlay-color-opacity-range";
  opacityInput.min = "0";
  opacityInput.max = "100";
  opacityInput.step = "1";
  opacityInput.value = "100";

  const opacityValue = document.createElement("span");
  opacityValue.className = "price-kline-overlay-color-opacity-value";
  opacityValue.textContent = "100%";

  opacityTrack.appendChild(opacityInput);
  opacitySection.append(opacityLabel, opacityTrack, opacityValue);

  colorMenu.append(colorGrid, colorAddRow, opacitySection);
  document.body.append(toolbar, colorMenu, textEditor);

  const colorMark = colorBtn.querySelector<HTMLElement>(".price-kline-overlay-toolbar-color-mark");

  const syncTheme = () => {
    const theme = getChartTheme(container);
    toolbarBar.dataset.theme = theme;
    colorMenu.dataset.theme = theme;
    textEditor.dataset.theme = theme;
  };

  const hideColorMenu = () => {
    colorMenuOpen = false;
    colorMenu.classList.remove("is-open");
    colorMenu.setAttribute("aria-hidden", "true");
    colorMenu.style.removeProperty("visibility");
    colorMenu.style.removeProperty("left");
    colorMenu.style.removeProperty("top");
    colorBtn.classList.remove("is-menu-open");
  };

  const hideTextEditor = () => {
    textEditorOpen = false;
    textEditor.classList.remove("is-open");
    textEditor.setAttribute("aria-hidden", "true");
    textEditor.style.removeProperty("visibility");
    textEditor.style.removeProperty("left");
    textEditor.style.removeProperty("top");
    textBtn.classList.remove("is-menu-open", "is-active");
  };

  const hideToolbar = (options?: { suppressReopen?: boolean }) => {
    activeOverlayId = null;
    isDragging = false;
    dragPointerId = null;
    toolbar.classList.remove("is-dragging");
    hideColorMenu();
    hideTextEditor();
    toolbar.classList.remove("is-open");
    toolbar.setAttribute("aria-hidden", "true");
    toolbar.style.removeProperty("visibility");
    toolbar.style.removeProperty("left");
    toolbar.style.removeProperty("top");
    if (options?.suppressReopen) {
      suppressOpenUntil = performance.now() + MENU_SUPPRESS_MS;
    }
    colorGrid.querySelectorAll(".price-kline-overlay-color-swatch.is-active").forEach((node) => {
      node.classList.remove("is-active");
    });
  };

  const isToolbarOpen = () => toolbar.classList.contains("is-open");

  const canCloseFromOutside = () => isToolbarOpen() && performance.now() - menuOpenedAt > 80;

  const isOutsideUi = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return true;
    return !toolbar.contains(target) && !colorMenu.contains(target) && !textEditor.contains(target);
  };

  const updateColorUi = () => {
    if (colorMark) {
      colorMark.style.backgroundColor = hexToRgba(currentHex, currentAlpha);
    }
    opacityInput.value = String(Math.round(currentAlpha * 100));
    opacityValue.textContent = `${Math.round(currentAlpha * 100)}%`;
    opacityInput.style.setProperty("--opacity-color", hexToRgba(currentHex, 1));
    colorInput.value = currentHex;

    colorGrid.querySelectorAll(".price-kline-overlay-color-swatch").forEach((node) => {
      const swatch = node as HTMLButtonElement;
      swatch.classList.toggle("is-active", swatch.dataset.color?.toUpperCase() === currentHex);
    });
  };

  const applyOverlayColor = () => {
    if (!chart || !activeOverlayId) return;
    chart.overrideOverlay({
      id: activeOverlayId,
      styles: buildOverlayColorStyles(currentHex, currentAlpha),
    });
    updateColorUi();
  };

  const positionTextEditor = () => {
    const pad = 10;
    textEditor.style.visibility = "hidden";
    const btnRect = textBtn.getBoundingClientRect();
    const menuWidth = textEditor.offsetWidth;
    const menuHeight = textEditor.offsetHeight;
    let menuLeft = btnRect.left;
    let menuTop = btnRect.bottom + 6;

    if (menuLeft + menuWidth > window.innerWidth - pad) {
      menuLeft = Math.max(pad, window.innerWidth - menuWidth - pad);
    }
    if (menuTop + menuHeight > window.innerHeight - pad) {
      menuTop = Math.max(pad, btnRect.top - menuHeight - 6);
    }

    textEditor.style.left = `${menuLeft}px`;
    textEditor.style.top = `${menuTop}px`;
    textEditor.style.visibility = "visible";
  };

  const showColorMenu = () => {
    hideTextEditor();
    colorMenuOpen = true;
    colorBtn.classList.add("is-menu-open");
    colorMenu.classList.add("is-open");
    colorMenu.setAttribute("aria-hidden", "false");
    syncTheme();
    updateColorUi();

    positionColorMenu(colorMenu, colorBtn);
  };

  const toggleColorMenu = () => {
    if (colorMenuOpen) {
      hideColorMenu();
      return;
    }
    showColorMenu();
  };

  const readActiveOverlay = (): OverlayClickInstance | null => {
    if (!chart || !activeOverlayId) return null;
    return (chart.getOverlayById?.(activeOverlayId) as OverlayClickInstance | null) ?? null;
  };

  const applyOverlayLabel = (raw: string) => {
    if (!chart || !activeOverlayId) return;
    const text = raw.trim().slice(0, 120);
    const extendData: KlineOverlayLabelData | "" = text
      ? { text, along: selectedAlong, side: selectedSide, size: selectedSize }
      : "";
    chart.overrideOverlay({
      id: activeOverlayId,
      extendData,
    });
    textBtn.classList.toggle("is-active", text.length > 0);
  };

  applyOverlayLabelLive = () => {
    applyOverlayLabel(textInput.value);
  };

  const showTextEditor = () => {
    hideColorMenu();
    textEditorOpen = true;
    textBtn.classList.add("is-menu-open");
    textEditor.classList.add("is-open");
    textEditor.setAttribute("aria-hidden", "false");
    syncTheme();
    const overlay = readActiveOverlay();
    const current = getKlineOverlayLabelData(overlay?.extendData);
    syncLabelPositionPresentation(overlay?.name);
    textInput.value = current?.text ?? "";
    selectedAlong = current?.along ?? "start";
    selectedSide = current?.side ?? "top";
    syncSizeUi(current?.size ?? 12);
    alongGroup.sync(selectedAlong);
    sideGroup.sync(selectedSide);
    textBtn.classList.toggle("is-active", textInput.value.trim().length > 0);
    positionTextEditor();
    window.requestAnimationFrame(() => {
      textInput.focus();
      textInput.select();
    });
  };

  const toggleTextEditor = () => {
    if (textEditorOpen) {
      hideTextEditor();
      return;
    }
    showTextEditor();
  };

  const showToolbar = (overlay: OverlayClickInstance, clientX: number, clientY: number) => {
    activeOverlayId = overlay.id;
    menuOpenedAt = performance.now();

    const parsed = parseColorWithAlpha(readOverlayColor(overlay) ?? "#FFFFFF");
    currentHex = parsed.hex;
    currentAlpha = parsed.alpha;

    syncTheme();
    updateColorUi();
    hideColorMenu();
    hideTextEditor();
    textBtn.classList.toggle("is-active", getKlineOverlayLabelText(overlay.extendData).length > 0);

    toolbar.classList.add("is-open");
    toolbar.setAttribute("aria-hidden", "false");
    positionToolbarBar(toolbar, clientX, clientY);
  };

  const onDelete = () => {
    const overlayId = activeOverlayId;
    hideToolbar({ suppressReopen: true });
    if (!chart || !overlayId) return;
    chart.removeOverlay({ id: overlayId });
  };

  const onColorBtnClick = (event: MouseEvent) => {
    event.stopPropagation();
    toggleColorMenu();
    if (colorMenuOpen && isToolbarOpen()) {
      positionColorMenu(colorMenu, colorBtn);
    }
  };

  const onSwatchClick = (event: Event) => {
    const target = event.currentTarget as HTMLButtonElement | null;
    const color = target?.dataset.color;
    if (!color) return;
    currentHex = normalizeHex(color);
    applyOverlayColor();
  };

  const onColorAddClick = () => {
    colorInput.click();
  };

  const onColorInput = () => {
    currentHex = normalizeHex(colorInput.value);
    applyOverlayColor();
  };

  const onOpacityInput = () => {
    currentAlpha = Number(opacityInput.value) / 100;
    opacityValue.textContent = `${opacityInput.value}%`;
    applyOverlayColor();
  };

  const repositionColorMenuIfOpen = () => {
    if (colorMenuOpen) {
      positionColorMenu(colorMenu, colorBtn);
    }
    if (textEditorOpen) {
      positionTextEditor();
    }
  };

  const onTextBtnClick = (event: MouseEvent) => {
    event.stopPropagation();
    toggleTextEditor();
  };

  const onTextSave = () => {
    applyOverlayLabelLive();
    hideTextEditor();
  };

  const onTextClear = () => {
    textInput.value = "";
    applyOverlayLabel("");
    hideTextEditor();
  };

  const onTextInputLive = () => {
    applyOverlayLabelLive();
  };

  const onTextInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onTextSave();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideTextEditor();
    }
  };

  const onDragPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = toolbar.getBoundingClientRect();
    isDragging = true;
    dragPointerId = event.pointerId;
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    toolbar.classList.add("is-dragging");
    dragHandle.setPointerCapture(event.pointerId);
  };

  const onDragPointerMove = (event: PointerEvent) => {
    if (!isDragging || dragPointerId !== event.pointerId) return;
    event.preventDefault();

    const next = clampToolbarPosition(
      toolbar,
      event.clientX - dragOffset.x,
      event.clientY - dragOffset.y,
    );
    toolbar.style.left = `${next.left}px`;
    toolbar.style.top = `${next.top}px`;
    repositionColorMenuIfOpen();
  };

  const endDrag = (event: PointerEvent) => {
    if (!isDragging || dragPointerId !== event.pointerId) return;
    isDragging = false;
    dragPointerId = null;
    toolbar.classList.remove("is-dragging");
    if (dragHandle.hasPointerCapture(event.pointerId)) {
      dragHandle.releasePointerCapture(event.pointerId);
    }
    repositionColorMenuIfOpen();
  };

  dragHandle.addEventListener("pointerdown", onDragPointerDown);
  dragHandle.addEventListener("pointermove", onDragPointerMove);
  dragHandle.addEventListener("pointerup", endDrag);
  dragHandle.addEventListener("pointercancel", endDrag);

  deleteBtn.addEventListener("click", onDelete);
  colorBtn.addEventListener("click", onColorBtnClick);
  textBtn.addEventListener("click", onTextBtnClick);
  textSaveBtn.addEventListener("click", onTextSave);
  textClearBtn.addEventListener("click", onTextClear);
  textInput.addEventListener("input", onTextInputLive);
  textInput.addEventListener("keydown", onTextInputKeyDown);
  colorAddBtn.addEventListener("click", onColorAddClick);
  colorInput.addEventListener("input", onColorInput);
  opacityInput.addEventListener("input", onOpacityInput);
  colorGrid.querySelectorAll(".price-kline-overlay-color-swatch").forEach((node) => {
    node.addEventListener("click", onSwatchClick);
  });

  const onOutsidePointerDown = (event: PointerEvent) => {
    if (isDragging) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    if (!canCloseFromOutside() || !isOutsideUi(event.target)) return;
    hideToolbar();
  };

  const onOutsideMouseDown = (event: MouseEvent) => {
    if (isDragging) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    if (!canCloseFromOutside() || !isOutsideUi(event.target)) return;
    hideToolbar();
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (textEditorOpen) {
      hideTextEditor();
      return;
    }
    if (colorMenuOpen) {
      hideColorMenu();
      return;
    }
    hideToolbar();
  };

  const onContainerPointerDown = (event: PointerEvent) => {
    if (isDragging) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    lastPointer = { x: event.clientX, y: event.clientY };
    if (canCloseFromOutside() && isOutsideUi(event.target)) {
      hideToolbar();
    }
  };

  const onContainerMouseDown = (event: MouseEvent) => {
    if (isDragging) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    if (canCloseFromOutside() && isOutsideUi(event.target)) {
      hideToolbar();
    }
  };

  window.addEventListener("pointerdown", onOutsidePointerDown, true);
  window.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("keydown", onDocumentKeyDown);
  container.addEventListener("pointerdown", onContainerPointerDown, true);
  container.addEventListener("mousedown", onContainerMouseDown, true);

  function hookOverlayStore(resolved: Chart): () => void {
    const store = getOverlayStore(resolved);
    if (!store) return () => undefined;

    const originalClick = store.setClickInstanceInfo.bind(store);
    const originalHover = store.setHoverInstanceInfo.bind(store);
    const originalRemove = store.removeInstance.bind(store);

    store.setHoverInstanceInfo = (info, event) => {
      if (shouldBlockOverlayInteraction(info)) {
        originalHover(toBlockedHoverInfo(info), event);
        if (isToolbarOpen()) hideToolbar();
        return;
      }
      originalHover(info, event);
    };

    store.setClickInstanceInfo = (info, event) => {
      if (shouldBlockOverlayInteraction(info)) {
        originalClick(toBlockedClickInfo(info), event);
        if (isToolbarOpen()) hideToolbar();
        return;
      }

      originalClick(info, event);
      if (disposed) return;

      const instance = info.instance;

      if (performance.now() < suppressOpenUntil) {
        return;
      }

      if (store.isDrawing() || !instance || !isCompleteOverlay(instance)) {
        if (isToolbarOpen()) hideToolbar();
        return;
      }

      if (isToolbarOpen() && activeOverlayId === instance.id) {
        hideToolbar();
        return;
      }

      const { x, y } = pointerToClient(container, event, lastPointer);
      showToolbar(instance, x, y);
    };

    store.removeInstance = (...args: unknown[]) => {
      const result = originalRemove(...args);
      if (isToolbarOpen()) hideToolbar();
      return result;
    };

    return () => {
      store.setClickInstanceInfo = originalClick;
      store.setHoverInstanceInfo = originalHover;
      store.removeInstance = originalRemove;
    };
  }

  const attachToChart = (resolved: Chart) => {
    chart = resolved;
    unhookClick = hookOverlayStore(resolved);
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
    unhookClick?.();
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("mousedown", onOutsideMouseDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown);
    container.removeEventListener("pointerdown", onContainerPointerDown, true);
    container.removeEventListener("mousedown", onContainerMouseDown, true);
    deleteBtn.removeEventListener("click", onDelete);
    dragHandle.removeEventListener("pointerdown", onDragPointerDown);
    dragHandle.removeEventListener("pointermove", onDragPointerMove);
    dragHandle.removeEventListener("pointerup", endDrag);
    dragHandle.removeEventListener("pointercancel", endDrag);
    colorBtn.removeEventListener("click", onColorBtnClick);
    colorAddBtn.removeEventListener("click", onColorAddClick);
    colorInput.removeEventListener("input", onColorInput);
    opacityInput.removeEventListener("input", onOpacityInput);
    colorGrid.querySelectorAll(".price-kline-overlay-color-swatch").forEach((node) => {
      node.removeEventListener("click", onSwatchClick);
    });
    hideToolbar();
    toolbar.remove();
    colorMenu.remove();
    textEditor.remove();
    chart = null;
  };
}
