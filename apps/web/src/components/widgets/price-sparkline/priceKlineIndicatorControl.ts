import type { ChartPro } from "@klinecharts/pro";
import type { Chart } from "klinecharts";
import { isDashboardDarkTheme } from "./candleKlineUtils";
import {
  getKlineIndicatorLabel,
  getKlineIndicatorRuDescription,
  KLINE_INDICATOR_NAMES,
  type KlineIndicatorName,
} from "./priceKlineLocaleRu";
import {
  collectKlineIndicators,
  persistActiveKlineIndicators,
  type StoredKlineIndicators,
} from "./priceKlineIndicatorPersistence";
import { resolveKlineChartFromProContainer } from "./priceKlineOverlayPersistence";
import { resolveKlineMenuHost } from "./priceKlineMenuHost";

const FAVORITES_STORAGE_KEY = "atlas.price-kline-indicator-favorites.v1";
const MENU_SUPPRESS_MS = 120;
const CANDLE_PANE_ID = "candle_pane";
const X_AXIS_PANE_ID = "x_axis_pane";
const MAIN_INDICATORS = new Set<KlineIndicatorName>(["MA", "EMA", "SMA", "BOLL", "SAR", "BBI"]);
const DEFAULT_FAVORITES: KlineIndicatorName[] = ["MA", "RSI", "MACD", "VOL"];
const INDICATOR_LABELS = new Set(["indicator", "индикатор"]);

const STAR_OUTLINE_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;
const STAR_FILLED_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" class="price-kline-candle-type-star-icon"><path fill="currentColor" d="M9 2.2 10.9 6.5l4.6.4-3.5 3 1.1 4.5L9 12.4 4.9 14.4l1.1-4.5-3.5-3 4.6-.4L9 2.2Z"/></svg>`;
const ARROW_DOWN_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="price-kline-candle-type-more-icon"><path d="M4 8L11.9281 15.7789" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12.0713 16L19.9994 8.22112" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

type ChartInternal = Chart & {
  _drawPanes?: Array<{ getId: () => string }>;
  _chartStore?: {
    getIndicatorStore: () => {
      getInstances: (paneId: string) => Array<{ name: string }>;
    };
  };
};

function isIndicatorName(value: unknown): value is KlineIndicatorName {
  return typeof value === "string" && KLINE_INDICATOR_NAMES.includes(value as KlineIndicatorName);
}

function normalizeFavorites(names: KlineIndicatorName[]): KlineIndicatorName[] {
  const seen = new Set<KlineIndicatorName>();
  const result: KlineIndicatorName[] = [];
  for (const name of names) {
    if (!isIndicatorName(name) || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  if (result.length === 0) return [...DEFAULT_FAVORITES];
  return result;
}

export function loadFavoriteKlineIndicators(): KlineIndicatorName[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_FAVORITES];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_FAVORITES];
    return normalizeFavorites(parsed.filter(isIndicatorName));
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

function saveFavoriteKlineIndicators(names: KlineIndicatorName[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalizeFavorites(names)));
  } catch {
    // ignore quota / private mode
  }
}

function getChart(container: HTMLElement): Chart | null {
  return resolveKlineChartFromProContainer(container);
}

function getIndicatorStore(chart: Chart) {
  return (chart as ChartInternal)._chartStore?.getIndicatorStore?.() ?? null;
}

function findSubPaneId(chart: Chart, name: string): string | null {
  const store = getIndicatorStore(chart);
  if (!store) return null;
  for (const pane of (chart as ChartInternal)._drawPanes ?? []) {
    const paneId = pane.getId();
    if (paneId === CANDLE_PANE_ID || paneId === X_AXIS_PANE_ID) continue;
    if (store.getInstances(paneId).some((item) => item.name === name)) return paneId;
  }
  return null;
}

function isIndicatorActive(name: string, state: StoredKlineIndicators | null): boolean {
  if (!state) return false;
  return state.main.some((item) => item.name === name) || state.sub.some((item) => item.name === name);
}

function indicatorPaneOptions(name: string) {
  if (name !== "VOL") return undefined;
  return { gap: { bottom: 2 } };
}

async function addIndicator(chart: Chart, name: string): Promise<void> {
  const paneOptions = indicatorPaneOptions(name);
  if (MAIN_INDICATORS.has(name as KlineIndicatorName)) {
    await chart.createIndicator({ name }, true, { id: CANDLE_PANE_ID, ...paneOptions });
    return;
  }
  await chart.createIndicator({ name }, false, paneOptions);
}

function removeIndicator(chart: Chart, name: string): void {
  if (getIndicatorStore(chart)?.getInstances(CANDLE_PANE_ID).some((item) => item.name === name)) {
    chart.removeIndicator(CANDLE_PANE_ID, name);
    return;
  }
  const paneId = findSubPaneId(chart, name);
  if (paneId) chart.removeIndicator(paneId, name);
}

async function toggleIndicatorOnChart(container: HTMLElement, name: KlineIndicatorName): Promise<void> {
  const chart = getChart(container);
  if (!chart) return;
  const state = collectKlineIndicators(chart);
  if (isIndicatorActive(name, state)) {
    removeIndicator(chart, name);
  } else {
    await addIndicator(chart, name);
  }
  persistActiveKlineIndicators({ immediate: true });
}

function getChartTheme(container: HTMLElement): "dark" | "light" {
  const theme = container.querySelector(".klinecharts-pro")?.getAttribute("data-theme");
  if (theme === "light" || theme === "dark") return theme;
  return isDashboardDarkTheme() ? "dark" : "light";
}

function syncMenuTheme(menu: HTMLElement, container: HTMLElement): void {
  menu.dataset.theme = getChartTheme(container);
}

function findIndicatorToolbarItem(bar: HTMLElement): HTMLElement | null {
  for (const item of bar.querySelectorAll<HTMLElement>(".item.tools")) {
    if (item.classList.contains("price-kline-indicator-toolbar")) continue;
    if (item.classList.contains("price-kline-candle-type-toolbar")) continue;
    const label = item.querySelector("span")?.textContent?.trim().toLowerCase() ?? "";
    if (INDICATOR_LABELS.has(label)) return item;
  }
  return bar.querySelector<HTMLElement>(".item.tools");
}

function hideBuiltInIndicatorModal(container: HTMLElement): void {
  for (const modal of container.querySelectorAll<HTMLElement>(".klinecharts-pro-modal")) {
    if (modal.querySelector(".klinecharts-pro-indicator-modal-list")) {
      modal.style.display = "none";
    }
  }
}

function positionMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  menu.style.visibility = "hidden";
  menu.classList.add("is-open");

  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
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

function indicatorSections(): Array<{ names: KlineIndicatorName[] }> {
  const main: KlineIndicatorName[] = [];
  const sub: KlineIndicatorName[] = [];
  for (const name of KLINE_INDICATOR_NAMES) {
    if (MAIN_INDICATORS.has(name)) main.push(name);
    else sub.push(name);
  }
  return [{ names: main }, { names: sub }];
}

export function attachKlineIndicatorControl(params: {
  container: HTMLElement;
  chart: ChartPro;
}): () => void {
  const { container } = params;
  let disposed = false;
  let rafId = 0;
  let suppressOpenUntil = 0;
  let toolbarGroup: HTMLDivElement | null = null;
  let favoritesHost: HTMLDivElement | null = null;
  let moreBtn: HTMLButtonElement | null = null;
  let iconBtn: HTMLButtonElement | null = null;
  let builtInIndicatorItem: HTMLElement | null = null;
  let favoriteNames = loadFavoriteKlineIndicators();

  const menu = document.createElement("div");
  menu.className = "price-kline-candle-type-menu price-kline-indicator-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  syncMenuTheme(menu, container);

  const list = document.createElement("div");
  list.className = "price-kline-candle-type-menu-list";
  menu.appendChild(list);
  let outsideCloseArmed = false;
  resolveKlineMenuHost(container).appendChild(menu);

  const rowByName = new Map<KlineIndicatorName, HTMLDivElement>();
  const starBtnByName = new Map<KlineIndicatorName, HTMLButtonElement>();
  const favoriteBtns = new Map<KlineIndicatorName, HTMLButtonElement>();

  const updateFavoriteButtons = () => {
    const chart = getChart(container);
    const state = chart ? collectKlineIndicators(chart) : null;
    const favoriteSet = new Set(favoriteNames);
    for (const [name, button] of favoriteBtns) {
      button.classList.toggle("is-active", isIndicatorActive(name, state));
    }
    for (const [name, starBtn] of starBtnByName) {
      const isFavorite = favoriteSet.has(name);
      starBtn.classList.toggle("is-pinned", isFavorite);
      starBtn.classList.toggle("is-disabled", isFavorite && favoriteNames.length <= 1);
      starBtn.innerHTML = isFavorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
      starBtn.setAttribute(
        "aria-label",
        isFavorite ? "Убрать с панели" : "Закрепить на панели",
      );
      starBtn.setAttribute("title", isFavorite ? "Убрать с панели" : "Закрепить на панели");
    }
    for (const [name, row] of rowByName) {
      row.classList.toggle("is-active", isIndicatorActive(name, state));
    }
  };

  const renderFavoriteToolbar = () => {
    if (!favoritesHost) return;
    favoritesHost.replaceChildren();
    favoriteBtns.clear();
    for (const name of favoriteNames) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "price-kline-indicator-fav-btn";
      button.textContent = name;
      button.setAttribute("title", getKlineIndicatorLabel(name));
      button.setAttribute("aria-label", getKlineIndicatorLabel(name));
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleIndicatorOnChart(container, name);
        updateFavoriteButtons();
      });
      favoriteBtns.set(name, button);
      favoritesHost.appendChild(button);
    }
  };

  const toggleFavorite = (name: KlineIndicatorName) => {
    const favoriteSet = new Set(favoriteNames);
    if (favoriteSet.has(name)) {
      if (favoriteNames.length <= 1) return;
      favoriteNames = favoriteNames.filter((item) => item !== name);
    } else {
      favoriteNames = [...favoriteNames, name];
    }
    favoriteNames = normalizeFavorites(favoriteNames);
    persistAndRefreshFavorites();
  };

  const persistAndRefreshFavorites = () => {
    saveFavoriteKlineIndicators(favoriteNames);
    renderFavoriteToolbar();
    updateFavoriteButtons();
  };

  const hideMenu = () => {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menu.style.removeProperty("visibility");
    outsideCloseArmed = false;
    suppressOpenUntil = performance.now() + MENU_SUPPRESS_MS;
  };

  const renderMenuList = () => {
    list.replaceChildren();
    rowByName.clear();
    starBtnByName.clear();

    for (const section of indicatorSections()) {
      const sectionEl = document.createElement("div");
      sectionEl.className = "price-kline-candle-type-menu-section";

      for (const name of section.names) {
        const label = getKlineIndicatorLabel(name);
        const description = getKlineIndicatorRuDescription(name);
        const row = document.createElement("div");
        row.className = "price-kline-candle-type-row";
        row.dataset.name = name;

        const selectBtn = document.createElement("button");
        selectBtn.type = "button";
        selectBtn.className = "price-kline-candle-type-row-main";
        selectBtn.setAttribute("role", "menuitemcheckbox");
        selectBtn.setAttribute("title", label);
        selectBtn.innerHTML = description
          ? `<span class="price-kline-indicator-row-code">${name}</span><span class="price-kline-indicator-row-desc">${description}</span>`
          : `<span class="price-kline-indicator-row-code">${name}</span>`;
        selectBtn.addEventListener("click", async () => {
          await toggleIndicatorOnChart(container, name);
          updateFavoriteButtons();
        });

        const starBtn = document.createElement("button");
        starBtn.type = "button";
        starBtn.className = "price-kline-candle-type-star";
        starBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(name);
        });

        row.append(selectBtn, starBtn);
        rowByName.set(name, row);
        starBtnByName.set(name, starBtn);
        sectionEl.appendChild(row);
      }

      list.appendChild(sectionEl);
    }

    updateFavoriteButtons();
  };

  renderMenuList();

  const isMenuOpen = () => menu.classList.contains("is-open");

  const showMenu = () => {
    if (performance.now() < suppressOpenUntil) return;
    hideBuiltInIndicatorModal(container);
    syncMenuTheme(menu, container);
    favoriteNames = loadFavoriteKlineIndicators();
    renderFavoriteToolbar();
    updateFavoriteButtons();
    menu.setAttribute("aria-hidden", "false");
    const anchor = moreBtn ?? iconBtn ?? toolbarGroup;
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
    hideMenu();
  };

  const onOutsideMouseDown = (event: MouseEvent) => {
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
  window.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);

  const blockBuiltInIndicatorClick = (event: Event) => {
    if (!builtInIndicatorItem) return;
    if (!(event.target instanceof Node) || !builtInIndicatorItem.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    hideBuiltInIndicatorModal(container);
    toggleMenu();
  };

  const attachToolbar = () => {
    if (disposed || toolbarGroup) return;
    const barEl = container.querySelector(".klinecharts-pro-period-bar");
    const bar = barEl instanceof HTMLElement ? barEl : null;
    const sourceItem = bar ? findIndicatorToolbarItem(bar) : null;
    if (!bar || !sourceItem) {
      rafId = window.requestAnimationFrame(attachToolbar);
      return;
    }

    builtInIndicatorItem = sourceItem;
    builtInIndicatorItem.style.display = "none";
    builtInIndicatorItem.addEventListener("click", blockBuiltInIndicatorClick, true);

    const iconMarkup = sourceItem.querySelector("svg")?.outerHTML ?? "";
    toolbarGroup = document.createElement("div");
    toolbarGroup.className = "item tools price-kline-indicator-toolbar price-kline-period-icon-btn";

    iconBtn = document.createElement("button");
    iconBtn.type = "button";
    iconBtn.className = "price-kline-indicator-icon-btn";
    iconBtn.setAttribute("title", "Индикаторы");
    iconBtn.setAttribute("aria-label", "Индикаторы");
    iconBtn.innerHTML = iconMarkup;
    iconBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });

    favoritesHost = document.createElement("div");
    favoritesHost.className = "price-kline-indicator-toolbar-favorites";

    moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "price-kline-indicator-more-btn";
    moreBtn.setAttribute("title", "Все индикаторы");
    moreBtn.setAttribute("aria-label", "Все индикаторы");
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.innerHTML = ARROW_DOWN_SVG;
    moreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });

    toolbarGroup.append(iconBtn, favoritesHost, moreBtn);
    sourceItem.insertAdjacentElement("afterend", toolbarGroup);

    renderFavoriteToolbar();
    updateFavoriteButtons();

    const observer = new MutationObserver(() => hideBuiltInIndicatorModal(container));
    observer.observe(container, { childList: true, subtree: true });
    (toolbarGroup as HTMLDivElement & { _observer?: MutationObserver })._observer = observer;
  };

  attachToolbar();

  const refreshTimer = window.setInterval(() => {
    if (!disposed) updateFavoriteButtons();
  }, 800);

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    window.clearInterval(refreshTimer);
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("mousedown", onOutsideMouseDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    builtInIndicatorItem?.removeEventListener("click", blockBuiltInIndicatorClick, true);
    if (builtInIndicatorItem) builtInIndicatorItem.style.display = "";
    const observer = (toolbarGroup as (HTMLDivElement & { _observer?: MutationObserver }) | null)?._observer;
    observer?.disconnect();
    hideMenu();
    toolbarGroup?.remove();
    menu.remove();
    toolbarGroup = null;
    favoritesHost = null;
    moreBtn = null;
    iconBtn = null;
    builtInIndicatorItem = null;
  };
}
