export type MarketIndexDailyBarPoint = {
  day: string;
  openTime: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  volume: string | null;
};

export type MarketIndexDailyBarsResponse = {
  indexId: string;
  bars: number;
  points: MarketIndexDailyBarPoint[];
};
