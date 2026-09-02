import { formatIndexCompactValue } from "./indexFormat";

export type MarketIndexId =
  | "fear-greed"
  | "btc-dominance"
  | "total-1"
  | "total-2"
  | "total-3"
  | "funding"
  | "vix"
  | "dxy";

export type MarketIndexDisplayMode = "gauge" | "change";

export type MarketIndexMeta = {
  id: MarketIndexId;
  label: string;
  displayMode: MarketIndexDisplayMode;
};

export type MarketIndexSnapshot = {
  value: number;
  changePercent: number;
};

export const MARKET_INDEX_CATALOG: MarketIndexMeta[] = [
  { id: "fear-greed", label: "Страх и жадн.", displayMode: "gauge" },
  { id: "btc-dominance", label: "BTC доминация", displayMode: "change" },
  { id: "total-1", label: "Total", displayMode: "change" },
  { id: "total-2", label: "Total 2", displayMode: "change" },
  { id: "total-3", label: "Total 3", displayMode: "change" },
  { id: "funding", label: "Фандинг", displayMode: "change" },
  { id: "vix", label: "VIX", displayMode: "change" },
  { id: "dxy", label: "DXY", displayMode: "change" },
];

export const DEFAULT_MARKET_INDEX_ID: MarketIndexId = "total-2";

const MARKET_INDEX_IDS = new Set<string>(MARKET_INDEX_CATALOG.map((item) => item.id));

/** Fallback для VIX/DXY и до первой загрузки API. */
export const MARKET_INDEX_MOCK: Record<MarketIndexId, MarketIndexSnapshot> = {
  "fear-greed": { value: 52, changePercent: 0 },
  "btc-dominance": { value: 54.2, changePercent: 0.3 },
  "total-1": { value: 2.45e12, changePercent: 0.18 },
  "total-2": { value: 771.68e9, changePercent: 0.2 },
  "total-3": { value: 892.1e9, changePercent: -0.15 },
  funding: { value: 0.01, changePercent: 0.01 },
  vix: { value: 15.2, changePercent: -2.1 },
  dxy: { value: 104.5, changePercent: 0.08 },
};

export function normalizeMarketIndexId(value: unknown): MarketIndexId {
  if (typeof value === "string" && MARKET_INDEX_IDS.has(value)) {
    return value as MarketIndexId;
  }
  return DEFAULT_MARKET_INDEX_ID;
}

export function getMarketIndexMeta(id: MarketIndexId): MarketIndexMeta {
  return MARKET_INDEX_CATALOG.find((item) => item.id === id) ?? MARKET_INDEX_CATALOG.find((item) => item.id === DEFAULT_MARKET_INDEX_ID)!;
}

export function formatMarketIndexValue(id: MarketIndexId, value: number): string {
  switch (id) {
    case "fear-greed":
      return String(Math.round(value));
    case "btc-dominance":
      return `${value.toFixed(1)}%`;
    case "total-1":
    case "total-2":
    case "total-3":
      return formatIndexCompactValue(value);
    case "funding": {
      const sign = value > 0 ? "+" : value < 0 ? "−" : "";
      return `${sign}${Math.abs(value).toFixed(2)}%`;
    }
    case "vix":
      return value.toFixed(1);
    case "dxy":
      return value.toFixed(2);
    default:
      return String(value);
  }
}
