export type FearGreedDailyBarPoint = {
  day: string;
  score: number;
  classification: string;
  barTime: string;
};

export type FearGreedDailyBarsResponse = {
  bars: number;
  points: FearGreedDailyBarPoint[];
};
