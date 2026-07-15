import { resolveKlineChartFromProContainer } from "./priceKlineOverlayPersistence";

type BlockState = {
  block: HTMLElement;
  nodes: HTMLElement[];
};

const ACTION_TOOL_CLASSES = [
  "price-kline-timezone-btn",
  "price-kline-setting-btn",
  "price-kline-fullscreen-btn",
  "price-kline-screenshot-btn",
  "price-kline-list-toggle-btn",
  "price-kline-close-btn",
] as const;

function collectDirectChildren(bar: HTMLElement, selector: string): HTMLElement[] {
  return [...bar.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches(selector),
  );
}

function collectActionTools(bar: HTMLElement): HTMLElement[] {
  return ACTION_TOOL_CLASSES.map((className) =>
    bar.querySelector<HTMLElement>(`.item.tools.${className}`),
  ).filter((node): node is HTMLElement => node !== null && node.parentElement === bar);
}

function countActionToolsAnywhere(bar: HTMLElement): number {
  return ACTION_TOOL_CLASSES.reduce((count, className) => {
    return count + (bar.querySelector(`.item.tools.${className}`) ? 1 : 0);
  }, 0);
}

function wrapNodes(bar: HTMLElement, className: string, nodes: HTMLElement[]): BlockState | null {
  const live = nodes.filter((node) => node.parentElement === bar);
  if (live.length === 0) return null;

  const block = document.createElement("div");
  block.className = `price-kline-period-block ${className}`;
  bar.insertBefore(block, live[0]);
  for (const node of live) {
    block.appendChild(node);
  }
  return { block, nodes: live };
}

function unwrapBlock(bar: HTMLElement, state: BlockState): void {
  const { block, nodes } = state;
  let insertBefore: ChildNode | null = block.nextSibling;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.parentElement !== block) continue;
    bar.insertBefore(node, insertBefore);
    insertBefore = node;
  }
  block.remove();
}

function extractDrawingBarToggle(container: HTMLElement, bar: HTMLElement): HTMLElement | null {
  const menu = bar.querySelector<HTMLElement>(":scope > .menu-container");
  if (!menu) return null;

  let toggle = container.querySelector<HTMLElement>(":scope > .price-kline-drawing-toggle");
  if (!toggle) {
    toggle = document.createElement("div");
    toggle.className = "price-kline-drawing-toggle";
    toggle.setAttribute("aria-label", "Панель инструментов рисования");
  }

  if (menu.parentElement !== toggle) {
    toggle.appendChild(menu);
  }
  if (toggle.parentElement !== container) {
    container.insertBefore(toggle, bar);
  }
  container.classList.add("price-kline-drawing-rail");
  return toggle;
}

function restoreDrawingBarToggle(container: HTMLElement, bar: HTMLElement | null): void {
  const toggle = container.querySelector<HTMLElement>(":scope > .price-kline-drawing-toggle");
  const menu = toggle?.querySelector<HTMLElement>(":scope > .menu-container");
  if (menu && bar) {
    bar.insertBefore(menu, bar.firstChild);
  }
  toggle?.remove();
  container.classList.remove("price-kline-drawing-rail");
}

export function attachKlinePeriodBarBlocks(params: { container: HTMLElement }): () => void {
  const { container } = params;
  let disposed = false;
  let rafId = 0;
  const blocks: BlockState[] = [];

  const attach = () => {
    if (disposed || blocks.length > 0) return;

    const bar = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar");
    if (!bar) {
      rafId = window.requestAnimationFrame(attach);
      return;
    }

    extractDrawingBarToggle(container, bar);

    const indicatorToolbar = bar.querySelector<HTMLElement>(".price-kline-indicator-toolbar");
    const candleToolbar = bar.querySelector<HTMLElement>(".price-kline-candle-type-toolbar");
    const actionTools = collectActionTools(bar);
    // Chart-type / indicator icons must not wait on action tools (timezone etc.).
    if (!indicatorToolbar || !candleToolbar) {
      rafId = window.requestAnimationFrame(attach);
      return;
    }

    if (
      candleToolbar.parentElement === bar &&
      indicatorToolbar.parentElement === bar &&
      indicatorToolbar.compareDocumentPosition(candleToolbar) & Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      bar.insertBefore(candleToolbar, indicatorToolbar);
    }

    bar.classList.add("price-kline-period-bar--tv");

    const symbol = bar.querySelector<HTMLElement>(".symbol");
    const periods = collectDirectChildren(bar, ".period");

    const nextBlocks = [
      symbol ? wrapNodes(bar, "price-kline-period-block--symbol", [symbol]) : null,
      periods.length > 0 ? wrapNodes(bar, "price-kline-period-block--period", periods) : null,
      wrapNodes(bar, "price-kline-period-block--chart-type", [candleToolbar]),
      wrapNodes(bar, "price-kline-period-block--indicators", [indicatorToolbar]),
      actionTools.length > 0
        ? wrapNodes(bar, "price-kline-period-block--actions", actionTools)
        : null,
    ].filter((block): block is BlockState => block !== null);

    blocks.push(...nextBlocks);

    if (actionTools.length < ACTION_TOOL_CLASSES.length) {
      const finishActions = () => {
        if (disposed) return;
        const liveBar = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar");
        if (!liveBar) return;

        if (countActionToolsAnywhere(liveBar) < ACTION_TOOL_CLASSES.length) {
          rafId = window.requestAnimationFrame(finishActions);
          return;
        }

        const existingActions = blocks.find((item) =>
          item.block.classList.contains("price-kline-period-block--actions"),
        );
        const looseActions = collectActionTools(liveBar);

        if (existingActions) {
          for (const node of looseActions) {
            existingActions.block.appendChild(node);
            if (!existingActions.nodes.includes(node)) {
              existingActions.nodes.push(node);
            }
          }
          return;
        }

        if (looseActions.length === 0) {
          rafId = window.requestAnimationFrame(finishActions);
          return;
        }
        const actionBlock = wrapNodes(liveBar, "price-kline-period-block--actions", looseActions);
        if (actionBlock) blocks.push(actionBlock);
      };
      rafId = window.requestAnimationFrame(finishActions);
    }

    window.requestAnimationFrame(() => {
      if (disposed) return;
      resolveKlineChartFromProContainer(container)?.resize();
    });
  };

  attach();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    const bar = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar");
    bar?.classList.remove("price-kline-period-bar--tv");
    restoreDrawingBarToggle(container, bar);
    if (!bar) {
      blocks.length = 0;
      return;
    }
    for (const block of [...blocks].reverse()) {
      unwrapBlock(bar, block);
    }
    blocks.length = 0;
  };
}
