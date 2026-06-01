import { formatDateDdMmYy, type ChartPad } from "./fedCurveChartUtils";

export const FED_CURVE_DETAIL_TOOLTIP = {
  viewW: 560,
  viewH: 260,
  pad: { t: 18, r: 18, b: 34, l: 42 } satisfies ChartPad,
  width: 150,
  gap: 8,
} as const;

export type FedCurveDetailTooltipRow = {
  dotVariant?: "current" | "compare";
  dotColor?: string;
  text: string;
};

/** Строка подсказки попапа: `14.05.26: 3.49` (2 знака — не скрываем мелкие отличия). */
export function formatFedCurveDetailTooltipLine(iso: string | null, value: number | null): string {
  const formatted =
    value !== null && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "—";
  return `${formatDateDdMmYy(iso)}: ${formatted}`;
}

export function estimateFedCurveDetailTooltipHeight(rowCount: number): number {
  return 18 + 24 + Math.max(1, rowCount) * 22;
}

export function buildFedCurveDetailTooltipRows(input: {
  hoveredIndex: number;
  selectedDate: string | null;
  asOfDate: string | null | undefined;
  monthAgoDate: string | null | undefined;
  currentValues: Array<number | null>;
  compareValues: Array<number | null>;
  pinnedCurves: Array<{ date: string; values: Array<number | null>; color: string }>;
  showCompare: boolean;
}): FedCurveDetailTooltipRow[] {
  const idx = input.hoveredIndex;
  const rows: FedCurveDetailTooltipRow[] = [];

  rows.push({
    dotVariant: "current",
    text: formatFedCurveDetailTooltipLine(
      input.selectedDate ?? input.asOfDate ?? null,
      input.currentValues[idx] ?? null,
    ),
  });

  if (input.showCompare) {
    rows.push({
      dotVariant: "compare",
      text: formatFedCurveDetailTooltipLine(
        input.monthAgoDate ?? null,
        input.compareValues[idx] ?? null,
      ),
    });
  }

  for (const pin of input.pinnedCurves) {
    rows.push({
      dotColor: pin.color,
      text: formatFedCurveDetailTooltipLine(pin.date, pin.values[idx] ?? null),
    });
  }

  return rows;
}

export function computeFedCurveDetailTooltipPos(
  width: number,
  height: number,
  hoverX: number,
  anchorY: number,
  tooltipHeight: number,
): { left: number; top: number } {
  const { viewW, viewH, pad, width: tooltipW, gap: tooltipGap } = FED_CURVE_DETAIL_TOOLTIP;

  const padL = (pad.l / viewW) * width;
  const padR = (pad.r / viewW) * width;
  const padT = (pad.t / viewH) * height;
  const padB = (pad.b / viewH) * height;

  const innerLeft = padL;
  const innerRight = width - padR;
  const innerTop = padT;
  const innerBottom = height - padB;

  const anchorXPx = (hoverX / viewW) * width;
  const anchorYPx = (anchorY / viewH) * height;

  let left: number;
  if (anchorXPx + tooltipW / 2 > innerRight) {
    left = anchorXPx - tooltipW - tooltipGap;
  } else if (anchorXPx - tooltipW / 2 < innerLeft) {
    left = anchorXPx + tooltipGap;
  } else {
    left = anchorXPx - tooltipW / 2;
  }
  left = Math.max(innerLeft, Math.min(left, innerRight - tooltipW));

  const topBelow = anchorYPx + tooltipGap;
  const topAbove = anchorYPx - tooltipHeight - tooltipGap;
  const maxTop = innerBottom - tooltipHeight;
  const chartMidY = (innerTop + innerBottom) / 2;

  let top: number;
  if (anchorYPx < chartMidY) {
    top = topBelow + tooltipHeight <= innerBottom ? topBelow : topAbove;
  } else {
    top = topAbove >= innerTop ? topAbove : topBelow;
  }
  top = Math.max(innerTop, Math.min(top, maxTop));

  return { left: Math.round(left), top: Math.round(top) };
}
