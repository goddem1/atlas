/** Telegram-like: thin scrollbar only when overflow exists and during scroll/hover. */
export function bindTelegramScrollbar(el: HTMLElement): () => void {
  let hideTimer = 0;

  const syncScrollable = () => {
    const canScroll = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle("is-scrollable", canScroll);
    if (!canScroll) el.classList.remove("is-scrollbar-visible");
  };

  const showScrollbar = () => {
    syncScrollable();
    if (!el.classList.contains("is-scrollable")) return;
    el.classList.add("is-scrollbar-visible");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      el.classList.remove("is-scrollbar-visible");
    }, 2500);
  };

  const onScroll = () => showScrollbar();
  const onEnter = () => showScrollbar();
  const onLeave = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      el.classList.remove("is-scrollbar-visible");
    }, 1200);
  };

  syncScrollable();
  const ro = new ResizeObserver(syncScrollable);
  ro.observe(el);
  const mo = new MutationObserver(syncScrollable);
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  el.addEventListener("scroll", onScroll, { passive: true });
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);

  return () => {
    window.clearTimeout(hideTimer);
    ro.disconnect();
    mo.disconnect();
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.classList.remove("is-scrollable", "is-scrollbar-visible");
  };
}
