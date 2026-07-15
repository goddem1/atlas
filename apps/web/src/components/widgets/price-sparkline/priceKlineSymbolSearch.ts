export function attachKlineSymbolSearch(params: {
  container: HTMLElement;
  onOpen: () => void;
}): () => void {
  const { container, onOpen } = params;
  let disposed = false;
  let rafId = 0;
  let symbolEl: HTMLElement | null = null;

  const onSymbolClick = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onOpen();
  };

  const bind = () => {
    if (disposed) return;
    const next = container.querySelector<HTMLElement>(".klinecharts-pro-period-bar .symbol");
    if (!next) {
      rafId = window.requestAnimationFrame(bind);
      return;
    }
    if (symbolEl === next) return;
    symbolEl?.removeEventListener("click", onSymbolClick, true);
    symbolEl = next;
    symbolEl.addEventListener("click", onSymbolClick, true);
  };

  bind();

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    symbolEl?.removeEventListener("click", onSymbolClick, true);
    symbolEl = null;
  };
}
