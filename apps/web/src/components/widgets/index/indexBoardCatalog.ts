import { formatIndexCompactValue, indexChangeTone } from "./indexFormat";
import type { MarketIndexId, MarketIndexSnapshot } from "./marketIndexCatalog";

export type IndexBoardRow = {
  id: MarketIndexId;
  label: string;
};

/** Строки сводного виджета индексов (порядок как в макете). */
export const INDEX_BOARD_ROWS: IndexBoardRow[] = [
  { id: "fear-greed", label: "Страх и жадность" },
  { id: "btc-dominance", label: "BTC дом." },
  { id: "total-2", label: "Total 2" },
  { id: "total-3", label: "Total 3" },
  { id: "funding", label: "Фандинг" },
  { id: "vix", label: "VIX" },
  { id: "dxy", label: "DXY" },
];

export function formatMarketIndexBoardValue(id: MarketIndexId, value: number): string {
  switch (id) {
    case "fear-greed":
      return String(Math.round(value));
    case "btc-dominance":
      return value.toFixed(2);
    case "total-1":
    case "total-2":
    case "total-3":
      return formatIndexCompactValue(value);
    case "funding":
      return `${value.toFixed(4)}%`;
    case "vix":
      return value.toFixed(2);
    case "dxy":
      return value.toFixed(3);
    default:
      return String(value);
  }
}

export function indexBoardChangeTone(
  id: MarketIndexId,
  snapshot: MarketIndexSnapshot,
): "pos" | "neg" | "zero" {
  if (id === "funding") {
    if (snapshot.value > 0) return "pos";
    if (snapshot.value < 0) return "neg";
    return "zero";
  }
  return indexChangeTone(snapshot.changePercent);
}
