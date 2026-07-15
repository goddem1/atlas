import type { ChartPro } from "@klinecharts/pro";
import { OverlayMode, type Chart } from "klinecharts";
import { isDashboardDarkTheme } from "./candleKlineUtils";
import { getKlineDrawingToolLabel } from "./priceKlineLocaleRu";
import {
  getKlineOverlayDrawMode,
  getKlineOverlayDrawModeForNewOverlay,
  setKlineOverlayDrawMode,
} from "./priceKlineOverlayDrawMode";
import { resolveKlineChartFromProContainer, clearAllKlineOverlays } from "./priceKlineOverlayPersistence";
import {
  isKlineOverlaysLocked,
  setKlineOverlaysLocked,
  syncKlineOverlaysLock,
  updateKlineOverlayLockButtonUi,
} from "./priceKlineOverlayLock";
import { createKlineDrawingPinsStore } from "./priceKlineDrawingPinsStore";
import { resolveKlineMenuHost } from "./priceKlineMenuHost";

const SELECTED_TOOLS_STORAGE_KEY = "atlas.price-kline-drawing-tools.v1";
const MENU_SUPPRESS_MS = 120;
const DRAWING_BAR_MIN_HEIGHT_PX = 350;
const PINS_BOTTOM_GAP_PX = 8;
const PINS_MAX_HEIGHT_BUFFER_PX = 8;

type PinnedDrawingTool = {
  groupId: string;
  toolKey: string;
};

const STAR_OUTLINE_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;
const STAR_FILLED_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="currentColor" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;

type DrawingTool = {
  key: string;
};

type DrawingToolGroup = {
  id: string;
  tools: DrawingTool[];
  defaultTool: string;
};

type MagnetModeOption = {
  key: "weak_magnet" | "strong_magnet";
};

const DRAWING_TOOL_GROUPS: DrawingToolGroup[] = [
  {
    id: "singleLine",
    defaultTool: "horizontalStraightLine",
    tools: [
      { key: "horizontalStraightLine" },
      { key: "horizontalRayLine" },
      { key: "horizontalSegment" },
      { key: "verticalStraightLine" },
      { key: "verticalRayLine" },
      { key: "verticalSegment" },
      { key: "straightLine" },
      { key: "rayLine" },
      { key: "segment" },
      { key: "arrow" },
      { key: "priceLine" },
    ],
  },
  {
    id: "moreLine",
    defaultTool: "priceChannelLine",
    tools: [{ key: "priceChannelLine" }, { key: "parallelStraightLine" }],
  },
  {
    id: "polygon",
    defaultTool: "circle",
    tools: [
      { key: "circle" },
      { key: "rect" },
      { key: "parallelogram" },
      { key: "triangle" },
    ],
  },
  {
    id: "fibonacci",
    defaultTool: "fibonacciLine",
    tools: [
      { key: "fibonacciLine" },
      { key: "fibonacciSegment" },
      { key: "fibonacciCircle" },
      { key: "fibonacciSpiral" },
      { key: "fibonacciSpeedResistanceFan" },
      { key: "fibonacciExtension" },
      { key: "gannBox" },
    ],
  },
  {
    id: "wave",
    defaultTool: "xabcd",
    tools: [
      { key: "xabcd" },
      { key: "abcd" },
      { key: "threeWaves" },
      { key: "fiveWaves" },
      { key: "eightWaves" },
      { key: "anyWaves" },
    ],
  },
];

const MAGNET_MODE_OPTIONS: MagnetModeOption[] = [
  { key: "weak_magnet" },
  { key: "strong_magnet" },
];

const DRAWING_TOOLS_GROUP_ID = "drawing_tools";

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function getLocaleKeyForTool(toolKey: string): string {
  return camelToSnake(toolKey);
}

function getLocaleKeyForMagnet(modeKey: string): string {
  return modeKey;
}

function loadSelectedTools(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SELECTED_TOOLS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSelectedTools(value: Record<string, string>): void {
  try {
    localStorage.setItem(SELECTED_TOOLS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function isPinnedDrawingTool(value: unknown): value is PinnedDrawingTool {
  if (!value || typeof value !== "object") return false;
  const pin = value as PinnedDrawingTool;
  if (typeof pin.groupId !== "string" || typeof pin.toolKey !== "string") return false;
  const group = DRAWING_TOOL_GROUPS.find((item) => item.id === pin.groupId);
  return Boolean(group?.tools.some((tool) => tool.key === pin.toolKey));
}

function normalizePinnedTools(pins: PinnedDrawingTool[]): PinnedDrawingTool[] {
  const seen = new Set<string>();
  const result: PinnedDrawingTool[] = [];
  for (const pin of pins) {
    if (!isPinnedDrawingTool(pin)) continue;
    const key = `${pin.groupId}:${pin.toolKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pin);
  }
  return result;
}

function isToolPinned(pins: PinnedDrawingTool[], groupId: string, toolKey: string): boolean {
  return pins.some((pin) => pin.groupId === groupId && pin.toolKey === toolKey);
}

function getSelectedTool(group: DrawingToolGroup): string {
  const stored = loadSelectedTools()[group.id];
  if (stored && group.tools.some((tool) => tool.key === stored)) return stored;
  return group.defaultTool;
}

function setSelectedTool(groupId: string, toolKey: string): void {
  const next = { ...loadSelectedTools(), [groupId]: toolKey };
  saveSelectedTools(next);
}

function getChartTheme(container: HTMLElement): "dark" | "light" {
  const theme = container.querySelector(".klinecharts-pro")?.getAttribute("data-theme");
  if (theme === "light" || theme === "dark") return theme;
  return isDashboardDarkTheme() ? "dark" : "light";
}

function syncMenuTheme(menu: HTMLElement, container: HTMLElement): void {
  menu.dataset.theme = getChartTheme(container);
}

function getDrawingBarSections(bar: HTMLElement): {
  toolItems: HTMLElement[];
  magnetItem: HTMLElement | null;
  lockItem: HTMLElement | null;
  visibleItem: HTMLElement | null;
  removeItem: HTMLElement | null;
} {
  const children = [...bar.children];
  const firstSplit = children.findIndex(
    (node) => node instanceof HTMLElement && node.classList.contains("split-line"),
  );
  const toolItems =
    firstSplit < 0
      ? []
      : children
          .slice(0, firstSplit)
          .filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("item"));

  const afterFirstSplit = firstSplit < 0 ? children : children.slice(firstSplit + 1);
  const secondSplit = afterFirstSplit.findIndex(
    (node) => node instanceof HTMLElement && node.classList.contains("split-line"),
  );
  const controlItems = (
    secondSplit < 0 ? afterFirstSplit : afterFirstSplit.slice(0, secondSplit)
  ).filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("item"));

  const removeItem =
    secondSplit < 0
      ? null
      : (afterFirstSplit[secondSplit + 1] as HTMLElement | undefined)?.classList?.contains("item")
        ? (afterFirstSplit[secondSplit + 1] as HTMLElement)
        : null;

  return {
    toolItems,
    magnetItem: controlItems[0] ?? null,
    lockItem: controlItems[1] ?? null,
    visibleItem: controlItems[2] ?? null,
    removeItem,
  };
}

function measureDrawingBarContentHeight(drawingBar: HTMLElement): number {
  const previousInlineHeight = drawingBar.style.height;
  const previousInlineFlex = drawingBar.style.flex;
  drawingBar.style.height = "auto";
  drawingBar.style.flex = "0 0 auto";
  const measured = drawingBar.scrollHeight;
  if (previousInlineHeight) {
    drawingBar.style.height = previousInlineHeight;
  } else {
    drawingBar.style.removeProperty("height");
  }
  if (previousInlineFlex) {
    drawingBar.style.flex = previousInlineFlex;
  } else {
    drawingBar.style.removeProperty("flex");
  }
  return measured;
}

function getMaxPinsHeight(sidebar: HTMLElement, drawingBar: HTMLElement | null): number {
  const style = getComputedStyle(sidebar);
  const gap = Number.parseFloat(style.rowGap || style.gap) || 8;
  const sidebarHeight = sidebar.clientHeight;
  const drawingBarReserved = drawingBar
    ? Math.max(DRAWING_BAR_MIN_HEIGHT_PX, measureDrawingBarContentHeight(drawingBar))
    : DRAWING_BAR_MIN_HEIGHT_PX;
  return Math.max(
    0,
    sidebarHeight -
      drawingBarReserved -
      gap -
      PINS_BOTTOM_GAP_PX -
      PINS_MAX_HEIGHT_BUFFER_PX,
  );
}

function positionMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const arrow = anchor.querySelector<HTMLElement>(".icon-arrow");
  const rect = (arrow ?? anchor).getBoundingClientRect();
  const pad = 0;
  menu.style.visibility = "hidden";
  menu.classList.add("is-open");

  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = rect.right + pad;
  let top = rect.top;

  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, rect.left - width - pad);
  }
  if (top + height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - height - pad);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

function cloneOverlayIcon(svg: SVGElement | null): SVGElement | null {
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGElement;
  clone.classList.add("price-kline-drawing-tool-icon");
  return clone;
}

function setGroupToolIcon(
  groupEl: HTMLElement,
  toolKey: string,
  iconCache: Map<string, SVGElement>,
): void {
  const iconHost = groupEl.querySelector<HTMLElement>(":scope > span");
  if (!iconHost) return;
  const cached = iconCache.get(toolKey);
  if (!cached) return;
  iconHost.replaceChildren(cloneOverlayIcon(cached)!);
  const label = getKlineDrawingToolLabel(getLocaleKeyForTool(toolKey));
  groupEl.setAttribute("title", label);
  groupEl.setAttribute("aria-label", label);
}

function overlayModeToMagnetKey(mode: OverlayMode): "weak_magnet" | "strong_magnet" | "normal" {
  if (mode === OverlayMode.WeakMagnet) return "weak_magnet";
  if (mode === OverlayMode.StrongMagnet) return "strong_magnet";
  return "normal";
}

function magnetKeyToOverlayMode(key: string): OverlayMode {
  if (key === "weak_magnet") return OverlayMode.WeakMagnet;
  if (key === "strong_magnet") return OverlayMode.StrongMagnet;
  return OverlayMode.Normal;
}

async function waitFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function cacheIconsFromNativeList(
  item: HTMLElement,
  tools: DrawingTool[],
): Promise<Map<string, SVGElement>> {
  const cache = new Map<string, SVGElement>();
  const arrow = item.querySelector<HTMLElement>(".icon-arrow");
  if (!arrow) return cache;

  arrow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitFrame();

  const listItems = [...item.querySelectorAll<HTMLElement>(".list li")];
  for (let index = 0; index < tools.length; index += 1) {
    const tool = tools[index];
    if (!tool) continue;
    const svg = listItems[index]?.querySelector<SVGElement>("svg.icon-overlay");
    const clone = cloneOverlayIcon(svg ?? null);
    if (clone) cache.set(tool.key, clone);
  }

  item.blur();
  arrow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitFrame();

  return cache;
}

function resolveDrawingChart(container: HTMLElement): Chart | null {
  return resolveKlineChartFromProContainer(container);
}

export function attachKlineDrawingToolControl(params: {
  container: HTMLElement;
  chart: ChartPro;
  isLoggedIn: boolean;
}): () => void {
  const { container, isLoggedIn } = params;
  const pinsStore = createKlineDrawingPinsStore({
    isLoggedIn,
    normalize: normalizePinnedTools,
  });
  let disposed = false;
  let rafId = 0;
  let suppressOpenUntil = 0;
  let drawingBarLock = isKlineOverlaysLocked();
  let drawingBarVisible = true;
  let openAnchor: HTMLElement | null = null;
  let openMagnetMenu = false;

  const iconCache = new Map<string, SVGElement>();
  const rowByTool = new Map<string, HTMLDivElement>();
  const rowByMagnet = new Map<string, HTMLDivElement>();
  const pinBtnByTool = new Map<string, HTMLButtonElement>();
  let pinsShell: HTMLDivElement | null = null;
  let pinsHost: HTMLDivElement | null = null;
  let drawingSidebar: HTMLDivElement | null = null;
  let pinsResizeObserver: ResizeObserver | null = null;

  const createOverlayTool = (toolKey: string, groupId?: string) => {
    const klineChart = resolveDrawingChart(container);
    if (!klineChart) return;

    klineChart.createOverlay({
      ...(groupId ? { groupId } : {}),
      name: toolKey,
      lock: drawingBarLock,
      visible: drawingBarVisible,
      mode: getKlineOverlayDrawModeForNewOverlay(),
    });
  };

  const syncPinsHostLayout = () => {
    if (!pinsHost || !pinsShell || !drawingSidebar) return;

    if (!pinsShell.classList.contains("is-visible")) {
      drawingSidebar.style.removeProperty("--price-kline-drawing-pins-max-height");
      drawingSidebar.style.removeProperty("--price-kline-drawing-bar-reserved-height");
      pinsShell.style.removeProperty("max-height");
      return;
    }

    const drawingBar = container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
    const drawingBarReserved = drawingBar
      ? Math.max(DRAWING_BAR_MIN_HEIGHT_PX, measureDrawingBarContentHeight(drawingBar))
      : DRAWING_BAR_MIN_HEIGHT_PX;
    drawingSidebar.style.setProperty(
      "--price-kline-drawing-bar-reserved-height",
      `${drawingBarReserved}px`,
    );

    const maxHeight = getMaxPinsHeight(drawingSidebar, drawingBar);
    drawingSidebar.style.setProperty("--price-kline-drawing-pins-max-height", `${maxHeight}px`);
    pinsShell.style.maxHeight = `${maxHeight}px`;
  };

  const renderToolbarPins = () => {
    if (!pinsHost || !pinsShell) return;
    pinsHost.replaceChildren();

    const pins = pinsStore.getPins();
    if (pins.length === 0) {
      pinsShell.classList.remove("is-visible");
      pinsShell.style.removeProperty("max-height");
      drawingSidebar?.style.removeProperty("--price-kline-drawing-pins-max-height");
      return;
    }

    pinsShell.classList.add("is-visible");

    for (const pin of pins) {
      const label = getKlineDrawingToolLabel(getLocaleKeyForTool(pin.toolKey));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "price-kline-drawing-pin-btn";
      button.dataset.tool = pin.toolKey;
      button.dataset.group = pin.groupId;
      button.setAttribute("title", label);
      button.setAttribute("aria-label", label);

      const iconHost = document.createElement("span");
      iconHost.className = "price-kline-drawing-pin-icon-host";
      const icon = iconCache.get(pin.toolKey);
      if (icon) {
        iconHost.appendChild(cloneOverlayIcon(icon)!);
      }
      button.appendChild(iconHost);

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        createOverlayTool(pin.toolKey);
      });

      pinsHost.appendChild(button);
    }

    syncPinsHostLayout();
  };

  const menu = document.createElement("div");
  menu.className = "price-kline-candle-type-menu price-kline-drawing-tool-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  syncMenuTheme(menu, container);

  const list = document.createElement("div");
  list.className = "price-kline-candle-type-menu-list";
  menu.appendChild(list);
  resolveKlineMenuHost(container).appendChild(menu);

  let outsideCloseArmed = false;

  const hideMenu = () => {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menu.style.removeProperty("visibility");
    menu.style.removeProperty("left");
    menu.style.removeProperty("top");
    outsideCloseArmed = false;
    suppressOpenUntil = performance.now() + MENU_SUPPRESS_MS;
    openAnchor?.classList.remove("price-kline-drawing-menu-open");
    openAnchor?.querySelector(".icon-arrow")?.classList.remove("rotate");
    openAnchor = null;
    openMagnetMenu = false;
  };

  const updateStarStates = (group: DrawingToolGroup) => {
    const pinnedTools = pinsStore.getPins();
    for (const [key, starBtn] of pinBtnByTool) {
      const isPinned = isToolPinned(pinnedTools, group.id, key);
      starBtn.classList.toggle("is-pinned", isPinned);
      starBtn.classList.remove("is-disabled");
      starBtn.disabled = false;
      starBtn.innerHTML = isPinned ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
      starBtn.setAttribute("aria-label", isPinned ? "Убрать с панели" : "Закрепить на панели");
      starBtn.setAttribute("title", isPinned ? "Убрать с панели" : "Закрепить на панели");
    }
  };

  const applyPinnedToolToGroup = (group: DrawingToolGroup, toolKey: string) => {
    setSelectedTool(group.id, toolKey);
    const groupIndex = DRAWING_TOOL_GROUPS.findIndex((item) => item.id === group.id);
    const drawingBar = container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
    const toolItems = drawingBar ? getDrawingBarSections(drawingBar).toolItems : [];
    const groupItem = groupIndex >= 0 ? toolItems[groupIndex] : null;
    if (groupItem) {
      setGroupToolIcon(groupItem, toolKey, iconCache);
    }
    if (openAnchor && groupItem === openAnchor) {
      updateActiveRows(toolKey);
    }
  };

  const togglePin = (group: DrawingToolGroup, toolKey: string) => {
    let pins = [...pinsStore.getPins()];
    const pinnedIndex = pins.findIndex((pin) => pin.groupId === group.id && pin.toolKey === toolKey);

    if (pinnedIndex >= 0) {
      pins = pins.filter((_, index) => index !== pinnedIndex);
      pinsStore.setPins(pins);
    } else {
      pins = [...pins, { groupId: group.id, toolKey }];
      pinsStore.setPins(pins);
      applyPinnedToolToGroup(group, toolKey);
    }

    renderToolbarPins();
    updateStarStates(group);
  };

  const updateActiveRows = (activeKey: string) => {
    for (const [key, row] of rowByTool) {
      row.classList.toggle("is-active", key === activeKey);
    }
    for (const [key, row] of rowByMagnet) {
      row.classList.toggle("is-active", key === activeKey);
    }
  };

  const renderToolMenu = (group: DrawingToolGroup) => {
    list.replaceChildren();
    rowByTool.clear();
    rowByMagnet.clear();
    pinBtnByTool.clear();

    const section = document.createElement("div");
    section.className = "price-kline-candle-type-menu-section";

    const activeTool = getSelectedTool(group);

    for (const tool of group.tools) {
      const localeKey = getLocaleKeyForTool(tool.key);
      const label = getKlineDrawingToolLabel(localeKey);

      const row = document.createElement("div");
      row.className = "price-kline-candle-type-row";
      row.dataset.tool = tool.key;

      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "price-kline-candle-type-row-main price-kline-drawing-tool-row-main";
      selectBtn.setAttribute("role", "menuitemradio");

      const icon = iconCache.get(tool.key);
      if (icon) {
        selectBtn.appendChild(cloneOverlayIcon(icon)!);
      }

      const labelEl = document.createElement("span");
      labelEl.className = "price-kline-candle-type-row-label";
      labelEl.textContent = label;
      selectBtn.appendChild(labelEl);

      selectBtn.addEventListener("click", () => {
        setSelectedTool(group.id, tool.key);
        if (openAnchor) {
          setGroupToolIcon(openAnchor, tool.key, iconCache);
        }

        createOverlayTool(tool.key);

        updateActiveRows(tool.key);
        hideMenu();
      });

      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "price-kline-candle-type-star";
      starBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePin(group, tool.key);
      });

      row.append(selectBtn, starBtn);
      rowByTool.set(tool.key, row);
      pinBtnByTool.set(tool.key, starBtn);
      section.appendChild(row);
    }

    list.appendChild(section);
    updateActiveRows(activeTool);
    updateStarStates(group);
  };

  const renderMagnetMenu = () => {
    list.replaceChildren();
    rowByTool.clear();
    rowByMagnet.clear();
    pinBtnByTool.clear();

    const section = document.createElement("div");
    section.className = "price-kline-candle-type-menu-section";
    const activeMode = overlayModeToMagnetKey(getKlineOverlayDrawMode());

    for (const option of MAGNET_MODE_OPTIONS) {
      const label = getKlineDrawingToolLabel(getLocaleKeyForMagnet(option.key));

      const row = document.createElement("div");
      row.className = "price-kline-candle-type-row";
      row.dataset.mode = option.key;

      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "price-kline-candle-type-row-main price-kline-drawing-tool-row-main";
      selectBtn.setAttribute("role", "menuitemradio");

      const icon = iconCache.get(option.key);
      if (icon) {
        selectBtn.appendChild(cloneOverlayIcon(icon)!);
      }

      const labelEl = document.createElement("span");
      labelEl.className = "price-kline-candle-type-row-label";
      labelEl.textContent = label;
      selectBtn.appendChild(labelEl);

      selectBtn.addEventListener("click", () => {
        const mode = magnetKeyToOverlayMode(option.key);
        const klineChart = resolveDrawingChart(container);
        if (!klineChart) return;

        setKlineOverlayDrawMode(mode);
        klineChart.overrideOverlay({ mode });
        updateActiveRows(option.key);
        hideMenu();
      });

      row.appendChild(selectBtn);
      rowByMagnet.set(option.key, row);
      section.appendChild(row);
    }

    list.appendChild(section);
    updateActiveRows(activeMode === "normal" ? "" : activeMode);
  };

  const showMenu = (anchor: HTMLElement, group: DrawingToolGroup | null, magnet: boolean) => {
    if (performance.now() < suppressOpenUntil) return;

    hideMenu();
    openAnchor = anchor;
    openMagnetMenu = magnet;
    anchor.classList.add("price-kline-drawing-menu-open");
    anchor.querySelector(".icon-arrow")?.classList.add("rotate");

    syncMenuTheme(menu, container);
    if (magnet) {
      renderMagnetMenu();
    } else if (group) {
      renderToolMenu(group);
    }

    menu.setAttribute("aria-hidden", "false");
    positionMenu(menu, anchor);
    outsideCloseArmed = false;
    window.setTimeout(() => {
      outsideCloseArmed = true;
    }, 0);
  };

  const toggleMenu = (anchor: HTMLElement, group: DrawingToolGroup | null, magnet: boolean) => {
    if (menu.classList.contains("is-open") && openAnchor === anchor) {
      hideMenu();
      return;
    }
    showMenu(anchor, group, magnet);
  };

  const isMenuOpen = () => menu.classList.contains("is-open");

  const isOutsideMenu = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return true;
    if (menu.contains(target)) return false;
    if (target instanceof Element && target.closest(".price-kline-drawing-pins-shell")) return false;
    if (target instanceof Element && target.closest(".klinecharts-pro-drawing-bar")) return false;
    return true;
  };

  const onOutsidePointerDown = (event: PointerEvent) => {
    if (!outsideCloseArmed || !isMenuOpen() || !isOutsideMenu(event.target)) return;
    hideMenu();
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isMenuOpen()) {
      event.stopPropagation();
      hideMenu();
    }
  };

  window.addEventListener("pointerdown", onOutsidePointerDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);

  let detachBarListeners: (() => void) | null = null;
  let boundDrawingBar: HTMLElement | null = null;
  let iconsPrepared = false;
  let remountObserver: MutationObserver | null = null;
  let visibilityObserver: MutationObserver | null = null;
  let bindingInFlight = false;

  const ensureSidebar = (content: HTMLElement, drawingBar: HTMLElement) => {
    if (!drawingSidebar) {
      drawingSidebar = document.createElement("div");
      drawingSidebar.className = "price-kline-drawing-sidebar";

      pinsShell = document.createElement("div");
      pinsShell.className = "price-kline-drawing-pins-shell";
      pinsShell.setAttribute("aria-label", "Избранные инструменты");

      pinsHost = document.createElement("div");
      pinsHost.className = "price-kline-drawing-pins";
      pinsShell.appendChild(pinsHost);

      pinsResizeObserver?.disconnect();
      pinsResizeObserver = new ResizeObserver(() => {
        syncPinsHostLayout();
      });
      pinsResizeObserver.observe(drawingSidebar);

      void pinsStore.load().then(() => {
        if (disposed) return;
        renderToolbarPins();
        window.requestAnimationFrame(() => {
          if (!disposed) syncPinsHostLayout();
        });
      });
    }

    // Keep sidebar under the drawing-bar toggle (grid col 1), not inside chart content.
    if (drawingSidebar.parentElement !== container) {
      container.insertBefore(drawingSidebar, content);
    }
    if (!pinsShell?.parentElement) {
      drawingSidebar.prepend(pinsShell!);
    }
    if (drawingBar.parentElement !== drawingSidebar) {
      drawingSidebar.appendChild(drawingBar);
    }
    drawingSidebar.hidden = false;
  };

  const syncSidebarVisibility = () => {
    if (!drawingSidebar) return;
    const widget = container.querySelector<HTMLElement>(".klinecharts-pro-widget");
    const visible = widget?.getAttribute("data-drawing-bar-visible") !== "false";
    const hasBar = Boolean(drawingSidebar.querySelector(".klinecharts-pro-drawing-bar"));
    drawingSidebar.hidden = !visible || !hasBar;
  };

  const unbindDrawingBar = () => {
    hideMenu();
    detachBarListeners?.();
    detachBarListeners = null;
    boundDrawingBar = null;
  };

  const bindDrawingBar = async (drawingBar: HTMLElement) => {
    if (disposed || bindingInFlight) return;
    if (boundDrawingBar === drawingBar && drawingBar.isConnected) return;

    bindingInFlight = true;
    try {
      const sections = getDrawingBarSections(drawingBar);
      const { toolItems, magnetItem, lockItem, visibleItem, removeItem } = sections;
      if (toolItems.length < DRAWING_TOOL_GROUPS.length || !magnetItem) return;

      const content = container.querySelector<HTMLElement>(".klinecharts-pro-content");
      if (!content) return;

      unbindDrawingBar();
      container.classList.add("price-kline-drawing-custom");
      ensureSidebar(content, drawingBar);
      boundDrawingBar = drawingBar;

      if (!iconsPrepared) {
        for (let index = 0; index < DRAWING_TOOL_GROUPS.length; index += 1) {
          if (disposed) return;
          const group = DRAWING_TOOL_GROUPS[index]!;
          const item = toolItems[index];
          if (!item) continue;
          const groupCache = await cacheIconsFromNativeList(item, group.tools);
          if (disposed) return;
          for (const [key, svg] of groupCache) {
            iconCache.set(key, svg);
          }
        }

        if (disposed) return;
        const magnetCache = await cacheIconsFromNativeList(
          magnetItem,
          MAGNET_MODE_OPTIONS.map((option) => ({ key: option.key })),
        );
        if (disposed) return;
        for (const [key, svg] of magnetCache) {
          iconCache.set(key, svg);
        }
        iconsPrepared = true;
      }

      // After async icon cache, Pro may have remounted the bar — re-resolve live nodes.
      const liveBar =
        boundDrawingBar?.isConnected
          ? boundDrawingBar
          : container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
      if (!liveBar || disposed) return;
      if (liveBar !== drawingBar) {
        ensureSidebar(content, liveBar);
        boundDrawingBar = liveBar;
      }

      const liveSections = getDrawingBarSections(liveBar);
      const liveToolItems = liveSections.toolItems;
      const liveMagnet = liveSections.magnetItem;
      const liveLock = liveSections.lockItem;
      const liveVisible = liveSections.visibleItem;
      const liveRemove = liveSections.removeItem;
      if (liveToolItems.length < DRAWING_TOOL_GROUPS.length || !liveMagnet) return;

      for (let index = 0; index < DRAWING_TOOL_GROUPS.length; index += 1) {
        const group = DRAWING_TOOL_GROUPS[index]!;
        const item = liveToolItems[index];
        if (!item) continue;
        setGroupToolIcon(item, getSelectedTool(group), iconCache);
      }

      renderToolbarPins();

      liveMagnet.setAttribute("title", "Режим магнита");
      liveMagnet.setAttribute("aria-label", "Режим магнита");
      liveLock?.setAttribute(
        "title",
        drawingBarLock ? "Разблокировать фигуры" : "Заблокировать фигуры",
      );
      liveLock?.setAttribute(
        "aria-label",
        drawingBarLock ? "Разблокировать фигуры" : "Заблокировать фигуры",
      );
      liveLock?.setAttribute("aria-pressed", drawingBarLock ? "true" : "false");
      updateKlineOverlayLockButtonUi(container, drawingBarLock);
      liveVisible?.setAttribute("title", "Показать или скрыть фигуры");
      liveVisible?.setAttribute("aria-label", "Показать или скрыть фигуры");
      liveRemove?.setAttribute("title", "Удалить все фигуры");
      liveRemove?.setAttribute("aria-label", "Удалить все фигуры");

      const onLockClick = () => {
        drawingBarLock = !drawingBarLock;
        setKlineOverlaysLocked(drawingBarLock);
        updateKlineOverlayLockButtonUi(container, drawingBarLock);
        const klineChart = resolveDrawingChart(container);
        if (klineChart) {
          syncKlineOverlaysLock(klineChart);
        }
      };
      const onVisibleClick = () => {
        drawingBarVisible = !drawingBarVisible;
      };
      const onRemoveAllClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const klineChart = resolveDrawingChart(container);
        if (!klineChart) return;
        clearAllKlineOverlays(klineChart);
      };

      liveLock?.addEventListener("click", onLockClick, true);
      liveVisible?.addEventListener("click", onVisibleClick, true);
      liveRemove?.addEventListener("click", onRemoveAllClick, true);

      const onDrawingBarClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const item = target.closest<HTMLElement>(".item");
        if (!item || !liveBar.contains(item)) return;

        const arrow = target.closest(".icon-arrow");
        if (arrow) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (item === liveMagnet) {
            toggleMenu(item, null, true);
            return;
          }

          const groupIndex = liveToolItems.indexOf(item);
          if (groupIndex < 0) return;
          const group = DRAWING_TOOL_GROUPS[groupIndex];
          if (!group) return;
          toggleMenu(item, group, false);
          return;
        }

        const iconHost = item.querySelector<HTMLElement>(":scope > span:first-child");
        const groupIndex = liveToolItems.indexOf(item);
        if (groupIndex < 0) return;
        if (!iconHost || (target !== iconHost && !iconHost.contains(target))) return;

        const group = DRAWING_TOOL_GROUPS[groupIndex];
        if (!group) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const toolKey = getSelectedTool(group);
        createOverlayTool(toolKey, DRAWING_TOOLS_GROUP_ID);
      };

      const onDrawingBarMouseDown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(".icon-arrow")) return;
        event.preventDefault();
        event.stopPropagation();
      };

      liveBar.addEventListener("click", onDrawingBarClick, true);
      liveBar.addEventListener("mousedown", onDrawingBarMouseDown, true);

      detachBarListeners = () => {
        liveBar.removeEventListener("click", onDrawingBarClick, true);
        liveBar.removeEventListener("mousedown", onDrawingBarMouseDown, true);
        liveLock?.removeEventListener("click", onLockClick, true);
        liveVisible?.removeEventListener("click", onVisibleClick, true);
        liveRemove?.removeEventListener("click", onRemoveAllClick, true);
      };

      syncSidebarVisibility();
      window.requestAnimationFrame(() => {
        if (!disposed) {
          syncPinsHostLayout();
          resolveKlineChartFromProContainer(container)?.resize();
        }
      });
    } finally {
      bindingInFlight = false;
    }
  };

  const tryBindCurrentBar = () => {
    if (disposed) return;
    const drawingBar = container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
    if (!drawingBar) {
      syncSidebarVisibility();
      return;
    }
    void bindDrawingBar(drawingBar);
  };

  const attach = () => {
    if (disposed) return;

    const drawingBar = container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
    const content = container.querySelector<HTMLElement>(".klinecharts-pro-content");
    const widget = container.querySelector<HTMLElement>(".klinecharts-pro-widget");
    if (!drawingBar || !content) {
      rafId = window.requestAnimationFrame(attach);
      return;
    }

    const { toolItems, magnetItem } = getDrawingBarSections(drawingBar);
    if (toolItems.length < DRAWING_TOOL_GROUPS.length || !magnetItem) {
      rafId = window.requestAnimationFrame(attach);
      return;
    }

    void bindDrawingBar(drawingBar);

    remountObserver?.disconnect();
    remountObserver = new MutationObserver(() => {
      if (disposed) return;
      const nextBar = container.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
      if (!nextBar) {
        unbindDrawingBar();
        syncSidebarVisibility();
        return;
      }
      if (nextBar !== boundDrawingBar || nextBar.parentElement !== drawingSidebar) {
        void bindDrawingBar(nextBar);
      }
    });
    remountObserver.observe(container, { childList: true, subtree: true });

    visibilityObserver?.disconnect();
    if (widget) {
      visibilityObserver = new MutationObserver(() => {
        syncSidebarVisibility();
        tryBindCurrentBar();
      });
      visibilityObserver.observe(widget, {
        attributes: true,
        attributeFilter: ["data-drawing-bar-visible"],
      });
    }
  };

  void attach();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    remountObserver?.disconnect();
    remountObserver = null;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    void pinsStore.flush();
    pinsStore.dispose();
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    unbindDrawingBar();
    pinsResizeObserver?.disconnect();
    pinsResizeObserver = null;
    if (drawingSidebar) {
      const liveBar = drawingSidebar.querySelector<HTMLElement>(".klinecharts-pro-drawing-bar");
      const contentEl = container.querySelector<HTMLElement>(".klinecharts-pro-content");
      if (liveBar && contentEl) {
        contentEl.insertBefore(liveBar, contentEl.firstChild);
      }
      drawingSidebar.remove();
    }
    drawingSidebar = null;
    pinsShell = null;
    pinsHost = null;
    hideMenu();
    container.classList.remove("price-kline-drawing-custom");
    menu.remove();
  };
}
