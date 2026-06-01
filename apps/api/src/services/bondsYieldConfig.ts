/** Теноры кривой в BondsPrices.symbol и соответствующие тикеры TradingView / серии FRED. */
export const BONDS_YIELD_TENOR_SOURCES = [
  { symbol: "1M", tvTicker: "US01MY", fredSeriesId: "DGS1MO" },
  { symbol: "3M", tvTicker: "US03MY", fredSeriesId: "DGS3MO" },
  { symbol: "6M", tvTicker: "US06MY", fredSeriesId: "DGS6MO" },
  { symbol: "1Y", tvTicker: "US01Y", fredSeriesId: "DGS1" },
  { symbol: "2Y", tvTicker: "US02Y", fredSeriesId: "DGS2" },
  { symbol: "3Y", tvTicker: "US03Y", fredSeriesId: "DGS3" },
  { symbol: "5Y", tvTicker: "US05Y", fredSeriesId: "DGS5" },
  { symbol: "7Y", tvTicker: "US07Y", fredSeriesId: "DGS7" },
  { symbol: "10Y", tvTicker: "US10Y", fredSeriesId: "DGS10" },
  { symbol: "20Y", tvTicker: "US20Y", fredSeriesId: "DGS20" },
  { symbol: "30Y", tvTicker: "US30Y", fredSeriesId: "DGS30" },
] as const;

export const BONDS_YIELD_INTERVAL = "1D";

export const BONDS_TV_RAPIDAPI_HOST = "tradingview-data1.p.rapidapi.com";

/** Лимит бесплатного плана RapidAPI на один ключ (запросов в месяц). */
export const BONDS_TV_MONTHLY_LIMIT_DEFAULT = 150;

/** Пауза между запросами TradingView (лимит RPS на BASIC). */
export const BONDS_TV_REQUEST_DELAY_MS_DEFAULT = 1300;

/** Сколько последних календарных дней подтягивать из FRED (из‑за лага публикации). */
export const BONDS_FRED_LOOKBACK_DAYS_DEFAULT = 21;
