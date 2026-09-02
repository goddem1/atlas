export type IndexWidgetSnapshot = {
  name: string;
  value: number;
  changePercent: number;
};

/** Временные данные до подключения API. */
export const INDEX_WIDGET_MOCK: IndexWidgetSnapshot = {
  name: "Total 2",
  value: 771.68e9,
  changePercent: 0.2,
};
