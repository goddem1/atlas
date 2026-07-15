type ToolbarItemState = {
  item: HTMLElement;
  parent: HTMLElement;
  nextSibling: ChildNode | null;
  className: string;
};

const ICON_TOOLBAR_CLASS = "price-kline-period-icon-btn";

const TIMEZONE_LABELS = new Set(["timezone", "часовой пояс"]);
const SETTING_LABELS = new Set(["setting", "настройки"]);
const SCREENSHOT_LABELS = new Set(["screenshot", "скриншот"]);
const FULLSCREEN_LABELS = new Set([
  "full screen",
  "exit",
  "на весь экран",
  "выйти",
]);

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
  <path d="M21 3L3 21M3 3L21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`.trim();

const LIST_TOGGLE_ARROW_SVG = `
<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
  <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`.trim();

function isCustomToolbarItem(item: HTMLElement): boolean {
  return (
    item.classList.contains("price-kline-candle-type-toolbar") ||
    item.classList.contains("price-kline-indicator-toolbar") ||
    item.classList.contains("price-kline-close-btn") ||
    item.classList.contains("price-kline-list-toggle-btn") ||
    item.classList.contains("price-kline-period-icon-btn")
  );
}

function findToolbarItemByLabels(bar: HTMLElement, labels: Set<string>): HTMLElement | null {
  for (const item of bar.querySelectorAll<HTMLElement>(".item.tools")) {
    if (isCustomToolbarItem(item)) continue;
    const label = item.querySelector("span")?.textContent?.trim().toLowerCase() ?? "";
    if (labels.has(label)) return item;
  }
  return null;
}

function findFullscreenToolbarItem(bar: HTMLElement): HTMLElement | null {
  const byLabel = findToolbarItemByLabels(bar, FULLSCREEN_LABELS);
  if (byLabel) return byLabel;

  const items = [...bar.querySelectorAll<HTMLElement>(".item.tools")].filter(
    (item) => !isCustomToolbarItem(item),
  );
  return items.at(-1) ?? null;
}

function prepareIconToolbarItem(params: {
  item: HTMLElement;
  className: string;
  title: string;
  ariaLabel: string;
}): ToolbarItemState {
  const { item, className, title, ariaLabel } = params;
  const state: ToolbarItemState = {
    item,
    parent: item.parentElement as HTMLElement,
    nextSibling: item.nextSibling,
    className,
  };

  for (const span of item.querySelectorAll("span")) {
    span.remove();
  }
  item.classList.add(ICON_TOOLBAR_CLASS, className);
  item.setAttribute("title", title);
  item.setAttribute("aria-label", ariaLabel);

  return state;
}

function restoreToolbarItem(state: ToolbarItemState | null) {
  if (!state) return;
  const { item, parent, nextSibling, className } = state;
  if (nextSibling) {
    parent.insertBefore(item, nextSibling);
  } else {
    parent.appendChild(item);
  }
  item.classList.remove(ICON_TOOLBAR_CLASS, className);
  item.removeAttribute("title");
  item.removeAttribute("aria-label");
}

function appendToActionsOrBar(bar: HTMLElement, item: HTMLElement): void {
  const actionsBlock = bar.querySelector<HTMLElement>(".price-kline-period-block--actions");
  if (actionsBlock) {
    actionsBlock.appendChild(item);
    return;
  }
  bar.appendChild(item);
}

function createCloseToolbarItem(onClose: () => void): HTMLElement {
  const item = document.createElement("div");
  item.className = `item tools ${ICON_TOOLBAR_CLASS} price-kline-close-btn`;
  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.setAttribute("title", "Закрыть график");
  item.setAttribute("aria-label", "Закрыть график");
  item.innerHTML = CLOSE_ICON_SVG;

  const activate = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  item.addEventListener("click", activate);
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  });

  return item;
}

function syncListToggleItem(item: HTMLElement, coinListOpen: boolean): void {
  const label = coinListOpen ? "Свернуть список" : "Развернуть список";
  item.classList.toggle("is-collapsed", !coinListOpen);
  item.setAttribute("aria-expanded", coinListOpen ? "true" : "false");
  item.setAttribute("title", label);
  item.setAttribute("aria-label", label);
  const labelEl = item.querySelector<HTMLElement>(".price-kline-list-toggle-label");
  if (labelEl) labelEl.textContent = label;
}

function createListToggleToolbarItem(params: {
  coinListOpen: boolean;
  onToggle: () => void;
}): HTMLElement {
  const item = document.createElement("div");
  item.className = "item tools price-kline-list-toggle-btn";
  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.innerHTML = `
    <span class="price-kline-list-toggle-label"></span>
    <span class="price-kline-list-toggle-arrow">${LIST_TOGGLE_ARROW_SVG}</span>
  `;
  syncListToggleItem(item, params.coinListOpen);

  const activate = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    params.onToggle();
  };

  item.addEventListener("click", activate);
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  });

  return item;
}

export type KlineScreenshotToolbarHandle = {
  syncCoinListOpen: (open: boolean) => void;
};

export function attachKlineScreenshotToolbar(params: {
  container: HTMLElement;
  onClose?: () => void;
  onToggleCoinList?: () => void;
  coinListOpen?: boolean;
  handleRef?: { current: KlineScreenshotToolbarHandle | null };
}): () => void {
  const { container, onClose, onToggleCoinList, coinListOpen = true, handleRef } = params;
  let disposed = false;
  let rafId = 0;
  let attempts = 0;
  const states: ToolbarItemState[] = [];
  let fullscreenState: ToolbarItemState | null = null;
  let closeItem: HTMLElement | null = null;
  let listToggleItem: HTMLElement | null = null;

  const updateFullscreenLabel = () => {
    if (!fullscreenState) return;
    const isFullscreen = Boolean(document.fullscreenElement);
    const label = isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран";
    fullscreenState.item.setAttribute("title", label);
    fullscreenState.item.setAttribute("aria-label", label);
  };

  const syncCoinListOpen = (open: boolean) => {
    if (!listToggleItem) return;
    syncListToggleItem(listToggleItem, open);
  };

  if (handleRef) {
    handleRef.current = { syncCoinListOpen };
  }

  const attach = () => {
    if (disposed || states.length > 0) return;

    const bar = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar");
    if (!bar) {
      rafId = window.requestAnimationFrame(attach);
      return;
    }

    const timezoneItem = findToolbarItemByLabels(bar, TIMEZONE_LABELS);
    const settingItem = findToolbarItemByLabels(bar, SETTING_LABELS);
    const fullscreenItem = findFullscreenToolbarItem(bar);
    const screenshotItem = findToolbarItemByLabels(bar, SCREENSHOT_LABELS);
    if (!timezoneItem || !settingItem || !fullscreenItem || !screenshotItem) {
      attempts += 1;
      // Не долбим rAF бесконечно — иначе можно заморозить UI.
      if (attempts < 180) {
        rafId = window.requestAnimationFrame(attach);
      }
      return;
    }

    const configs = [
      {
        item: timezoneItem,
        className: "price-kline-timezone-btn",
        title: "Часовой пояс",
        ariaLabel: "Часовой пояс",
      },
      {
        item: settingItem,
        className: "price-kline-setting-btn",
        title: "Настройки",
        ariaLabel: "Настройки",
      },
      {
        item: fullscreenItem,
        className: "price-kline-fullscreen-btn",
        title: "На весь экран",
        ariaLabel: "На весь экран",
      },
      {
        item: screenshotItem,
        className: "price-kline-screenshot-btn",
        title: "Скриншот",
        ariaLabel: "Скриншот",
      },
    ];

    for (const config of configs) {
      states.push(prepareIconToolbarItem(config));
      bar.appendChild(config.item);
    }

    if (onToggleCoinList) {
      listToggleItem = createListToggleToolbarItem({
        coinListOpen,
        onToggle: onToggleCoinList,
      });
      appendToActionsOrBar(bar, listToggleItem);
    }

    if (onClose) {
      closeItem = createCloseToolbarItem(onClose);
      appendToActionsOrBar(bar, closeItem);
    }

    fullscreenState = states.find((state) => state.className === "price-kline-fullscreen-btn") ?? null;
    updateFullscreenLabel();
    document.addEventListener("fullscreenchange", updateFullscreenLabel);
  };

  attach();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    document.removeEventListener("fullscreenchange", updateFullscreenLabel);
    if (handleRef) handleRef.current = null;
    listToggleItem?.remove();
    listToggleItem = null;
    closeItem?.remove();
    closeItem = null;
    for (const state of [...states].reverse()) {
      restoreToolbarItem(state);
    }
    states.length = 0;
    fullscreenState = null;
  };
}
