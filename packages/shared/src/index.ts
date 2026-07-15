import type { WatchlistListData, WatchlistChangeDisplay, WatchlistChangePeriod } from "./watchlistDashboard.js";

/** Base dashboard grid item (react-grid-layout layout entry). */
export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

/** Виджет на канвасе дашборда (web). */
export type DashboardCanvasWidgetType =
  | "price-sparkline"
  | "portfolio"
  | "macro-calendar"
  | "fed-curve"
  | "watchlist";

export interface DashboardCanvasWidget {
  id: string;
  type: DashboardCanvasWidgetType;
  x: number;
  y: number;
  symbol?: string;
  /** Смещение серой линии кривой ФРС (дней), только для `fed-curve`. */
  compareDays?: number;
  /** Тикеры в списке, только для `watchlist` (legacy — мигрируется в `watchlistLists`). */
  symbols?: string[];
  /** Списки watchlist с тикерами — только для `watchlist`. */
  watchlistLists?: WatchlistListData[];
  /** Активный список watchlist — только для `watchlist`. */
  activeWatchlistListId?: string;
  /** Отображение изменения цены — только для `watchlist`. */
  watchlistChangeDisplay?: WatchlistChangeDisplay;
  /** Период изменения цены — только для `watchlist`. */
  watchlistChangePeriod?: WatchlistChangePeriod;
}

export type DashboardTheme = "light" | "dark";
export type DashboardLanguage = "ru" | "en";
export type DashboardDisplayCurrency = "rub" | "eur" | "usd";

export interface DashboardUserPrefs {
  theme: DashboardTheme;
  gridOpacity: number;
  language?: DashboardLanguage;
  displayCurrency?: DashboardDisplayCurrency;
  notificationsDisabled?: boolean;
}

/** Сохранённое состояние дашборда пользователя (layout в Prisma Dashboard). */
export interface UserDashboardState {
  version: 1;
  widgets: DashboardCanvasWidget[];
  prefs: DashboardUserPrefs;
}

/** Widget kinds supported by Atlas_v1 (MVP). */
export type WidgetType =
  | "priceTicker"
  | "miniChart"
  | "tickerTape"
  | "macroCalendar"
  | "newsFeed"
  | "newsSummary"
  | "fearGreed"
  | "cryptoIndices"
  | "portfolio";

export interface WidgetConfigBase {
  id: string;
  type: WidgetType;
}

export type WidgetConfig = WidgetConfigBase & Record<string, unknown>;

export interface ApiHealthResponse {
  status: "ok";
  timestamp: string;
}

/** Строка из `CryptocurrencyList` (ответ GET /cryptocurrencies). */
export interface CryptocurrencyListItem {
  id: string;
  symbol: string;
  name: string;
  iconUrl: string;
  pairSymbol: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BondsYieldCurvePoint {
  symbol: string;
  close: string | null;
}

/** Кривая доходности Treasury (GET /widgets/bonds-yield-curve). */
export interface BondsYieldCurveResponse {
  tenors: string[];
  asOfDate: string | null;
  monthAgoDate: string | null;
  compareDays: number;
  current: BondsYieldCurvePoint[];
  monthAgo: BondsYieldCurvePoint[];
}

/** Одна дневная свеча (ответ GET /widgets/candles). */
export interface CandleApiRow {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export type PortfolioTimeframe = "d" | "m" | "y" | "all";

export type PortfolioTransactionType = "BUY" | "SELL";

export interface PortfolioAssetSummary {
  symbol: string;
  name: string;
  iconUrl: string;
  currentPriceUsd: string;
  currentValueUsd: string;
  pnlUsd: string;
  coinsHeld: string;
}

export interface PortfolioSummaryResponse {
  totalValueUsd: string;
  totalPnlUsd: string;
  assets: PortfolioAssetSummary[];
}

export interface PortfolioChartPoint {
  date: string;
  valueUsd: string;
}

export interface PortfolioChartResponse {
  timeframe: PortfolioTimeframe;
  points: PortfolioChartPoint[];
}

export interface PortfolioTransactionGoalInput {
  targetPriceUsd: string;
  sellCoins: string;
}

export interface PortfolioTransactionUpsertInput {
  symbol: string;
  type: PortfolioTransactionType;
  date: string;
  priceUsd: string;
  amountCoins: string;
  amountUsd: string;
  goals?: PortfolioTransactionGoalInput[];
}

export interface PortfolioGoalDto {
  id: string;
  targetPriceUsd: string;
  sellCoins: string;
  potentialProfitUsd: string;
  createdAt: string;
}

export interface PortfolioTransactionDto {
  id: string;
  type: PortfolioTransactionType;
  date: string;
  priceUsd: string;
  amountCoins: string;
  amountUsd: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioAssetDetailResponse {
  symbol: string;
  name: string;
  iconUrl: string;
  averageBuyPriceUsd: string;
  coinsHeld: string;
  transactions: PortfolioTransactionDto[];
  goals: PortfolioGoalDto[];
}

export type MacroEventImportance = "low" | "medium" | "high";

export interface MacroEventRow {
  id: string;
  indicatorId: string;
  locale: string;
  country: string;
  category: string;
  name: string;
  unit: string;
  importance: MacroEventImportance;
  date: string; // scheduled datetime ISO
  reference: string | null;
  isPending: boolean;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface MacroEventsResponse {
  events: MacroEventRow[];
  chartByIndicator?: Record<
    string,
    {
      unit: string;
      tiny: Array<{ label: string; value: number }>;
      year: Array<{ label: string; value: number }>;
    }
  >;
  historyCountsByIndicator?: Record<string, number>;
}

export interface MacroSeriesIndicatorDto {
  id: string;
  name: string;
  unit: string;
  country: string;
  category: string;
  /** Например `weekly`, `monthly` — для оси X и подсказки графика. */
  frequency?: string;
}

export interface MacroSeriesPointDto {
  id: string;
  date: string;
  reference: string | null;
  isPending: boolean;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface MacroSeriesResponse {
  indicator: MacroSeriesIndicatorDto;
  points: MacroSeriesPointDto[];
}

export type { WatchlistListData, WatchlistChangeDisplay, WatchlistChangePeriod } from "./watchlistDashboard.js";
export type { KlineDrawingToolPin, KlineDrawingPinsResponse } from "./klineDrawingPins.js";
export type {
  KlineStoredOverlay,
  KlineStoredOverlayPoint,
  KlineOverlaysResponse,
  KlineOverlayLabelData,
  KlineOverlayLabelAlong,
  KlineOverlayLabelSide,
} from "./klineOverlays.js";
export type {
  KlineStoredIndicatorEntry,
  KlineStoredIndicators,
  KlineIndicatorsResponse,
} from "./klineIndicators.js";
export { normalizeKlineDrawingPins } from "./klineDrawingPins.js";
export {
  normalizeKlineOverlays,
  normalizeKlinePairSymbol,
  normalizeKlineOverlayLabelData,
} from "./klineOverlays.js";
export { normalizeKlineIndicators } from "./klineIndicators.js";
export {
  DEFAULT_WATCHLIST_LIST_ID,
  DEFAULT_WATCHLIST_CHANGE_DISPLAY,
  DEFAULT_WATCHLIST_CHANGE_PERIOD,
  WATCHLIST_MAX_SYMBOLS,
  capWatchlistSymbolList,
  normalizeSymbolList,
  normalizeWatchlistLists,
  normalizeWatchlistChangeDisplay,
  normalizeWatchlistChangePeriod,
  resolveWatchlistWidgetState,
} from "./watchlistDashboard.js";
export {
  parsePortfolioUsd,
  roundPortfolioUsdForDisplay,
  sumPortfolioPnlUsd,
} from "./portfolioPnl.js";
