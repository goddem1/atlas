import type { ChartPro } from "@klinecharts/pro";
import { CandleType } from "klinecharts";
import { isDashboardDarkTheme } from "./candleKlineUtils";
import { resolveKlineMenuHost } from "./priceKlineMenuHost";

const STORAGE_KEY = "atlas.price-kline-candle-type.v1";
const PINS_STORAGE_KEY = "atlas.price-kline-candle-pins.v2";
const MENU_SUPPRESS_MS = 120;

export type KlineChartVisualType = CandleType | "line";

type ChartTypeOption = {
  id: KlineChartVisualType;
  candleType: CandleType;
  label: string;
  icon: string;
  lineOnly?: boolean;
};

type ChartTypeSection = {
  options: ChartTypeOption[];
};

const STAR_OUTLINE_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;
const STAR_FILLED_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="currentColor" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;
const ARROW_DOWN_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-more-icon"><path d="M4 8L11.9281 15.7789" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12.0713 16L19.9994 8.22112" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const INLINE_ICONS = {
  bars: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-icon"><path d="M8.5 5.5V7.5M8.5 19V17M8.5 17H5.5M8.5 17V7.5M8.5 7.5H11.5M15.5 18.5V15.5M15.5 4.5V11M15.5 11H12.5M15.5 11V15.5M15.5 15.5H18.5" stroke="currentColor"/></svg>`,
  japanese: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-icon"><path d="M8.5 3V6M8.5 6H11V18H8.5M8.5 6H6V18H8.5M8.5 21V18M16 6V8.5M16 8.5H18V15.5H16M16 8.5H14V15.5H16M16 15.5V18" stroke="currentColor"/></svg>`,
  hollow: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-icon"><path d="M8.5 3V6M8.5 6H11V8M8.5 6H6V8M8.5 6V7.5M8.5 21V18M8.5 18H11V16M8.5 18H6V16M8.5 18V16.5M16 6V8.5M16 8.5H18V15.5H16M16 8.5H14V15.5H16M16 15.5V18M6 16H8M6 16V14M11 16H9M11 16V14M11 14H9M11 14V12M11 12H9M11 12V10M11 10H9M11 10V8M11 8H9M6 14H8M6 14V12M6 12H8M6 12V10M6 10H8M6 10V8M6 8H8" stroke="currentColor"/><path d="M8.5 8.5L8.5 9.5" stroke="currentColor"/><path d="M8.5 10.5V11.5" stroke="currentColor"/><path d="M8.5 12.5V13.5" stroke="currentColor"/><path d="M8.5 14.5V15.5" stroke="currentColor"/></svg>`,
  line: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-icon"><path d="M3 17L9.5 10L13.5 14.5L20.5 7" stroke="currentColor"/></svg>`,
  area: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-icon"><path d="M3.5 16L10 9L14 13.5L21 6" stroke="currentColor"/><path d="M3 19H21" stroke="currentColor" stroke-dasharray="1 1"/></svg>`,
} as const;

const ICON = {
  bars: INLINE_ICONS.bars,
  japanese: INLINE_ICONS.japanese,
  hollow: INLINE_ICONS.hollow,
  line: INLINE_ICONS.line,
  area: INLINE_ICONS.area,
} as const;

const CHART_TYPE_SECTIONS: ChartTypeSection[] = [
  {
    options: [
      {
        id: CandleType.Ohlc,
        candleType: CandleType.Ohlc,
        label: "Бары",
        icon: ICON.bars,
      },
      {
        id: CandleType.CandleSolid,
        candleType: CandleType.CandleSolid,
        label: "Японские свечи",
        icon: ICON.japanese,
      },
      {
        id: CandleType.CandleStroke,
        candleType: CandleType.CandleStroke,
        label: "Пустые свечи",
        icon: ICON.hollow,
      },
    ],
  },
  {
    options: [
      {
        id: "line",
        candleType: CandleType.Area,
        label: "Линия",
        icon: ICON.line,
        lineOnly: true,
      },
    ],
  },
  {
    options: [
      {
        id: CandleType.Area,
        candleType: CandleType.Area,
        label: "Область",
        icon: ICON.area,
      },
    ],
  },
];

const CHART_TYPE_OPTIONS: ChartTypeOption[] = CHART_TYPE_SECTIONS.flatMap((section) => section.options);

const MAX_PINNED = CHART_TYPE_OPTIONS.length;
const DEFAULT_PINNED: KlineChartVisualType[] = [
  CandleType.Ohlc,
  CandleType.CandleSolid,
  "line",
  CandleType.CandleStroke,
  CandleType.Area,
];

const DEFAULT_AREA_STYLE = {
  lineSize: 2,
  smooth: false,
  value: "close",
  backgroundColor: [
    { offset: 0, color: "rgba(22, 119, 255, 0.01)" },
    { offset: 1, color: "rgba(22, 119, 255, 0.2)" },
  ],
  point: {
    show: true,
    color: "#1677ff",
    radius: 4,
    rippleColor: "rgba(22, 119, 255, 0.3)",
    rippleRadius: 8,
    animation: true,
    animationDuration: 1000,
  },
} as const;

function isVisualType(value: unknown): value is KlineChartVisualType {
  return typeof value === "string" && CHART_TYPE_OPTIONS.some((option) => option.id === value);
}

function getOption(visualType: KlineChartVisualType): ChartTypeOption {
  return CHART_TYPE_OPTIONS.find((option) => option.id === visualType) ?? CHART_TYPE_OPTIONS[0]!;
}

function normalizePinnedTypes(types: KlineChartVisualType[]): KlineChartVisualType[] {
  const seen = new Set<KlineChartVisualType>();
  const result: KlineChartVisualType[] = [];
  for (const type of types) {
    if (!isVisualType(type) || seen.has(type)) continue;
    seen.add(type);
    result.push(type);
    if (result.length >= MAX_PINNED) break;
  }
  if (result.length === 0) return [...DEFAULT_PINNED];
  return result;
}

export function loadPinnedKlineCandleTypes(): KlineChartVisualType[] {
  try {
    const raw = localStorage.getItem(PINS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_PINNED];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PINNED];
    return normalizePinnedTypes(parsed.filter(isVisualType));
  } catch {
    return [...DEFAULT_PINNED];
  }
}

function savePinnedKlineCandleTypes(types: KlineChartVisualType[]): void {
  try {
    localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(normalizePinnedTypes(types)));
  } catch {
    // ignore quota / private mode
  }
}

export function loadStoredKlineCandleType(): KlineChartVisualType | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return isVisualType(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveStoredKlineCandleType(type: KlineChartVisualType): void {
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch {
    // ignore quota / private mode
  }
}

export function applyKlineCandleType(chart: ChartPro, visualType: KlineChartVisualType): void {
  const option = getOption(visualType);

  if (option.lineOnly) {
    chart.setStyles({
      candle: {
        type: CandleType.Area,
        area: {
          backgroundColor: "transparent",
          point: { show: false },
        },
      },
    });
  } else if (option.candleType === CandleType.Area) {
    chart.setStyles({
      candle: {
        type: CandleType.Area,
        area: { ...DEFAULT_AREA_STYLE },
      },
    });
  } else {
    chart.setStyles({
      candle: { type: option.candleType },
    });
  }

  saveStoredKlineCandleType(option.id);
}

export function getKlineCandleType(chart: ChartPro): KlineChartVisualType {
  const stored = loadStoredKlineCandleType();
  if (stored) return stored;

  const type = chart.getStyles().candle?.type;
  return isVisualType(type) ? type : CandleType.CandleSolid;
}

function getChartTheme(container: HTMLElement): "dark" | "light" {
  const theme = container.querySelector(".klinecharts-pro")?.getAttribute("data-theme");
  if (theme === "light" || theme === "dark") return theme;
  return isDashboardDarkTheme() ? "dark" : "light";
}

function syncMenuTheme(menu: HTMLElement, container: HTMLElement): void {
  menu.dataset.theme = getChartTheme(container);
}

function renderTypeIcon(iconMarkup: string, label: string): string {
  return `${iconMarkup}<span class="price-kline-candle-type-sr-only">${label}</span>`;
}

function positionMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  menu.style.visibility = "hidden";
  menu.classList.add("is-open");

  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  // Левый край меню — по левому краю стрелки-триггера.
  let left = rect.left;
  let top = rect.bottom + pad;

  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - width - pad);
  }
  if (left < pad) left = pad;
  if (top + height > window.innerHeight - pad) {
    top = Math.max(pad, rect.top - height - pad);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

export function attachKlineCandleTypeControl(params: {
  container: HTMLElement;
  chart: ChartPro;
}): () => void {
  const { container, chart } = params;
  let disposed = false;
  let rafId = 0;
  let suppressOpenUntil = 0;
  let toolbarGroup: HTMLDivElement | null = null;
  let pinsHost: HTMLDivElement | null = null;
  let moreBtn: HTMLButtonElement | null = null;
  let pinnedTypes = loadPinnedKlineCandleTypes();

  const menu = document.createElement("div");
  menu.className = "price-kline-candle-type-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  syncMenuTheme(menu, container);

  const list = document.createElement("div");
  list.className = "price-kline-candle-type-menu-list";
  menu.appendChild(list);

  const rowByType = new Map<KlineChartVisualType, HTMLDivElement>();
  const pinBtnByType = new Map<KlineChartVisualType, HTMLButtonElement>();
  const toolbarPinBtns = new Map<KlineChartVisualType, HTMLButtonElement>();

  const updateActiveState = (activeType: KlineChartVisualType) => {
    for (const [type, button] of toolbarPinBtns) {
      button.classList.toggle("is-active", type === activeType);
    }
    for (const [type, row] of rowByType) {
      row.classList.toggle("is-active", type === activeType);
    }
  };

  const updateStarStates = () => {
    const pinnedSet = new Set(pinnedTypes);
    for (const [type, starBtn] of pinBtnByType) {
      const isPinned = pinnedSet.has(type);
      starBtn.classList.toggle("is-pinned", isPinned);
      starBtn.innerHTML = isPinned ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
      starBtn.setAttribute("aria-label", isPinned ? "Убрать с панели" : "Закрепить на панели");
      starBtn.setAttribute("title", isPinned ? "Убрать с панели" : "Закрепить на панели");
    }
  };

  const renderToolbarPins = () => {
    if (!pinsHost) return;
    pinsHost.replaceChildren();
    toolbarPinBtns.clear();

    for (const type of pinnedTypes) {
      const option = getOption(type);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "price-kline-candle-type-pin-btn";
      button.dataset.type = type;
      button.setAttribute("title", option.label);
      button.setAttribute("aria-label", option.label);
      button.innerHTML = renderTypeIcon(option.icon, option.label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyKlineCandleType(chart, type);
        updateActiveState(type);
      });
      toolbarPinBtns.set(type, button);
      pinsHost.appendChild(button);
    }
  };

  const togglePin = (type: KlineChartVisualType) => {
    const pinnedSet = new Set(pinnedTypes);
    if (pinnedSet.has(type)) {
      if (pinnedTypes.length <= 1) return;
      pinnedTypes = pinnedTypes.filter((item) => item !== type);
    } else if (pinnedTypes.length >= MAX_PINNED) {
      return;
    } else {
      pinnedTypes = [...pinnedTypes, type];
    }

    pinnedTypes = normalizePinnedTypes(pinnedTypes);
    savePinnedKlineCandleTypes(pinnedTypes);
    renderToolbarPins();
    updateStarStates();
    updateActiveState(getKlineCandleType(chart));
  };

  let outsideCloseArmed = false;
  resolveKlineMenuHost(container).appendChild(menu);

  const hideMenu = () => {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menu.style.removeProperty("visibility");
    outsideCloseArmed = false;
    suppressOpenUntil = performance.now() + MENU_SUPPRESS_MS;
  };

  const renderMenuList = () => {
    list.replaceChildren();
    rowByType.clear();
    pinBtnByType.clear();

    for (const section of CHART_TYPE_SECTIONS) {
      const sectionEl = document.createElement("div");
      sectionEl.className = "price-kline-candle-type-menu-section";

      for (const option of section.options) {
        const row = document.createElement("div");
        row.className = "price-kline-candle-type-row";
        row.dataset.type = option.id;

        const selectBtn = document.createElement("button");
        selectBtn.type = "button";
        selectBtn.className = "price-kline-candle-type-row-main";
        selectBtn.setAttribute("role", "menuitemradio");
        selectBtn.innerHTML = `
          ${renderTypeIcon(option.icon, option.label)}
          <span class="price-kline-candle-type-row-label">${option.label}</span>
        `;
        selectBtn.addEventListener("click", () => {
          applyKlineCandleType(chart, option.id);
          updateActiveState(option.id);
          hideMenu();
        });

        const starBtn = document.createElement("button");
        starBtn.type = "button";
        starBtn.className = "price-kline-candle-type-star";
        starBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePin(option.id);
        });

        row.append(selectBtn, starBtn);
        rowByType.set(option.id, row);
        pinBtnByType.set(option.id, starBtn);
        sectionEl.appendChild(row);
      }

      list.appendChild(sectionEl);
    }

    updateStarStates();
    updateActiveState(getKlineCandleType(chart));
  };

  renderMenuList();

  const isMenuOpen = () => menu.classList.contains("is-open");

  const showMenu = () => {
    if (performance.now() < suppressOpenUntil) return;
    syncMenuTheme(menu, container);
    pinnedTypes = loadPinnedKlineCandleTypes();
    renderToolbarPins();
    updateStarStates();
    updateActiveState(getKlineCandleType(chart));
    menu.setAttribute("aria-hidden", "false");
    const anchor = moreBtn ?? toolbarGroup;
    if (anchor) positionMenu(menu, anchor);
    outsideCloseArmed = false;
    window.setTimeout(() => {
      outsideCloseArmed = true;
    }, 0);
  };

  const toggleMenu = () => {
    if (isMenuOpen()) {
      hideMenu();
      return;
    }
    showMenu();
  };

  const isOutsideMenu = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return true;
    if (menu.contains(target)) return false;
    if (toolbarGroup?.contains(target)) return false;
    return true;
  };

  const onOutsidePointerDown = (event: PointerEvent) => {
    if (!outsideCloseArmed || !isMenuOpen() || !isOutsideMenu(event.target)) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    hideMenu();
  };

  const onOutsideMouseDown = (event: MouseEvent) => {
    if (!outsideCloseArmed || !isMenuOpen() || !isOutsideMenu(event.target)) return;
    if (
      event.target instanceof Element &&
      (event.target.closest(".klinecharts-pro-drawing-bar") ||
        event.target.closest(".price-kline-drawing-pins-shell"))
    ) {
      return;
    }
    hideMenu();
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isMenuOpen()) {
      event.stopPropagation();
      hideMenu();
    }
  };

  window.addEventListener("pointerdown", onOutsidePointerDown, true);
  window.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);

  const attachToolbar = () => {
    if (disposed || toolbarGroup) return;

    const bar = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar");
    if (!bar) {
      rafId = window.requestAnimationFrame(attachToolbar);
      return;
    }

    toolbarGroup = document.createElement("div");
    toolbarGroup.className =
      "item tools price-kline-candle-type-toolbar price-kline-period-icon-btn";

    pinsHost = document.createElement("div");
    pinsHost.className = "price-kline-candle-type-toolbar-pins";

    moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "price-kline-candle-type-more-btn";
    moreBtn.setAttribute("title", "Все типы графика");
    moreBtn.setAttribute("aria-label", "Все типы графика");
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.innerHTML = ARROW_DOWN_SVG;

    moreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });

    toolbarGroup.append(pinsHost, moreBtn);

    const indicatorToolbar = bar.querySelector<HTMLElement>(".price-kline-indicator-toolbar");
    const periods = [...bar.querySelectorAll<HTMLElement>(":scope > .period, :scope > .price-kline-period-block--period .period")];
    const lastPeriod = periods[periods.length - 1] ?? null;

    if (indicatorToolbar) {
      indicatorToolbar.insertAdjacentElement("beforebegin", toolbarGroup);
    } else if (lastPeriod) {
      lastPeriod.insertAdjacentElement("afterend", toolbarGroup);
    } else {
      bar.appendChild(toolbarGroup);
    }

    renderToolbarPins();
    updateStarStates();
    updateActiveState(getKlineCandleType(chart));
  };

  attachToolbar();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("mousedown", onOutsideMouseDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    hideMenu();
    toolbarGroup?.remove();
    toolbarGroup = null;
    pinsHost = null;
    moreBtn = null;
    menu.remove();
  };
}
