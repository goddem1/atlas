import type { SymbolInfo } from "@klinecharts/pro";
import { CandleType } from "klinecharts";
import {
  BTC_DOMINANCE_CHART_PAIR,
  BTC_DOMINANCE_CHART_SYMBOL,
  buildBtcDominanceSymbolInfo,
} from "../price-sparkline/btcDominanceChartSymbol";
import {
  DXY_CHART_PAIR,
  DXY_CHART_SYMBOL,
  buildDxySymbolInfo,
} from "../price-sparkline/dxyChartSymbol";
import {
  FEAR_GREED_CHART_PAIR,
  FEAR_GREED_CHART_SYMBOL,
  buildFearGreedSymbolInfo,
} from "../price-sparkline/fearGreedChartSymbol";
import {
  TOTAL2_MARKET_CAP_CHART_PAIR,
  TOTAL2_MARKET_CAP_CHART_SYMBOL,
  buildTotal2MarketCapSymbolInfo,
} from "../price-sparkline/total2MarketCapChartSymbol";
import {
  TOTAL3_MARKET_CAP_CHART_PAIR,
  TOTAL3_MARKET_CAP_CHART_SYMBOL,
  buildTotal3MarketCapSymbolInfo,
} from "../price-sparkline/total3MarketCapChartSymbol";
import {
  TOTAL_MARKET_CAP_CHART_PAIR,
  TOTAL_MARKET_CAP_CHART_SYMBOL,
  buildTotalMarketCapSymbolInfo,
} from "../price-sparkline/totalMarketCapChartSymbol";
import {
  VIX_CHART_PAIR,
  VIX_CHART_SYMBOL,
  buildVixSymbolInfo,
} from "../price-sparkline/vixChartSymbol";
import type { MarketIndexId } from "./marketIndexCatalog";

export type MarketIndexKlineTarget = {
  symbol: string;
  pair: string;
  symbolInfo: SymbolInfo;
  candleType: "line" | CandleType.CandleSolid;
};

export function resolveMarketIndexKlineTarget(indexId: MarketIndexId): MarketIndexKlineTarget | null {
  switch (indexId) {
    case "fear-greed":
      return {
        symbol: FEAR_GREED_CHART_SYMBOL,
        pair: FEAR_GREED_CHART_PAIR,
        symbolInfo: buildFearGreedSymbolInfo(),
        candleType: "line",
      };
    case "btc-dominance":
      return {
        symbol: BTC_DOMINANCE_CHART_SYMBOL,
        pair: BTC_DOMINANCE_CHART_PAIR,
        symbolInfo: buildBtcDominanceSymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "total-1":
      return {
        symbol: TOTAL_MARKET_CAP_CHART_SYMBOL,
        pair: TOTAL_MARKET_CAP_CHART_PAIR,
        symbolInfo: buildTotalMarketCapSymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "total-2":
      return {
        symbol: TOTAL2_MARKET_CAP_CHART_SYMBOL,
        pair: TOTAL2_MARKET_CAP_CHART_PAIR,
        symbolInfo: buildTotal2MarketCapSymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "total-3":
      return {
        symbol: TOTAL3_MARKET_CAP_CHART_SYMBOL,
        pair: TOTAL3_MARKET_CAP_CHART_PAIR,
        symbolInfo: buildTotal3MarketCapSymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "vix":
      return {
        symbol: VIX_CHART_SYMBOL,
        pair: VIX_CHART_PAIR,
        symbolInfo: buildVixSymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "dxy":
      return {
        symbol: DXY_CHART_SYMBOL,
        pair: DXY_CHART_PAIR,
        symbolInfo: buildDxySymbolInfo(),
        candleType: CandleType.CandleSolid,
      };
    case "funding":
      return null;
    default:
      return null;
  }
}

export function hasMarketIndexKlineChart(indexId: MarketIndexId): boolean {
  return resolveMarketIndexKlineTarget(indexId) != null;
}
