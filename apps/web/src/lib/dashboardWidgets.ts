import { normalizeFedCurveCompareDays } from "./fedCurveComparePeriod";
import {
  normalizeMarketIndexId,
  type MarketIndexId,
} from "../components/widgets/index/marketIndexCatalog";
import {
  normalizeSymbolList,
  normalizeWatchlistLists,
  normalizeWatchlistChangeDisplay,
  normalizeWatchlistChangePeriod,
  resolveWatchlistWidgetState,
  type WatchlistListData,
  type WatchlistChangeDisplay,
  type WatchlistChangePeriod,
} from "@atlas-v1/shared";

const STORAGE_KEY = "atlas-v1-dashboard-widgets";

/** Шаг сетки (px). */
export const DASHBOARD_GRID_SIZE = 10;
/** Зона у края холста, куда нельзя ставить виджеты (px). */
export const DASHBOARD_EDGE_INSET = 20;
/** Минимальный зазор между виджетами на 1920+ (px). */
export const DASHBOARD_WIDGET_GAP = 20;
const DASHBOARD_WIDGET_GAP_1440 = 15;
const DASHBOARD_WIDGET_GAP_1280 = 10;

/** Зазор между виджетами для текущего viewport: 1920→20, 1440→15, 1280→10. */
export function dashboardWidgetGap(
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): number {
  if (viewportWidth >= 1920) return DASHBOARD_WIDGET_GAP;
  if (viewportWidth >= 1440) return DASHBOARD_WIDGET_GAP_1440;
  if (viewportWidth >= 1280) return DASHBOARD_WIDGET_GAP_1280;
  return DASHBOARD_WIDGET_GAP_1280;
}
/**
 * Порог «узкий экран» (стандартный md). На телефоне Safari ширина может
 * быть любой — мобильный режим также включаем по pointer/UA (см. MEDIA_QUERY).
 */
export const DASHBOARD_MOBILE_SINGLE_COL_MAX_WIDTH = 768;

/**
 * Мобилка = узкий layout ИЛИ тач-телефон/планшет (как открывается Safari),
 * без требования ровно ≤768px.
 */
export const DASHBOARD_MOBILE_MEDIA_QUERY = `(max-width: ${DASHBOARD_MOBILE_SINGLE_COL_MAX_WIDTH}px), ((hover: none) and (pointer: coarse) and (max-width: 1024px))`;

export function getDashboardViewportWidth(): number {
  if (typeof window === "undefined") return 1200;
  const docW = document.documentElement?.clientWidth;
  const parts = [window.innerWidth];
  if (typeof docW === "number" && docW > 0) parts.push(docW);
  return Math.min(...parts);
}

export function getDashboardScreenWidth(): number {
  if (typeof window === "undefined") return 1200;
  return window.screen?.width > 0 ? window.screen.width : getDashboardViewportWidth();
}

export function isPhoneScreen(): boolean {
  if (typeof window === "undefined") return false;
  return getDashboardScreenWidth() <= DASHBOARD_MOBILE_SINGLE_COL_MAX_WIDTH;
}

export function isTouchPhoneOrTablet(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia(DASHBOARD_MOBILE_MEDIA_QUERY).matches) return true;
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  return isPhoneScreen();
}

/** Оставляем no-op: больше не ломаем viewport Safari вручную. */
export function lockPhoneViewport(): boolean {
  return false;
}

export function isDesktopSiteOnPhone(): boolean {
  if (typeof window === "undefined") return false;
  return isPhoneScreen() && getDashboardViewportWidth() > DASHBOARD_MOBILE_SINGLE_COL_MAX_WIDTH + 80;
}

export function isDashboardMobileSingleColumn(
  viewportWidth: number = typeof window !== "undefined" ? getDashboardViewportWidth() : 1200,
): boolean {
  if (viewportWidth <= DASHBOARD_MOBILE_SINGLE_COL_MAX_WIDTH) return true;
  if (typeof window !== "undefined" && isTouchPhoneOrTablet()) return true;
  return false;
}

export type DashboardWidgetType =
  | "price-sparkline"
  | "portfolio"
  | "macro-calendar"
  | "fed-curve"
  | "watchlist"
  | "news"
  | "notes"
  | "journal"
  | "index"
  | "index-board";

/** Привязка к краю доски: при росте окна виджет остаётся у этого края. */
export type DashboardWidgetAnchorX = "left" | "right";
export type DashboardWidgetAnchorY = "top" | "bottom";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  x: number;
  y: number;
  /** Горизонтальный якорь; `right` + insetRight — липнет к правому краю. */
  anchorX?: DashboardWidgetAnchorX;
  /** Вертикальный якорь; `bottom` + insetBottom — липнет к нижнему краю. */
  anchorY?: DashboardWidgetAnchorY;
  /** Отступ от правого края доски до правого края виджета (при anchorX === "right"). */
  insetRight?: number;
  /** Отступ от нижнего края доски до нижнего края виджета (при anchorY === "bottom"). */
  insetBottom?: number;
  /** Выбранный индекс — только для `index`. */
  indexId?: MarketIndexId;
  /** Тикер из справочника (BTC, ETH) — только для `price-sparkline`. */
  symbol?: string;
  /** Период серой линии (дней) — только для `fed-curve`. */
  compareDays?: number;
  /** Тикеры в списке — только для `watchlist` (legacy). */
  symbols?: string[];
  /** Списки watchlist — только для `watchlist`. */
  watchlistLists?: WatchlistListData[];
  /** Активный список watchlist — только для `watchlist`. */
  activeWatchlistListId?: string;
  /** Отображение изменения цены — только для `watchlist`. */
  watchlistChangeDisplay?: WatchlistChangeDisplay;
  /** Период изменения цены — только для `watchlist`. */
  watchlistChangePeriod?: WatchlistChangePeriod;
};

/** Порядок чтения на мобиле: сверху вниз, слева направо по сохранённым координатам. */
export function sortWidgetsForMobileColumn(widgets: DashboardWidget[]): DashboardWidget[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/**
 * Собирает все мелкие `index` в один блок (линии по MOBILE_INDEX_ROW_MAX)
 * на месте первого индекса. Остальные виджеты сохраняют относительный порядок.
 * Так одиночные индексы не разъезжаются по доске между крупными карточками.
 */
export function packIndexWidgetsForMobileColumn(widgets: DashboardWidget[]): DashboardWidget[] {
  const sorted = sortWidgetsForMobileColumn(widgets);
  const indexes = sorted.filter((w) => w.type === "index");
  if (indexes.length === 0) return sorted;

  const firstIndexAt = sorted.findIndex((w) => w.type === "index");
  const others = sorted.filter((w) => w.type !== "index");
  const beforeCount = sorted.slice(0, firstIndexAt).filter((w) => w.type !== "index").length;

  return [...others.slice(0, beforeCount), ...indexes, ...others.slice(beforeCount)];
}

export const WIDGET_CATALOG: {
  type: DashboardWidgetType;
  title: string;
  description: string;
}[] = [
  {
    type: "price-sparkline",
    title: "График цены",
    description: "Криптовалюта, свечи за 7 дней и динамика",
  },
  {
    type: "portfolio",
    title: "Портфель",
    description: "Стоимость портфеля, P&L и структура активов",
  },
  {
    type: "macro-calendar",
    title: "Календарь",
    description: "Ключевые макро-события на сегодня",
  },
  {
    type: "fed-curve",
    title: "Кривая ФРС",
    description: "Доходность Treasury: сегодня и месяц назад",
  },
  {
    type: "watchlist",
    title: "Список",
    description: "Цены криптовалют и дневное изменение",
  },
  {
    type: "news",
    title: "Новости",
    description: "Лента Telegram с тегами и настроением",
  },
  {
    type: "notes",
    title: "Заметки",
    description: "Текстовые заметки с форматированием и фото",
  },
  {
    type: "journal",
    title: "Журнал сделок",
    description: "Закрытые сделки, PnL и equity curve",
  },
  {
    type: "index",
    title: "Индекс",
    description: "Один рыночный показатель и дневное изменение — тип выбирается в виджете",
  },
  {
    type: "index-board",
    title: "Индексы",
    description: "Сводка ключевых показателей: F&G, доминация, Total, VIX, DXY",
  },
];

const PRICE_WIDGET_W = 350;
const PRICE_WIDGET_H = 200;
const PRICE_WIDGET_W_1440 = 297;
const PRICE_WIDGET_H_1440 = 169;
const PRICE_WIDGET_W_1280 = 240;
const PRICE_WIDGET_H_1280 = 149;
const FED_CURVE_WIDGET_W = 350;
const FED_CURVE_WIDGET_H = 200;
const FED_CURVE_WIDGET_W_1440 = 297;
const FED_CURVE_WIDGET_H_1440 = 169;
const FED_CURVE_WIDGET_W_1280 = 240;
const FED_CURVE_WIDGET_H_1280 = 149;
const WATCHLIST_WIDGET_W = 350;
const WATCHLIST_WIDGET_H = 530;
const WATCHLIST_WIDGET_W_1440 = 252;
const WATCHLIST_WIDGET_H_1440 = 412;
const WATCHLIST_WIDGET_W_1280 = 240;
const WATCHLIST_WIDGET_H_1280 = 384;
const PORTFOLIO_WIDGET_W = 500;
const PORTFOLIO_WIDGET_H = 250;
const PORTFOLIO_WIDGET_W_1440 = 462;
const PORTFOLIO_WIDGET_H_1440 = 210;
const PORTFOLIO_WIDGET_W_1280 = 380;
const PORTFOLIO_WIDGET_H_1280 = 174;
const MACRO_CALENDAR_WIDGET_W = 550;
const MACRO_CALENDAR_WIDGET_H = 300;
const MACRO_CALENDAR_WIDGET_W_1440 = 482;
const MACRO_CALENDAR_WIDGET_H_1440 = 233;
const MACRO_CALENDAR_WIDGET_W_1280 = 400;
const MACRO_CALENDAR_WIDGET_H_1280 = 202;
const NEWS_WIDGET_W = 350;
const NEWS_WIDGET_H = 494;
const NEWS_WIDGET_W_1440 = 252;
const NEWS_WIDGET_H_1440 = 473;
const NEWS_WIDGET_W_1280 = 240;
const NEWS_WIDGET_H_1280 = 411;
const NOTES_WIDGET_W = 350;
const NOTES_WIDGET_H = 326;
const NOTES_WIDGET_W_1440 = 252;
const NOTES_WIDGET_H_1440 = 268;
const NOTES_WIDGET_W_1280 = 240;
const NOTES_WIDGET_H_1280 = 230;
const JOURNAL_WIDGET_W = 570;
const JOURNAL_WIDGET_H = 300;
const JOURNAL_WIDGET_W_1440 = 486;
const JOURNAL_WIDGET_H_1440 = 250;
const JOURNAL_WIDGET_W_1280 = 460;
const JOURNAL_WIDGET_H_1280 = 205;
const INDEX_WIDGET_W = 130;
const INDEX_WIDGET_H = 100;
const INDEX_WIDGET_W_1440 = 130;
const INDEX_WIDGET_H_1440 = 85;
const INDEX_WIDGET_W_1280 = 120;
const INDEX_WIDGET_H_1280 = 78;
/** Сколько index-виджетов максимум в одной мобильной линии. */
export const MOBILE_INDEX_ROW_MAX = 3;
const INDEX_BOARD_WIDGET_W = 280;
const INDEX_BOARD_WIDGET_H = 228;
const INDEX_BOARD_WIDGET_W_1440 = 297;
const INDEX_BOARD_WIDGET_H_1440 = 206;
const INDEX_BOARD_WIDGET_W_1280 = 240;
const INDEX_BOARD_WIDGET_H_1280 = 196;
/** ~3rem — согласовано с `calc(100vw - 3rem)` в виджетах. */
const VIEWPORT_WIDGET_GUTTER = 48;

/** Подпись виджета для мобильного редактора раскладки. */
export function dashboardWidgetDisplayTitle(widget: DashboardWidget): string {
  if (widget.type === "watchlist") return "Список монет";
  return WIDGET_CATALOG.find((c) => c.type === widget.type)?.title ?? widget.type;
}

/** Есть ли у виджета экран настроек (шестерёнка в мобильном редакторе). */
export function dashboardWidgetHasSettings(type: DashboardWidgetType): boolean {
  return type === "watchlist" || type === "fed-curve";
}

export type MobileLayoutRow =
  | { kind: "single"; widget: DashboardWidget }
  | { kind: "index-row"; widgets: DashboardWidget[] };

/** Группирует все `index` по 1–3 в ряд (как в макете редактора). */
export function groupWidgetsForMobileLayout(widgets: DashboardWidget[]): MobileLayoutRow[] {
  const packed = packIndexWidgetsForMobileColumn(widgets);
  const rows: MobileLayoutRow[] = [];
  let i = 0;
  while (i < packed.length) {
    const w = packed[i]!;
    if (w.type === "index") {
      const group: DashboardWidget[] = [];
      while (
        i < packed.length &&
        packed[i]!.type === "index" &&
        group.length < MOBILE_INDEX_ROW_MAX
      ) {
        group.push(packed[i]!);
        i += 1;
      }
      rows.push({ kind: "index-row", widgets: group });
      continue;
    }
    rows.push({ kind: "single", widget: w });
    i += 1;
  }
  return rows;
}

/** Перезаписывает x/y после порядка строк мобильного редактора. */
export function applyMobileLayoutRows(rows: MobileLayoutRow[]): DashboardWidget[] {
  const step = DASHBOARD_GRID_SIZE;
  const indexStepX = INDEX_WIDGET_W + DASHBOARD_WIDGET_GAP;
  let y = 0;
  const out: DashboardWidget[] = [];
  for (const row of rows) {
    if (row.kind === "single") {
      out.push({ ...row.widget, x: 0, y });
      y += step;
      continue;
    }
    row.widgets.forEach((w, j) => {
      out.push({ ...w, x: j * indexStepX, y });
    });
    y += step;
  }
  return out;
}

function mobileRowLength(row: MobileLayoutRow): number {
  return row.kind === "single" ? 1 : row.widgets.length;
}

/**
 * Ищет незаполненную index-линию для дозаписи.
 * `insertAt === null` — последняя незаполненная; иначе — ближайшая к точке вставки.
 */
function findIncompleteIndexRowForInsert(
  rows: MobileLayoutRow[],
  insertAt: number | null,
): number | null {
  const incomplete: { rowIndex: number; start: number; end: number }[] = [];
  let flat = 0;
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]!;
    const len = mobileRowLength(row);
    const start = flat;
    const end = flat + len;
    if (row.kind === "index-row" && row.widgets.length < MOBILE_INDEX_ROW_MAX) {
      incomplete.push({ rowIndex: r, start, end });
    }
    flat = end;
  }
  if (incomplete.length === 0) return null;

  if (insertAt == null) {
    return incomplete[incomplete.length - 1]!.rowIndex;
  }

  const at = Math.max(0, insertAt);
  // Ближайшая незаполненная линия к точке вставки (при равной дистанции — выше).
  let best: { rowIndex: number; dist: number } | null = null;
  for (const item of incomplete) {
    const dist =
      at < item.start ? item.start - at : at > item.end ? at - item.end : 0;
    if (!best || dist < best.dist || (dist === best.dist && item.rowIndex < best.rowIndex)) {
      best = { rowIndex: item.rowIndex, dist };
    }
  }
  return best?.rowIndex ?? null;
}

/** Вставляет index в незаполненную линию (макс. 3) или создаёт новую линию индексов. */
function insertIndexInMobileOrder(
  widgets: DashboardWidget[],
  newWidget: DashboardWidget,
  insertAt: number | null,
): DashboardWidget[] {
  const rows = groupWidgetsForMobileLayout(widgets);
  // Пока есть незаполненная линия индексов — только туда, никуда иначе.
  const fillRowIndex = findIncompleteIndexRowForInsert(rows, null);

  if (fillRowIndex != null) {
    const row = rows[fillRowIndex]!;
    if (row.kind === "index-row") {
      const nextRows = rows.slice();
      nextRows[fillRowIndex] = { kind: "index-row", widgets: [...row.widgets, newWidget] };
      return applyMobileLayoutRows(nextRows);
    }
  }

  // Все линии по 3 — новая линия сразу после блока индексов (или в конец / insertAt).
  const ordered = packIndexWidgetsForMobileColumn(widgets);
  let afterIndexes: number | null = null;
  let flat = 0;
  for (const row of rows) {
    const len = mobileRowLength(row);
    if (row.kind === "index-row") afterIndexes = flat + len;
    flat += len;
  }
  const preferred = insertAt ?? afterIndexes ?? ordered.length;
  const at = Math.max(0, Math.min(preferred, ordered.length));
  const next = [...ordered.slice(0, at), newWidget, ...ordered.slice(at)];
  return applyMobileLayoutRows(groupWidgetsForMobileLayout(next.map((w, i) => ({ ...w, y: i, x: 0 }))));
}

/** Вставляет виджет в плоский мобильный порядок по индексу (0 = в начало). */
export function insertWidgetInMobileOrder(
  widgets: DashboardWidget[],
  newWidget: DashboardWidget,
  insertAt: number | null,
): DashboardWidget[] {
  if (newWidget.type === "index") {
    return insertIndexInMobileOrder(widgets, newWidget, insertAt);
  }
  const ordered = packIndexWidgetsForMobileColumn(widgets);
  const at = Math.max(0, Math.min(insertAt ?? ordered.length, ordered.length));
  const next = [...ordered.slice(0, at), newWidget, ...ordered.slice(at)];
  return applyMobileLayoutRows(
    groupWidgetsForMobileLayout(next.map((w, i) => ({ ...w, y: i, x: 0 }))),
  );
}

/** Переставляет строки мобильного редактора. */
export function reorderMobileLayoutRows(rows: MobileLayoutRow[], from: number, to: number): MobileLayoutRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  if (!item) return rows;
  next.splice(to, 0, item);
  return next;
}

/** Меняет порядок index внутри одной мобильной линии. */
export function reorderIndexInMobileRow(
  rows: MobileLayoutRow[],
  rowIndex: number,
  fromCol: number,
  toCol: number,
): MobileLayoutRow[] {
  const row = rows[rowIndex];
  if (!row || row.kind !== "index-row") return rows;
  if (
    fromCol === toCol ||
    fromCol < 0 ||
    toCol < 0 ||
    fromCol >= row.widgets.length ||
    toCol >= row.widgets.length
  ) {
    return rows;
  }
  const widgets = [...row.widgets];
  const [item] = widgets.splice(fromCol, 1);
  if (!item) return rows;
  widgets.splice(toCol, 0, item);
  const next = [...rows];
  next[rowIndex] = { kind: "index-row", widgets };
  return next;
}

export function flatIndexBeforeMobileRow(rows: MobileLayoutRow[], rowIndex: number): number {
  let n = 0;
  for (let i = 0; i < rowIndex && i < rows.length; i += 1) {
    const row = rows[i]!;
    n += row.kind === "single" ? 1 : row.widgets.length;
  }
  return n;
}

export function createWidgetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Внешние размеры виджета для коллизий и clamp (совпадают с max-width в Draggable). */
export function dashboardWidgetOuterSize(
  type: DashboardWidgetType,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): { w: number; h: number } {
  if (type === "macro-calendar") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: MACRO_CALENDAR_WIDGET_W_1440, h: MACRO_CALENDAR_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: MACRO_CALENDAR_WIDGET_W_1280, h: MACRO_CALENDAR_WIDGET_H_1280 };
    }
    const w = Math.min(MACRO_CALENDAR_WIDGET_W, Math.max(280, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: MACRO_CALENDAR_WIDGET_H };
  }
  if (type === "news") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: NEWS_WIDGET_W_1440, h: NEWS_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: NEWS_WIDGET_W_1280, h: NEWS_WIDGET_H_1280 };
    }
    const w = Math.min(NEWS_WIDGET_W, Math.max(260, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: NEWS_WIDGET_H };
  }
  if (type === "notes") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: NOTES_WIDGET_W_1440, h: NOTES_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: NOTES_WIDGET_W_1280, h: NOTES_WIDGET_H_1280 };
    }
    const w = Math.min(NOTES_WIDGET_W, Math.max(260, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: NOTES_WIDGET_H };
  }
  if (type === "journal") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: JOURNAL_WIDGET_W_1440, h: JOURNAL_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: JOURNAL_WIDGET_W_1280, h: JOURNAL_WIDGET_H_1280 };
    }
    const w = Math.min(JOURNAL_WIDGET_W, Math.max(280, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: JOURNAL_WIDGET_H };
  }
  if (type === "index") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: INDEX_WIDGET_W_1440, h: INDEX_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: INDEX_WIDGET_W_1280, h: INDEX_WIDGET_H_1280 };
    }
    const w = Math.min(INDEX_WIDGET_W, Math.max(120, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: INDEX_WIDGET_H };
  }
  if (type === "index-board") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: INDEX_BOARD_WIDGET_W_1440, h: INDEX_BOARD_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: INDEX_BOARD_WIDGET_W_1280, h: INDEX_BOARD_WIDGET_H_1280 };
    }
    const w = Math.min(INDEX_BOARD_WIDGET_W, Math.max(220, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: INDEX_BOARD_WIDGET_H };
  }
  if (type === "watchlist") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: WATCHLIST_WIDGET_W_1440, h: WATCHLIST_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: WATCHLIST_WIDGET_W_1280, h: WATCHLIST_WIDGET_H_1280 };
    }
    const w = Math.min(WATCHLIST_WIDGET_W, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: WATCHLIST_WIDGET_H };
  }
  if (type === "price-sparkline") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: PRICE_WIDGET_W_1440, h: PRICE_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: PRICE_WIDGET_W_1280, h: PRICE_WIDGET_H_1280 };
    }
    const w = Math.min(PRICE_WIDGET_W, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: PRICE_WIDGET_H };
  }
  if (type === "fed-curve") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: FED_CURVE_WIDGET_W_1440, h: FED_CURVE_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: FED_CURVE_WIDGET_W_1280, h: FED_CURVE_WIDGET_H_1280 };
    }
    const w = Math.min(FED_CURVE_WIDGET_W, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: FED_CURVE_WIDGET_H };
  }
  if (type === "portfolio") {
    if (viewportWidth >= 1440 && viewportWidth < 1920) {
      return { w: PORTFOLIO_WIDGET_W_1440, h: PORTFOLIO_WIDGET_H_1440 };
    }
    if (viewportWidth >= 1280 && viewportWidth < 1440) {
      return { w: PORTFOLIO_WIDGET_W_1280, h: PORTFOLIO_WIDGET_H_1280 };
    }
    const w = Math.min(PORTFOLIO_WIDGET_W, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
    return { w, h: PORTFOLIO_WIDGET_H };
  }
  const w = Math.min(350, Math.max(200, viewportWidth - VIEWPORT_WIDGET_GUTTER));
  return { w, h: PRICE_WIDGET_H };
}

/**
 * Канонический (desktop) размер виджета для превью галереи.
 * ScaledFrame равномерно масштабирует его под ширину карточки.
 */
export function dashboardWidgetGalleryOuterSize(
  type: DashboardWidgetType,
): { w: number; h: number } {
  return dashboardWidgetOuterSize(type, 1280);
}

function isWidgetType(v: unknown): v is DashboardWidgetType {
  return (
    v === "price-sparkline" ||
    v === "portfolio" ||
    v === "macro-calendar" ||
    v === "fed-curve" ||
    v === "watchlist" ||
    v === "news" ||
    v === "notes" ||
    v === "journal" ||
    v === "index" ||
    v === "index-board"
  );
}

export function snapToGrid(x: number, y: number, gridSize: number = DASHBOARD_GRID_SIZE): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

/**
 * Координаты относительно области с отступом DASHBOARD_EDGE_INSET от краёв main.
 * Привязка к сетке DASHBOARD_GRID_SIZE, затем clamp внутри bounds.
 */
export function snapAndClampDashboardPosition(
  x: number,
  y: number,
  type: DashboardWidgetType,
  boundsWidth: number,
  boundsHeight: number,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): { x: number; y: number } {
  const g = DASHBOARD_GRID_SIZE;
  const { w, h } = dashboardWidgetOuterSize(type, viewportWidth);
  let sx = Math.round(x / g) * g;
  let sy = Math.round(y / g) * g;
  const maxX = Math.max(0, Math.floor((boundsWidth - w) / g) * g);
  const maxY = Math.max(0, Math.floor((boundsHeight - h) / g) * g);
  sx = Math.min(Math.max(0, sx), maxX);
  sy = Math.min(Math.max(0, sy), maxY);
  return { x: sx, y: sy };
}

/** Есть ли между двумя осями выровненными прямоугольниками зазор не меньше `gap` (включая раздельность по одной оси). */
function boxesSeparatedWithGap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): boolean {
  return ax + aw + gap <= bx || bx + bw + gap <= ax || ay + ah + gap <= by || by + bh + gap <= ay;
}

function resolvePositionAgainstOthers(
  type: DashboardWidgetType,
  candidate: { x: number; y: number },
  others: DashboardWidget[],
  boundsW: number,
  boundsH: number,
  viewportW: number,
  /** 0 = только реальное пересечение AABB; иначе минимальный зазор (drag). */
  gap: number = dashboardWidgetGap(viewportW),
): { x: number; y: number } {
  const selfSize = dashboardWidgetOuterSize(type, viewportW);
  const placed = others.map((o) => ({
    x: o.x,
    y: o.y,
    ...dashboardWidgetOuterSize(o.type, viewportW),
  }));

  const ok = (x: number, y: number) =>
    placed.every((o) =>
      boxesSeparatedWithGap(x, y, selfSize.w, selfSize.h, o.x, o.y, o.w, o.h, gap),
    );

  let { x, y } = snapAndClampDashboardPosition(candidate.x, candidate.y, type, boundsW, boundsH, viewportW);
  if (ok(x, y)) return { x, y };

  const g = DASHBOARD_GRID_SIZE;
  const dirs: Array<[number, number]> = [
    [g, 0],
    [-g, 0],
    [0, g],
    [0, -g],
    [g, g],
    [g, -g],
    [-g, g],
    [-g, -g],
  ];
  for (let ring = 1; ring <= 80; ring++) {
    for (const [dx, dy] of dirs) {
      const nx = candidate.x + dx * ring;
      const ny = candidate.y + dy * ring;
      const p = snapAndClampDashboardPosition(nx, ny, type, boundsW, boundsH, viewportW);
      if (ok(p.x, p.y)) return p;
    }
  }
  return { x, y };
}

export function resolveCollisions(
  widgets: DashboardWidget[],
  movedId: string,
  candidate: { x: number; y: number },
  boundsW: number,
  boundsH: number,
  viewportW: number,
): { x: number; y: number } {
  const self = widgets.find((w) => w.id === movedId);
  if (!self) return candidate;
  const others = widgets.filter((w) => w.id !== movedId);
  return resolvePositionAgainstOthers(
    self.type,
    candidate,
    others,
    boundsW,
    boundsH,
    viewportW,
    dashboardWidgetGap(viewportW),
  );
}

/** Последовательно укладывает виджеты: каждый к сетке и без пересечений с уже размещёнными. */
export function layoutAllWidgetsSequential(
  widgets: DashboardWidget[],
  boundsW: number,
  boundsH: number,
  viewportW: number,
): DashboardWidget[] {
  const gap = dashboardWidgetGap(viewportW);
  const out: DashboardWidget[] = [];
  for (const w of widgets) {
    const snapped = snapAndClampDashboardPosition(w.x, w.y, w.type, boundsW, boundsH, viewportW);
    const p = resolvePositionAgainstOthers(w.type, snapped, out, boundsW, boundsH, viewportW, gap);
    out.push({ ...w, x: p.x, y: p.y });
  }
  return out;
}

/** Дефолтный набор виджетов для гостей (координаты пересчитываются layout-ом). */
export const GUEST_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: "guest-btc", type: "price-sparkline", symbol: "BTC", x: 0, y: 0 },
  { id: "guest-eth", type: "price-sparkline", symbol: "ETH", x: 0, y: 0 },
  { id: "guest-portfolio", type: "portfolio", x: 0, y: 0 },
  { id: "guest-macro", type: "macro-calendar", x: 0, y: 0 },
];

function estimateBoardSize(viewportWidth: number): { width: number; height: number } {
  return {
    width: Math.max(400, viewportWidth - 40),
    height: Math.max(600, (typeof window !== "undefined" ? window.innerHeight : 900) - 40),
  };
}

export function layoutGuestDashboardWidgets(
  raw: DashboardWidget[] = GUEST_DASHBOARD_WIDGETS,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200,
): DashboardWidget[] {
  const { width, height } = estimateBoardSize(viewportWidth);
  return layoutAllWidgetsSequential(
    raw.map((w) => ({ ...w })),
    width,
    height,
    viewportWidth,
  );
}

/** Укладка виджетов на холст; при неизвестных размерах — оценка по viewport. */
export function layoutDashboardWidgetsForBoard(
  widgets: DashboardWidget[],
  boardWidth: number | null | undefined,
  boardHeight: number | null | undefined,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
): DashboardWidget[] {
  let width = boardWidth ?? 0;
  let height = boardHeight ?? 0;
  if (width < 1 || height < 1) {
    const est = estimateBoardSize(viewportWidth);
    width = est.width;
    height = est.height;
  }
  return layoutAllWidgetsSequential(
    widgets.map((w) => ({ ...w })),
    width,
    height,
    viewportWidth,
  );
}

function resolveBoardSize(
  boardWidth: number | null | undefined,
  boardHeight: number | null | undefined,
  viewportWidth: number,
): { width: number; height: number } {
  let width = boardWidth ?? 0;
  let height = boardHeight ?? 0;
  if (width < 1 || height < 1) {
    const est = estimateBoardSize(viewportWidth);
    width = est.width;
    height = est.height;
  }
  return { width, height };
}

type GapReflowBox = {
  widget: DashboardWidget;
  oldW: number;
  oldH: number;
  newW: number;
  newH: number;
};

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return !(a1 <= b0 || b1 <= a0);
}

/**
 * Вычисляет якоря по позиции после drag: у правого/нижнего края (в пределах
 * DASHBOARD_EDGE_INSET) — закрепление с inset, иначе left/top.
 */
export function resolveDashboardWidgetEdgeAnchors(
  type: DashboardWidgetType,
  x: number,
  y: number,
  boardWidth: number,
  boardHeight: number,
  viewportWidth: number,
): Pick<DashboardWidget, "anchorX" | "anchorY" | "insetRight" | "insetBottom"> {
  const { w, h } = dashboardWidgetOuterSize(type, viewportWidth);
  const g = DASHBOARD_GRID_SIZE;
  const pin = DASHBOARD_EDGE_INSET;

  const distLeft = Math.max(0, x);
  const distRight = Math.max(0, boardWidth - (x + w));
  const distTop = Math.max(0, y);
  const distBottom = Math.max(0, boardHeight - (y + h));

  const anchorX: DashboardWidgetAnchorX =
    distRight <= pin && distRight <= distLeft ? "right" : "left";
  const anchorY: DashboardWidgetAnchorY =
    distBottom <= pin && distBottom <= distTop ? "bottom" : "top";

  const out: Pick<DashboardWidget, "anchorX" | "anchorY" | "insetRight" | "insetBottom"> = {
    anchorX,
    anchorY,
  };
  if (anchorX === "right") {
    out.insetRight = Math.round(distRight / g) * g;
  }
  if (anchorY === "bottom") {
    out.insetBottom = Math.round(distBottom / g) * g;
  }
  return out;
}

/** Пересчитывает x/y из якорей под текущий размер доски и outer-size. */
export function applyDashboardWidgetEdgeAnchors(
  widgets: DashboardWidget[],
  boardWidth: number,
  boardHeight: number,
  viewportWidth: number,
): DashboardWidget[] {
  const g = DASHBOARD_GRID_SIZE;
  let changed = false;
  const next = widgets.map((w) => {
    const { w: ww, h: wh } = dashboardWidgetOuterSize(w.type, viewportWidth);
    let x = w.x;
    let y = w.y;

    if (w.anchorX === "right" && typeof w.insetRight === "number" && Number.isFinite(w.insetRight)) {
      x = Math.round((boardWidth - ww - w.insetRight) / g) * g;
    }
    if (w.anchorY === "bottom" && typeof w.insetBottom === "number" && Number.isFinite(w.insetBottom)) {
      y = Math.round((boardHeight - wh - w.insetBottom) / g) * g;
    }

    const clamped = snapAndClampDashboardPosition(x, y, w.type, boardWidth, boardHeight, viewportWidth);
    if (clamped.x === w.x && clamped.y === w.y) return w;
    changed = true;
    return { ...w, x: clamped.x, y: clamped.y };
  });
  return changed ? next : widgets;
}

/**
 * Пересчитывает x/y при смене breakpoint / зазора.
 * Для каждого соседа слева/сверху с overlap: B = A + A.newSize + gap(viewport)
 * (20 / 15 / 10) — старые зазоры не сохраняем, применяем актуальные.
 * Два прохода X→Y→X→Y, чтобы согласовать колонки и ряды.
 */
export function reflowDashboardWidgetsPreservingGaps(
  widgets: DashboardWidget[],
  prevViewportWidth: number,
  nextViewportWidth: number,
): DashboardWidget[] {
  if (prevViewportWidth === nextViewportWidth || widgets.length === 0) return widgets;

  const boxes: GapReflowBox[] = widgets.map((w) => {
    const oldS = dashboardWidgetOuterSize(w.type, prevViewportWidth);
    const newS = dashboardWidgetOuterSize(w.type, nextViewportWidth);
    return {
      widget: w,
      oldW: oldS.w,
      oldH: oldS.h,
      newW: newS.w,
      newH: newS.h,
    };
  });

  const minGap = dashboardWidgetGap(nextViewportWidth);
  const gapChanged = dashboardWidgetGap(prevViewportWidth) !== minGap;
  const sizeChanged = boxes.some((b) => b.newW !== b.oldW || b.newH !== b.oldH);
  if (!gapChanged && !sizeChanged) return widgets;

  const newX = new Map<string, number>();
  const newY = new Map<string, number>();
  const g = DASHBOARD_GRID_SIZE;

  const posX = (b: GapReflowBox) => newX.get(b.widget.id) ?? b.widget.x;
  const posY = (b: GapReflowBox) => newY.get(b.widget.id) ?? b.widget.y;

  /** Overlap по X: старая раскладка или уже пересчитанные x + newW. */
  const overlapX = (a: GapReflowBox, b: GapReflowBox) =>
    rangesOverlap(a.widget.x, a.widget.x + a.oldW, b.widget.x, b.widget.x + b.oldW) ||
    rangesOverlap(posX(a), posX(a) + a.newW, posX(b), posX(b) + b.newW);

  /** Overlap по Y: старая раскладка или уже пересчитанные y + newH. */
  const overlapY = (a: GapReflowBox, b: GapReflowBox) =>
    rangesOverlap(a.widget.y, a.widget.y + a.oldH, b.widget.y, b.widget.y + b.oldH) ||
    rangesOverlap(posY(a), posY(a) + a.newH, posY(b), posY(b) + b.newH);

  const reflowX = () => {
    const byX = [...boxes].sort((a, b) => {
      if (a.widget.x !== b.widget.x) return a.widget.x - b.widget.x;
      if (a.widget.y !== b.widget.y) return a.widget.y - b.widget.y;
      return a.widget.id.localeCompare(b.widget.id);
    });
    for (const b of byX) {
      let x: number | null = null;
      for (const a of boxes) {
        if (a.widget.id === b.widget.id) continue;
        // «Слева» по исходной раскладке — кто был левее до reflow.
        const aRightOld = a.widget.x + a.oldW;
        if (aRightOld > b.widget.x) continue;
        if (!overlapY(a, b)) continue;
        const required = posX(a) + a.newW + minGap;
        x = x == null ? required : Math.max(x, required);
      }
      newX.set(b.widget.id, Math.round((x ?? b.widget.x) / g) * g);
    }
  };

  const reflowY = () => {
    const byY = [...boxes].sort((a, b) => {
      if (a.widget.y !== b.widget.y) return a.widget.y - b.widget.y;
      if (a.widget.x !== b.widget.x) return a.widget.x - b.widget.x;
      return a.widget.id.localeCompare(b.widget.id);
    });
    for (const b of byY) {
      let y: number | null = null;
      for (const a of boxes) {
        if (a.widget.id === b.widget.id) continue;
        const aBottomOld = a.widget.y + a.oldH;
        if (aBottomOld > b.widget.y) continue;
        if (!overlapX(a, b)) continue;
        const required = posY(a) + a.newH + minGap;
        y = y == null ? required : Math.max(y, required);
      }
      newY.set(b.widget.id, Math.round((y ?? b.widget.y) / g) * g);
    }
  };

  // X→Y→X→Y: высота учитывает уже сдвинутые колонки, ширина — обновлённые ряды.
  reflowX();
  reflowY();
  reflowX();
  reflowY();

  let changed = false;
  const next = widgets.map((w) => {
    const x = newX.get(w.id) ?? w.x;
    const y = newY.get(w.id) ?? w.y;
    if (x === w.x && y === w.y) return w;
    changed = true;
    return { ...w, x, y };
  });

  return changed ? next : widgets;
}

/**
 * Мягкая стабилизация при resize / смене breakpoint:
 * reflow под актуальный gap (20/15/10) и размеры плашек, clamp, разведение при overlap,
 * затем якоря краёв.
 */
export function stabilizeDashboardWidgetsForBoard(
  widgets: DashboardWidget[],
  boardWidth: number | null | undefined,
  boardHeight: number | null | undefined,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1200,
  prevViewportWidth?: number | null,
): DashboardWidget[] {
  const { width, height } = resolveBoardSize(boardWidth, boardHeight, viewportWidth);

  let working = widgets;
  if (prevViewportWidth != null && prevViewportWidth !== viewportWidth) {
    working = reflowDashboardWidgetsPreservingGaps(working, prevViewportWidth, viewportWidth);
  }

  const sorted = [...working].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });

  const gap = dashboardWidgetGap(viewportWidth);
  const placed: DashboardWidget[] = [];
  for (const w of sorted) {
    const snapped = snapAndClampDashboardPosition(w.x, w.y, w.type, width, height, viewportWidth);
    const p = resolvePositionAgainstOthers(
      w.type,
      snapped,
      placed,
      width,
      height,
      viewportWidth,
      gap,
    );
    placed.push({ ...w, x: p.x, y: p.y });
  }

  const byId = new Map(placed.map((w) => [w.id, w]));
  let changed = false;
  let next = widgets.map((orig) => {
    const p = byId.get(orig.id);
    if (!p) return orig;
    if (p.x === orig.x && p.y === orig.y) return orig;
    changed = true;
    return { ...orig, x: p.x, y: p.y };
  });
  if (!changed) next = widgets;

  // После коллизий снова прижимаем к якорям (рост доски / смена размера плашки).
  const anchored = applyDashboardWidgetEdgeAnchors(next, width, height, viewportWidth);
  return anchored;
}

function defaultWidgets(): DashboardWidget[] {
  return layoutGuestDashboardWidgets();
}

function normalizeWidgets(raw: unknown): DashboardWidget[] {
  if (!Array.isArray(raw)) return defaultWidgets();
  const out: DashboardWidget[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    if (!id) continue;
    const typeRaw = o.type;
    const widgetType = typeRaw === "fear-greed" ? "index" : typeRaw;
    if (!isWidgetType(widgetType)) continue;
    const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : 0;
    const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : 0;
    const anchorX = o.anchorX === "right" || o.anchorX === "left" ? o.anchorX : undefined;
    const anchorY = o.anchorY === "bottom" || o.anchorY === "top" ? o.anchorY : undefined;
    const insetRight =
      typeof o.insetRight === "number" && Number.isFinite(o.insetRight) ? o.insetRight : undefined;
    const insetBottom =
      typeof o.insetBottom === "number" && Number.isFinite(o.insetBottom) ? o.insetBottom : undefined;
    const symRaw = o.symbol;
    const symbol =
      typeof symRaw === "string" && symRaw.trim().length > 0 ? symRaw.trim().toUpperCase() : undefined;
    const compareDaysRaw = o.compareDays;
    const compareDays =
      typeof compareDaysRaw === "number" && Number.isFinite(compareDaysRaw)
        ? normalizeFedCurveCompareDays(compareDaysRaw)
        : undefined;
    const symbolsRaw = o.symbols;
    const legacySymbols =
      o.type === "watchlist" && symbolsRaw !== undefined ? normalizeSymbolList(symbolsRaw) : undefined;
    const symbols =
      legacySymbols && legacySymbols.length > 0 ? legacySymbols : undefined;
    const watchlistListsRaw = o.type === "watchlist" ? normalizeWatchlistLists(o.watchlistLists) : undefined;
    const activeWatchlistListIdRaw =
      o.type === "watchlist" && typeof o.activeWatchlistListId === "string"
        ? o.activeWatchlistListId
        : undefined;
    const watchlistState =
      o.type === "watchlist"
        ? resolveWatchlistWidgetState(
            watchlistListsRaw,
            activeWatchlistListIdRaw,
            watchlistListsRaw ? undefined : legacySymbols,
          )
        : null;
    const indexId =
      widgetType === "index"
        ? normalizeMarketIndexId(typeRaw === "fear-greed" ? "fear-greed" : o.indexId)
        : undefined;
    out.push({
      id,
      type: widgetType,
      x,
      y,
      ...(anchorX ? { anchorX } : {}),
      ...(anchorY ? { anchorY } : {}),
      ...(anchorX === "right" && insetRight !== undefined ? { insetRight } : {}),
      ...(anchorY === "bottom" && insetBottom !== undefined ? { insetBottom } : {}),
      ...(symbol ? { symbol } : {}),
      ...(compareDays !== undefined ? { compareDays } : {}),
      ...(widgetType === "index" ? { indexId } : {}),
      ...(o.type === "watchlist" && watchlistState
        ? {
            watchlistLists: watchlistState.watchlistLists,
            activeWatchlistListId: watchlistState.activeWatchlistListId,
            watchlistChangeDisplay: normalizeWatchlistChangeDisplay(o.watchlistChangeDisplay),
            watchlistChangePeriod: normalizeWatchlistChangePeriod(o.watchlistChangePeriod),
          }
        : symbols !== undefined
          ? { symbols }
          : {}),
    });
  }
  return out.length > 0 ? out : defaultWidgets();
}

/** Нормализует виджеты из API/localStorage в тип дашборда. */
export function normalizeDashboardWidgets(raw: unknown): DashboardWidget[] {
  return normalizeWidgets(raw);
}

export function loadDashboardWidgets(): DashboardWidget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWidgets();
    return normalizeWidgets(JSON.parse(raw));
  } catch {
    return defaultWidgets();
  }
}

export function saveDashboardWidgets(widgets: DashboardWidget[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    /* ignore */
  }
}
