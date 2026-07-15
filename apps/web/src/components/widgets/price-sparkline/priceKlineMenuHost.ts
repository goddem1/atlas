/** Хост для выпадающих меню графика — внутри оверлея, иначе они оказываются под ним. */
export function resolveKlineMenuHost(container: HTMLElement): HTMLElement {
  return container.closest<HTMLElement>(".price-kline-overlay") ?? document.body;
}
