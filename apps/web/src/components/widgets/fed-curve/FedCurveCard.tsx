import { useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { FedCurveCompareDays } from "../../../lib/fedCurveComparePeriod";
import { computeYScale } from "./fedCurveChartUtils";
import {
  computeFedCurveWidgetTooltipPos,
  formatFedCurveWidgetTooltipLine,
} from "./fedCurveWidgetTooltip";
import { FedCurveLineGroup } from "./FedCurveLineGroup";
import { FedCurvePeriodSettings } from "./FedCurvePeriodSettings";

const VIEW_W = 320;
const VIEW_H = 168;
const PAD = { t: 12, r: 10, b: 12, l: 34 };

type ChartPoint = { x: number; y: number; index: number };

function smoothLinePath(pts: ChartPoint[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const p = pts[0]!;
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const n = pts.length;
  const tangents = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tangents[i] = (ys[1]! - ys[0]!) / (xs[1]! - xs[0]!);
    } else if (i === n - 1) {
      tangents[i] = (ys[n - 1]! - ys[n - 2]!) / (xs[n - 1]! - xs[n - 2]!);
    } else {
      const dk = (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!);
      const dk1 = (ys[i]! - ys[i - 1]!) / (xs[i]! - xs[i - 1]!);
      tangents[i] = dk * dk1 <= 0 ? 0 : (dk + dk1) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const dk = (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!);
    if (dk === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i]! / dk;
      const beta = tangents[i + 1]! / dk;
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * alpha * dk;
        tangents[i + 1] = t * beta * dk;
      }
    }
  }

  let d = `M ${xs[0]!.toFixed(2)} ${ys[0]!.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1]! - xs[i]!) / 3;
    const cp1x = xs[i]! + dx;
    const cp1y = ys[i]! + tangents[i]! * dx;
    const cp2x = xs[i + 1]! - dx;
    const cp2y = ys[i + 1]! - tangents[i + 1]! * dx;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${xs[i + 1]!.toFixed(2)} ${ys[i + 1]!.toFixed(2)}`;
  }
  return d;
}

const Y_TICK_COUNT = 5;

export type FedCurveCardProps = {
  tenors: string[];
  currentValues: Array<number | null>;
  monthAgoValues: Array<number | null>;
  asOfDate?: string | null;
  monthAgoDate?: string | null;
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  compareDays: FedCurveCompareDays;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onCompareDaysChange?: (days: FedCurveCompareDays) => void;
  onOpenDetail?: () => void;
};

export function FedCurveCard({
  tenors,
  currentValues,
  monthAgoValues,
  asOfDate = null,
  monthAgoDate = null,
  dragHandleClassName,
  onDeleteWidget,
  compareDays,
  settingsOpen,
  onSettingsOpenChange,
  onCompareDaysChange,
  onOpenDetail,
}: FedCurveCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const currentMaskId = useId();
  const pastMaskId = useId();
  const count = tenors.length;

  const { currentPts, monthPts, gridYs, yLabels, bottomY } = useMemo(() => {
    const scale = computeYScale(tenors, [currentValues, monthAgoValues], Y_TICK_COUNT);
    if (!scale) {
      return {
        currentPts: [] as ChartPoint[],
        monthPts: [] as ChartPoint[],
        gridYs: [] as number[],
        yLabels: [] as string[],
        bottomY: VIEW_H - PAD.b,
      };
    }
    const { min, max, ticks } = scale;

    const toPts = (vals: Array<number | null>) => {
      const innerH = VIEW_H - PAD.t - PAD.b;
      const span = max - min || 1;
      const innerW = VIEW_W - PAD.l - PAD.r;
      const denom = count - 1;
      const pts: ChartPoint[] = [];
      vals.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) return;
        const x = PAD.l + (denom <= 0 ? 0 : (i / denom) * innerW);
        const y = PAD.t + innerH - ((v - min) / span) * innerH;
        pts.push({ x, y, index: i });
      });
      return pts;
    };

    const innerH = VIEW_H - PAD.t - PAD.b;
    const span = max - min || 1;
    const gridYs = ticks.map((t) => PAD.t + innerH - ((t - min) / span) * innerH);

    return {
      currentPts: toPts(currentValues),
      monthPts: toPts(monthAgoValues),
      gridYs,
      yLabels: ticks.map((t) => t.toFixed(1)),
      bottomY: VIEW_H - PAD.b,
    };
  }, [count, tenors, currentValues, monthAgoValues]);

  const monthPath = monthPts.length >= 2 ? smoothLinePath(monthPts) : "";
  const currentPath = currentPts.length >= 2 ? smoothLinePath(currentPts) : "";

  const hoverPts = currentPts.length > 0 ? currentPts : monthPts;
  const canHover = hoverPts.length > 1;

  const activeIndex =
    hoveredIndex !== null && tenors[hoveredIndex] !== undefined
      ? hoveredIndex
      : hoverPts.length > 0
        ? hoverPts[hoverPts.length - 1]!.index
        : 0;

  const currentHover = currentPts.find((p) => p.index === activeIndex) ?? null;
  const monthHover = monthPts.find((p) => p.index === activeIndex) ?? null;
  const hoverX = currentHover?.x ?? monthHover?.x ?? null;
  const tenorLabel = tenors[activeIndex] ?? "";

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!canHover || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = hoverPts[0]!.index;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const p of hoverPts) {
      const delta = Math.abs(p.x - svgX);
      if (delta < nearestDelta) {
        nearest = p.index;
        nearestDelta = delta;
      }
    }
    setHoveredIndex((prev) => (prev === nearest ? prev : nearest));

    const pt = hoverPts.find((p) => p.index === nearest) ?? hoverPts[0]!;
    const cur = currentPts.find((p) => p.index === nearest);
    const past = monthPts.find((p) => p.index === nearest);
    const ax = cur?.x ?? past?.x ?? pt.x;
    const ay =
      cur && past ? Math.min(cur.y, past.y) : (cur?.y ?? past?.y ?? pt.y);

    if (rect.width > 0 && rect.height > 0) {
      setTooltipPos(computeFedCurveWidgetTooltipPos(rect.width, rect.height, ax, ay));
    }
  };

  const anchorY =
    currentHover && monthHover
      ? Math.min(currentHover.y, monthHover.y)
      : (currentHover?.y ?? monthHover?.y ?? PAD.t);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (hoveredIndex === null || !chart || hoverX === null || !tenorLabel) {
      setTooltipPos(null);
      return;
    }
    const { width, height } = chart.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    setTooltipPos(computeFedCurveWidgetTooltipPos(width, height, hoverX, anchorY));
  }, [hoveredIndex, hoverX, anchorY, tenorLabel]);

  return (
    <div className={`fed-curve-widget-shell ${dragHandleClassName ?? ""}`.trim()}>
      <div
        className={`portfolio-menu-wrap${menuOpen ? " is-open" : ""}`}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft fed-curve-settings-trigger"
            onClick={() => {
              setMenuOpen(false);
              onSettingsOpenChange(true);
            }}
            aria-label="Настройки периода серой линии"
            aria-expanded={settingsOpen}
          >
            <img src="/assets/portfolio-ui/settings.svg" alt="" className="portfolio-menu-circle-icon" />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => {
              setMenuOpen(false);
              onOpenDetail?.();
            }}
            aria-label="Подробный график"
          >
            <img
              src="/assets/portfolio-ui/arrow_line_top.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-arrow"
            />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close" />
          </button>
        </div>
        <FedCurvePeriodSettings
          open={settingsOpen}
          compareDays={compareDays}
          onSelect={(days) => onCompareDaysChange?.(days)}
          onClose={() => onSettingsOpenChange(false)}
        />
      </div>

      <div className="atlas-glass fed-curve-chart-panel">
        <div
          ref={chartRef}
          className="fed-curve-chart-interactive"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <div className="fed-curve-svg-layer">
            <svg
              className="fed-curve-svg"
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Кривая доходности Treasury"
            >
            {yLabels.map((label, gi) => {
              const gy = gridYs[gi];
              if (gy === undefined) return null;
              return (
                <text key={label} x={PAD.l - 6} y={gy + 4} textAnchor="end" className="fed-curve-y-label">
                  {label}
                </text>
              );
            })}

            {hoveredIndex !== null && hoverX !== null ? (
              <line
                x1={hoverX}
                y1={PAD.t}
                x2={hoverX}
                y2={bottomY}
                className="fed-curve-hover-line"
              />
            ) : null}

            <FedCurveLineGroup
              pts={monthPts}
              pathD={monthPath}
              maskId={pastMaskId}
              lineClassName="fed-curve-line fed-curve-line--past"
              dotClassName="fed-curve-series-dot fed-curve-series-dot--past"
              hoveredIndex={hoveredIndex}
            />

            <FedCurveLineGroup
              pts={currentPts}
              pathD={currentPath}
              maskId={currentMaskId}
              lineClassName="fed-curve-line fed-curve-line--current"
              dotClassName="fed-curve-series-dot fed-curve-series-dot--current"
              hoveredIndex={hoveredIndex}
            />
            </svg>
          </div>
        </div>
      </div>

      {hoveredIndex !== null && tenorLabel && tooltipPos ? (
        <div
          className="fed-curve-tooltip"
          style={{
            left: tooltipPos.left,
            top: tooltipPos.top,
          }}
          role="tooltip"
        >
          <p className="fed-curve-tooltip-tenor">{tenorLabel}</p>
          <p className="fed-curve-tooltip-row fed-curve-tooltip-row--current">
            <span className="fed-curve-tooltip-dot" aria-hidden />
            {formatFedCurveWidgetTooltipLine(asOfDate, currentValues[activeIndex] ?? null)}
          </p>
          <p className="fed-curve-tooltip-row fed-curve-tooltip-row--past">
            <span className="fed-curve-tooltip-dot" aria-hidden />
            {formatFedCurveWidgetTooltipLine(monthAgoDate, monthAgoValues[activeIndex] ?? null)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
