import { formatDateDdMmYy, type ChartPad } from "./fedCurveChartUtils";

export const FED_CURVE_WIDGET_TOOLTIP = {
  viewW: 320,
  viewH: 168,
  pad: { t: 12, r: 10, b: 12, l: 34 } satisfies ChartPad,
  width: 150,
  height: 80,
  gap: 8,
} as const;

/** Строка подсказки виджета: `14.05.26: 3.49` */
export function formatFedCurveWidgetTooltipLine(iso: string | null, value: number | null): string {
  const formatted =
    value !== null && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "—";
  return `${formatDateDdMmYy(iso)}: ${formatted}`;
}

export function computeFedCurveWidgetTooltipPos(
  width: number,
  height: number,
  hoverX: number,
  anchorY: number,
): { left: number; top: number } {
  const { viewW, viewH, pad, width: tooltipW, height: tooltipH, gap: tooltipGap } =
    FED_CURVE_WIDGET_TOOLTIP;

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
  const topAbove = anchorYPx - tooltipH - tooltipGap;
  const maxTop = innerBottom - tooltipH;
  const chartMidY = (innerTop + innerBottom) / 2;

  let top: number;
  if (anchorYPx < chartMidY) {
    top = topBelow + tooltipH <= innerBottom ? topBelow : topAbove;
  } else {
    top = topAbove >= innerTop ? topAbove : topBelow;
  }
  top = Math.max(innerTop, Math.min(top, maxTop));

  return { left: Math.round(left), top: Math.round(top) };
}
