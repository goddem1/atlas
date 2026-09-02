export interface FundingRateEntry {
  symbol: string;
  pair: string;
  exchange: string;
  fundingRate: number;
  lastUpdated: string;
}

export type CmcDailySnapshotHistoryField =
  | "fearGreedValue"
  | "btcDominance"
  | "ethDominance"
  | "totalMarketCap"
  | "altcoinMarketCap"
  | "btcMarketCap"
  | "ethMarketCap"
  | "total3MarketCap"
  | "altcoinSeasonIndex"
  | "altcoinSeasonMarketCap";

export interface CmcDailySnapshotHistoryPoint {
  day: string;
  value: number | string | null;
}

export interface CmcDailySnapshotLatestResponse {
  day: string;
  fearGreedValue: number;
  fearGreedClassification: string;
  btcDominance: string;
  ethDominance: string;
  totalMarketCap: string;
  altcoinMarketCap: string;
  btcMarketCap: string;
  ethMarketCap: string;
  total3MarketCap: string;
  altcoinSeasonIndex: number;
  altcoinSeasonMarketCap: string | null;
  fundingRates: FundingRateEntry[];
  createdAt: string;
}
