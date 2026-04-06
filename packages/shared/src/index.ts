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

export type DashboardLayout = DashboardLayoutItem[];

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

/** Одна дневная свеча (ответ GET /widgets/candles). */
export interface CandleApiRow {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}
