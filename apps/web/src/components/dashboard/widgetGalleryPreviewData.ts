import type {
  BondsYieldCurveResponse,
  MacroEventRow,
  PortfolioChartResponse,
  PortfolioSummaryResponse,
  TelegramNewsWidgetExplanation,
} from "@atlas-v1/shared";
import type { WatchlistRow } from "../widgets/watchlist/WatchlistCard";
import type { NewsWidgetItem } from "../widgets/news/newsClassify";

const FED_TENORS = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"] as const;

const FED_CURRENT_CLOSES = ["5.32", "5.28", "5.25", "5.08", "4.92", "4.75", "4.55", "4.48", "4.42", "4.65", "4.58"];
const FED_MONTH_AGO_CLOSES = ["5.38", "5.34", "5.30", "5.15", "4.98", "4.82", "4.62", "4.55", "4.50", "4.72", "4.66"];

export const GALLERY_PRICE_SPARKLINE = {
  symbol: "BTC",
  iconUrl: "/assets/crypto/BTC.svg",
  priceDisplay: "67,420.00",
  changePercent: 0.93,
  liveDirection: "up" as const,
  series: [61_200, 62_500, 61_800, 63_200, 64_100, 66_800, 67_420],
  xLabels: ["06.06", "07.06", "08.06", "09.06", "10.06", "11.06", "12.06"],
};

export const GALLERY_WATCHLIST_ROWS: WatchlistRow[] = [
  {
    symbol: "BTC",
    iconUrl: "/assets/crypto/BTC.svg",
    price: 67_420,
    changePercent: 1.24,
    changeAbs: 826,
  },
  {
    symbol: "ETH",
    iconUrl: "/assets/crypto/ETH.svg",
    price: 3_540,
    changePercent: -0.42,
    changeAbs: -15,
  },
  {
    symbol: "SOL",
    iconUrl: "/assets/crypto/SOL.svg",
    price: 142.5,
    changePercent: 3.08,
    changeAbs: 4.26,
  },
];

export const GALLERY_MACRO_EVENTS: MacroEventRow[] = [
  {
    id: "gallery-macro-1",
    indicatorId: "gallery-cpi",
    locale: "ru",
    country: "US",
    category: "inflation",
    name: "Индекс потребительских цен",
    unit: "%",
    importance: "high",
    date: "2025-06-12T15:30:00+03:00",
    reference: "м/м",
    isPending: false,
    actual: "0.2",
    forecast: "0.3",
    previous: "0.4",
  },
  {
    id: "gallery-macro-2",
    indicatorId: "gallery-claims",
    locale: "ru",
    country: "US",
    category: "employment",
    name: "Заявки на пособие по безработице",
    unit: "K",
    importance: "medium",
    date: "2025-06-12T17:00:00+03:00",
    reference: null,
    isPending: false,
    actual: "218",
    forecast: "220",
    previous: "215",
  },
  {
    id: "gallery-macro-3",
    indicatorId: "gallery-fomc",
    locale: "ru",
    country: "US",
    category: "rates",
    name: "Решение ФРС по ставке",
    unit: "%",
    importance: "high",
    date: "2025-06-12T21:00:00+03:00",
    reference: null,
    isPending: false,
    actual: "5.25",
    forecast: "5.25",
    previous: "5.25",
  },
];

export const GALLERY_FED_CURVE: BondsYieldCurveResponse = {
  tenors: [...FED_TENORS],
  asOfDate: "2025-06-12T00:00:00.000Z",
  monthAgoDate: "2025-05-12T00:00:00.000Z",
  compareDays: 30,
  current: FED_TENORS.map((symbol, i) => ({ symbol, close: FED_CURRENT_CLOSES[i] ?? null })),
  monthAgo: FED_TENORS.map((symbol, i) => ({ symbol, close: FED_MONTH_AGO_CLOSES[i] ?? null })),
};

export const GALLERY_PORTFOLIO_SUMMARY: PortfolioSummaryResponse = {
  totalValueUsd: "124580.00",
  totalPnlUsd: "5240.00",
  assets: [
    {
      symbol: "BTC",
      name: "Bitcoin",
      iconUrl: "/assets/crypto/BTC.svg",
      currentPriceUsd: "67420.00",
      currentValueUsd: "84200.00",
      pnlUsd: "3200.00",
      coinsHeld: "1.25",
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      iconUrl: "/assets/crypto/ETH.svg",
      currentPriceUsd: "3540.00",
      currentValueUsd: "28320.00",
      pnlUsd: "1240.00",
      coinsHeld: "8.00",
    },
    {
      symbol: "SOL",
      name: "Solana",
      iconUrl: "/assets/crypto/SOL.svg",
      currentPriceUsd: "142.50",
      currentValueUsd: "12060.00",
      pnlUsd: "800.00",
      coinsHeld: "84.60",
    },
  ],
};

export const GALLERY_PORTFOLIO_CHART: PortfolioChartResponse = {
  timeframe: "d",
  points: [
    { date: "2025-06-01", valueUsd: "115200.00" },
    { date: "2025-06-02", valueUsd: "116450.00" },
    { date: "2025-06-03", valueUsd: "115980.00" },
    { date: "2025-06-04", valueUsd: "117600.00" },
    { date: "2025-06-05", valueUsd: "118900.00" },
    { date: "2025-06-06", valueUsd: "119400.00" },
    { date: "2025-06-07", valueUsd: "120100.00" },
    { date: "2025-06-08", valueUsd: "121300.00" },
    { date: "2025-06-09", valueUsd: "122050.00" },
    { date: "2025-06-10", valueUsd: "123200.00" },
    { date: "2025-06-11", valueUsd: "123850.00" },
    { date: "2025-06-12", valueUsd: "124580.00" },
  ],
};

const GALLERY_NEWS_TEXT =
  "Это самая важная новость в мире, поэтому мы написали ее сюда и отобразили в нашем виджете.";

export const GALLERY_NEWS_SENTIMENT = 72;

export const GALLERY_NEWS_EXPLANATION: TelegramNewsWidgetExplanation = {
  formula:
    "Сентимент 72%: среди кандидатов условно 9 позитивных и 3 негативных сигнала. Формула: 50 + ((9−3)/(9+3))×40 ≈ 70, округление и калибровка → 72%.",
  notes: Array.from({ length: 5 }, (_, i) => ({
    id: `gallery-news-${i}`,
    why: "Сильный макро-сигнал с широким охватом рынка.",
    impact: "Может сдвинуть риск-аппетит и волатильность по рисковым активам.",
  })),
};

export const GALLERY_NEWS_ITEMS: NewsWidgetItem[] = Array.from({ length: 5 }, (_, i) => {
  const tags = [
    { id: "macro" as const, label: "Макро", color: "#FF8D28" },
    { id: "crypto" as const, label: "Крипто", color: "#0088FF" },
    { id: "funds" as const, label: "Фонда", color: "#CB30E0" },
    { id: "markets" as const, label: "Рынок", color: "#34C759" },
    { id: "markets" as const, label: "Рынок", color: "#34C759" },
  ];
  return {
    key: `gallery-news-${i}`,
    channelUsername: "gallery",
    messageId: i + 1,
    text: GALLERY_NEWS_TEXT,
    url: "https://t.me/",
    date: "2025-06-12T12:00:00.000Z",
    tag: tags[i]!,
  };
});
