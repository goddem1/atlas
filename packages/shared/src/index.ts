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
