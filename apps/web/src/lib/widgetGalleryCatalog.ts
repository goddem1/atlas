import type { DashboardWidgetType } from "./dashboardWidgets";

export type WidgetGalleryCategoryId =
  | "all"
  | "indices"
  | "macro-calendar"
  | "fed-curve"
  | "news"
  | "price-sparkline"
  | "watchlist"
  | "trading-journal"
  | "portfolio"
  | "notes";

export type WidgetGalleryItem = {
  id: string;
  categoryId: Exclude<WidgetGalleryCategoryId, "all">;
  title: string;
  description: string;
  widgetType: DashboardWidgetType;
  /** Стартовый индекс — только для `index`. */
  indexId?: import("../components/widgets/index/marketIndexCatalog").MarketIndexId;
};

export const WIDGET_GALLERY_CATEGORIES: {
  id: WidgetGalleryCategoryId;
  label: string;
}[] = [
  { id: "all", label: "Все виджеты" },
  { id: "indices", label: "Индексы" },
  { id: "macro-calendar", label: "Экон. календарь" },
  { id: "fed-curve", label: "Кривая ФРС" },
  { id: "news", label: "Новости" },
  { id: "price-sparkline", label: "График" },
  { id: "watchlist", label: "Список монет" },
  { id: "trading-journal", label: "Торговый журнал" },
  { id: "portfolio", label: "Портфель" },
  { id: "notes", label: "Заметки" },
];

export const WIDGET_GALLERY_ITEMS: WidgetGalleryItem[] = [
  {
    id: "macro-calendar",
    categoryId: "macro-calendar",
    title: "Календарь",
    description: "Ключевые макро-события на сегодня",
    widgetType: "macro-calendar",
  },
  {
    id: "fed-curve",
    categoryId: "fed-curve",
    title: "Кривая ФРС",
    description: "Доходность Treasury: сегодня и месяц назад",
    widgetType: "fed-curve",
  },
  {
    id: "price-sparkline",
    categoryId: "price-sparkline",
    title: "График цены",
    description: "Криптовалюта, свечи за 7 дней и динамика",
    widgetType: "price-sparkline",
  },
  {
    id: "watchlist",
    categoryId: "watchlist",
    title: "Список монет",
    description: "Цены криптовалют и дневное изменение",
    widgetType: "watchlist",
  },
  {
    id: "portfolio",
    categoryId: "portfolio",
    title: "Портфель",
    description: "Стоимость портфеля, P&L и структура активов",
    widgetType: "portfolio",
  },
  {
    id: "news",
    categoryId: "news",
    title: "Новости",
    description: "Лента Telegram с тегами и настроением",
    widgetType: "news",
  },
  {
    id: "journal",
    categoryId: "trading-journal",
    title: "Журнал сделок",
    description: "Закрытые сделки, PnL и equity curve",
    widgetType: "journal",
  },
  {
    id: "notes",
    categoryId: "notes",
    title: "Заметки",
    description: "Текстовые заметки с форматированием и фото",
    widgetType: "notes",
  },
  {
    id: "index",
    categoryId: "indices",
    title: "Индекс",
    description: "Один рыночный показатель и дневное изменение — тип выбирается в виджете",
    widgetType: "index",
    indexId: "total-2",
  },
  {
    id: "index-board",
    categoryId: "indices",
    title: "Индексы",
    description: "Сводка ключевых показателей: F&G, доминация, Total, VIX, DXY",
    widgetType: "index-board",
  },
];

export function filterWidgetGalleryItems(
  items: WidgetGalleryItem[],
  categoryId: WidgetGalleryCategoryId,
  query: string,
): WidgetGalleryItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    if (categoryId !== "all" && item.categoryId !== categoryId) return false;
    if (!normalizedQuery) return true;
    return (
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function isWidgetGalleryCategoryEnabled(
  categoryId: WidgetGalleryCategoryId,
  items: WidgetGalleryItem[],
): boolean {
  if (categoryId === "all") return items.length > 0;
  return items.some((item) => item.categoryId === categoryId);
}
