import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { BondsYieldCurveResponse } from "@atlas-v1/shared";
import {
  fedCurveComparePeriodLabel,
  type FedCurveCompareDays,
} from "../../../lib/fedCurveComparePeriod";
import {
  fetchBondsYieldCurve,
  fetchBondsYieldCurveDateBounds,
  fetchBondsYieldCurveNeighborDate,
  type BondsYieldDateBounds,
} from "../../../services/api";
import {
  buildCurvePoints,
  computeYScale,
  formatDateDdMmYy,
  smoothLinePath,
  valuesByTenors,
} from "./fedCurveChartUtils";
import {
  buildFedCurveDetailTooltipRows,
  computeFedCurveDetailTooltipPos,
  estimateFedCurveDetailTooltipHeight,
} from "./fedCurveDetailTooltip";
import { FedCurveDateCalendar } from "./FedCurveDateCalendar";
import { FedCurveLineGroup } from "./FedCurveLineGroup";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import "./fed-curve-detail-modal.css";

const CALENDAR_POPOVER_WIDTH = 300;
const CALENDAR_POPOVER_GAP = 8;

const VIEW_W = 560;
const VIEW_H = 260;
const PAD = { t: 18, r: 18, b: 34, l: 42 };
const Y_TICK_COUNT = 6;

/** Цвета закреплённых линий (по порядку добавления). */
const PINNED_CURVE_COLORS = [
  "#f59e0b",
  "#a855f7",
  "#22c55e",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#eab308",
  "#ef4444",
] as const;

function pinnedColorForIndex(index: number): string {
  return PINNED_CURVE_COLORS[index % PINNED_CURVE_COLORS.length]!;
}

type PinnedCurve = {
  date: string;
  values: Array<number | null>;
  color: string;
};

function maskIdForDate(prefix: string, isoDate: string): string {
  return `${prefix}-${isoDate.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  compareDays: FedCurveCompareDays;
};

export function FedCurveDetailModal({ open, onClose, compareDays }: Props) {
  useBackdropBlurPause(open);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateBounds, setDateBounds] = useState<BondsYieldDateBounds | null>(null);
  const [hasPrevDate, setHasPrevDate] = useState(false);
  const [hasNextDate, setHasNextDate] = useState(false);
  const [pinnedCurves, setPinnedCurves] = useState<PinnedCurve[]>([]);
  const [nextPinColorIndex, setNextPinColorIndex] = useState(0);
  /** В попапе сравнение с периодом не показываем по умолчанию (на виджете — две линии). */
  const [showCompare, setShowCompare] = useState(false);
  const [data, setData] = useState<BondsYieldCurveResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [datesErr, setDatesErr] = useState<string | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [tooltipViewportPos, setTooltipViewportPos] = useState<{ left: number; top: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPos, setCalendarPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const currentMaskId = useId();
  const compareMaskId = useId();
  const pinnedMaskPrefix = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDatesErr(null);
    setChartErr(null);
    setData(null);
    setDateBounds(null);
    setSelectedDate(null);
    setHasPrevDate(false);
    setHasNextDate(false);
    setCalendarOpen(false);
    void fetchBondsYieldCurveDateBounds()
      .then((bounds) => {
        if (cancelled) return;
        setDateBounds(bounds);
        if (bounds.max) setSelectedDate(bounds.max);
        setPinnedCurves([]);
        setNextPinColorIndex(0);
        setShowCompare(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDatesErr(e instanceof Error ? e.message : "Не удалось загрузить даты");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDate) {
      setHasPrevDate(false);
      setHasNextDate(false);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchBondsYieldCurveNeighborDate(selectedDate, "prev"),
      fetchBondsYieldCurveNeighborDate(selectedDate, "next"),
    ]).then(([prev, next]) => {
      if (cancelled) return;
      setHasPrevDate(prev !== null);
      setHasNextDate(next !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedDate]);

  useEffect(() => {
    if (!open || !selectedDate) return;
    let cancelled = false;
    setChartLoading(true);
    setChartErr(null);
    setHoveredIndex(null);
    void fetchBondsYieldCurve(compareDays, selectedDate)
      .then((body) => {
        if (cancelled) return;
        setData(body);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setChartErr(e instanceof Error ? e.message : "Не удалось загрузить кривую");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedDate, compareDays]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (calendarOpen) {
        setCalendarOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, calendarOpen]);

  useEffect(() => {
    if (!open || !calendarOpen) {
      setCalendarPos(null);
      return;
    }
    const update = () => {
      const el = dateStripRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(CALENDAR_POPOVER_WIDTH, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
      setCalendarPos({ left, top: r.bottom + CALENDAR_POPOVER_GAP, width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (dateStripRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".fed-curve-date-calendar")) return;
      setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [calendarOpen]);

  const tenors = data?.tenors ?? [];
  const currentValues = useMemo(
    () => (data ? valuesByTenors(tenors, data.current) : []),
    [data, tenors],
  );
  const compareValues = useMemo(
    () => (data ? valuesByTenors(tenors, data.monthAgo) : []),
    [data, tenors],
  );

  const chart = useMemo(() => {
    const series: Array<Array<number | null>> = [];
    if (showCompare) series.push(compareValues);
    for (const pin of pinnedCurves) series.push(pin.values);
    series.push(currentValues);
    const scale = computeYScale(tenors, series, Y_TICK_COUNT);
    if (!scale) {
      return {
        currentPts: [] as ReturnType<typeof buildCurvePoints>,
        comparePts: [] as ReturnType<typeof buildCurvePoints>,
        pinnedLayers: [] as Array<{
          date: string;
          color: string;
          pts: ReturnType<typeof buildCurvePoints>;
          pathD: string;
        }>,
        gridYs: [] as number[],
        gridXs: [] as number[],
        yLabels: [] as string[],
        xLabels: tenors.map((t, i) => ({ label: t, x: 0, index: i })),
        bottomY: VIEW_H - PAD.b,
      };
    }

    const { min, max, ticks } = scale;
    const innerH = VIEW_H - PAD.t - PAD.b;
    const span = max - min || 1;
    const innerW = VIEW_W - PAD.l - PAD.r;
    const denom = Math.max(tenors.length - 1, 1);

    const gridYs = ticks.map((t) => PAD.t + innerH - ((t - min) / span) * innerH);
    const gridXs = tenors.map((_, i) => PAD.l + (i / denom) * innerW);
    const xLabels = tenors.map((label, i) => ({
      label,
      x: PAD.l + (i / denom) * innerW,
      index: i,
    }));

    const pinnedLayers = pinnedCurves.map((pin) => {
      const pts = buildCurvePoints(tenors, pin.values, min, max, VIEW_W, VIEW_H, PAD);
      return {
        date: pin.date,
        color: pin.color,
        pts,
        pathD: pts.length >= 2 ? smoothLinePath(pts) : "",
      };
    });

    return {
      currentPts: buildCurvePoints(tenors, currentValues, min, max, VIEW_W, VIEW_H, PAD),
      comparePts: buildCurvePoints(tenors, compareValues, min, max, VIEW_W, VIEW_H, PAD),
      pinnedLayers,
      gridYs,
      gridXs,
      yLabels: ticks.map((t) => t.toFixed(1)),
      xLabels,
      bottomY: VIEW_H - PAD.b,
    };
  }, [tenors, currentValues, compareValues, pinnedCurves, showCompare]);

  const comparePath = chart.comparePts.length >= 2 ? smoothLinePath(chart.comparePts) : "";
  const currentPath = chart.currentPts.length >= 2 ? smoothLinePath(chart.currentPts) : "";

  const tooltipRows = useMemo(() => {
    if (hoveredIndex === null) return [];
    return buildFedCurveDetailTooltipRows({
      hoveredIndex,
      selectedDate,
      asOfDate: data?.asOfDate,
      monthAgoDate: data?.monthAgoDate,
      currentValues,
      compareValues,
      pinnedCurves,
      showCompare,
    });
  }, [
    hoveredIndex,
    selectedDate,
    data?.asOfDate,
    data?.monthAgoDate,
    currentValues,
    compareValues,
    pinnedCurves,
    showCompare,
  ]);

  const hoverAnchor = useMemo(() => {
    if (hoveredIndex === null) return null;

    const pts = [
      ...(showCompare ? chart.comparePts.filter((p) => p.index === hoveredIndex) : []),
      ...chart.pinnedLayers.flatMap((layer) => layer.pts.filter((p) => p.index === hoveredIndex)),
      ...chart.currentPts.filter((p) => p.index === hoveredIndex),
    ];

    if (pts.length === 0) return null;

    return {
      hoverX: chart.xLabels[hoveredIndex]?.x ?? pts[0]!.x,
      anchorY: Math.min(...pts.map((p) => p.y)),
      tenorLabel: tenors[hoveredIndex] ?? "",
    };
  }, [hoveredIndex, chart, showCompare, tenors]);

  const tooltipHeight = estimateFedCurveDetailTooltipHeight(tooltipRows.length);

  const stepDate = (direction: "prev" | "next") => {
    if (!selectedDate) return;
    void fetchBondsYieldCurveNeighborDate(selectedDate, direction).then((iso) => {
      if (iso) {
        setSelectedDate(iso);
        setCalendarOpen(false);
      }
    });
  };

  const selectDateByIso = (iso: string) => {
    setSelectedDate(iso);
    setCalendarOpen(false);
  };
  const hasChartData = data !== null && tenors.length > 0;
  const compareDateLabel = data?.monthAgoDate ? formatDateDdMmYy(data.monthAgoDate) : null;
  const isSelectedDatePinned = selectedDate !== null && pinnedCurves.some((p) => p.date === selectedDate);

  const removePinned = (date: string) => {
    setPinnedCurves((prev) => prev.filter((p) => p.date !== date));
  };

  const pinSelectedDate = () => {
    if (!selectedDate || isSelectedDatePinned) return;

    const hasCurrentData = data !== null && data.asOfDate === selectedDate;
    const values = hasCurrentData ? valuesByTenors(tenors, data.current) : [];

    const color = pinnedColorForIndex(nextPinColorIndex);
    setNextPinColorIndex((i) => i + 1);
    setPinnedCurves((prev) => [...prev, { date: selectedDate, values, color }]);

    if (values.length > 0) return;

    void fetchBondsYieldCurve(compareDays, selectedDate)
      .then((body) => {
        const next = valuesByTenors(body.tenors, body.current);
        setPinnedCurves((prev) =>
          prev.map((p) => (p.date === selectedDate ? { ...p, values: next } : p)),
        );
      })
      .catch(() => {
        setPinnedCurves((prev) => prev.filter((p) => p.date !== selectedDate));
      });
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const pinnedPts = chart.pinnedLayers.flatMap((l) => l.pts);
    const pts = [...chart.comparePts, ...pinnedPts, ...chart.currentPts];
    if (pts.length < 2 || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = pts[0]!.index;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const p of pts) {
      const delta = Math.abs(p.x - svgX);
      if (delta < nearestDelta) {
        nearest = p.index;
        nearestDelta = delta;
      }
    }
    setHoveredIndex(nearest);

    const anchorPts = [
      ...(showCompare ? chart.comparePts.filter((p) => p.index === nearest) : []),
      ...chart.pinnedLayers.flatMap((layer) => layer.pts.filter((p) => p.index === nearest)),
      ...chart.currentPts.filter((p) => p.index === nearest),
    ];
    if (anchorPts.length === 0 || rect.width < 1 || rect.height < 1) return;

    const hoverX = chart.xLabels[nearest]?.x ?? anchorPts[0]!.x;
    const anchorY = Math.min(...anchorPts.map((p) => p.y));
    const rowCount =
      1 + (showCompare ? 1 : 0) + pinnedCurves.length;

    setTooltipPos(
      computeFedCurveDetailTooltipPos(
        rect.width,
        rect.height,
        hoverX,
        anchorY,
        estimateFedCurveDetailTooltipHeight(rowCount),
      ),
    );
  };

  useLayoutEffect(() => {
    const chartEl = chartRef.current;
    if (hoveredIndex === null || !chartEl || !hoverAnchor) {
      setTooltipPos(null);
      return;
    }
    const { width, height } = chartEl.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    setTooltipPos(
      computeFedCurveDetailTooltipPos(
        width,
        height,
        hoverAnchor.hoverX,
        hoverAnchor.anchorY,
        tooltipHeight,
      ),
    );
  }, [hoveredIndex, hoverAnchor, tooltipHeight]);

  const syncTooltipViewportPos = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !tooltipPos) {
      setTooltipViewportPos(null);
      return;
    }
    const rect = chart.getBoundingClientRect();
    setTooltipViewportPos({
      left: rect.left + tooltipPos.left,
      top: rect.top + tooltipPos.top,
    });
  }, [tooltipPos]);

  useLayoutEffect(() => {
    syncTooltipViewportPos();
    if (!tooltipPos) return;
    window.addEventListener("resize", syncTooltipViewportPos);
    window.addEventListener("scroll", syncTooltipViewportPos, true);
    return () => {
      window.removeEventListener("resize", syncTooltipViewportPos);
      window.removeEventListener("scroll", syncTooltipViewportPos, true);
    };
  }, [tooltipPos, syncTooltipViewportPos]);

  if (!open) return null;

  const calendarPopover =
    calendarOpen && calendarPos
      ? createPortal(
          <>
            <div className="fed-curve-date-calendar-backdrop" aria-hidden />
            <div
              className="fed-curve-date-calendar-anchor"
              style={{ left: calendarPos.left, top: calendarPos.top, width: calendarPos.width }}
            >
              <FedCurveDateCalendar
                open
                bounds={dateBounds}
                selectedDate={selectedDate}
                onSelect={selectDateByIso}
                onClose={() => setCalendarOpen(false)}
              />
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      {createPortal(
    <div
      className="fed-curve-detail-overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fed-curve-detail-dialog atlas-glass" role="dialog" aria-modal="true" aria-labelledby="fed-curve-detail-title">
        <div className="fed-curve-detail-head">
          <h2 id="fed-curve-detail-title" className="fed-curve-detail-title">
            US Treasuries Yield Curve
          </h2>
          <button type="button" className="fed-curve-detail-close" aria-label="Закрыть" onClick={onClose}>
            <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close" />
          </button>
        </div>

        <div className="fed-curve-detail-toolbar">
          <div className="fed-curve-detail-date-nav">
            <div ref={dateStripRef} className="fed-curve-detail-date-strip">
              <button
                type="button"
                className="fed-curve-detail-nav-btn"
                disabled={!hasPrevDate}
                aria-label="Предыдущая дата"
                onClick={() => {
                  setCalendarOpen(false);
                  stepDate("prev");
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className={`fed-curve-detail-date${calendarOpen ? " is-open" : ""}`}
                aria-label="Выбрать дату"
                aria-expanded={calendarOpen}
                onClick={() => setCalendarOpen((v) => !v)}
              >
                {formatDateDdMmYy(selectedDate)}
              </button>
              <button
                type="button"
                className="fed-curve-detail-nav-btn"
                disabled={!hasNextDate}
                aria-label="Следующая дата"
                onClick={() => {
                  setCalendarOpen(false);
                  stepDate("next");
                }}
              >
                ›
              </button>
            </div>
            <button
              type="button"
              className="fed-curve-detail-pin btn-on-glass"
              aria-label="Закрепить текущую дату на графике"
              disabled={!selectedDate || isSelectedDatePinned}
              onClick={pinSelectedDate}
            >
              <img src="/assets/portfolio-ui/pin.svg" alt="" className="fed-curve-detail-pin-icon" />
            </button>
          </div>

          <div className="fed-curve-detail-tags" aria-label="Линии сравнения">
            {showCompare && compareDateLabel ? (
              <span className="fed-curve-detail-tag">
                <span className="fed-curve-detail-tag-dot fed-curve-detail-tag-dot--compare" aria-hidden />
                <span className="fed-curve-detail-tag-label">{compareDateLabel}</span>
                <button
                  type="button"
                  className="fed-curve-detail-tag-remove"
                  aria-label={`Убрать сравнение ${fedCurveComparePeriodLabel(compareDays)}`}
                  onClick={() => setShowCompare(false)}
                >
                  <svg className="fed-curve-detail-tag-remove-icon" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M21 3L3 21M3 3L21 21"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            ) : null}
            {pinnedCurves.map((pin) => (
              <span key={pin.date} className="fed-curve-detail-tag">
                <span
                  className="fed-curve-detail-tag-dot"
                  style={{ background: pin.color }}
                  aria-hidden
                />
                <span className="fed-curve-detail-tag-label">{formatDateDdMmYy(pin.date)}</span>
                <button
                  type="button"
                  className="fed-curve-detail-tag-remove"
                  aria-label={`Убрать закреплённую дату ${formatDateDdMmYy(pin.date)}`}
                  onClick={() => removePinned(pin.date)}
                >
                  <svg className="fed-curve-detail-tag-remove-icon" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M21 3L3 21M3 3L21 21"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            ))}
            {selectedDate ? (
              <span className="fed-curve-detail-tag">
                <span className="fed-curve-detail-tag-dot fed-curve-detail-tag-dot--current" aria-hidden />
                <span className="fed-curve-detail-tag-label">{formatDateDdMmYy(selectedDate)}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="fed-curve-detail-chart-wrap">
          {datesErr ? <p className="fed-curve-detail-msg fed-curve-detail-msg-error">{datesErr}</p> : null}
          {!datesErr && !hasChartData && chartLoading ? (
            <p className="fed-curve-detail-msg">Загрузка…</p>
          ) : null}
          {!datesErr && !hasChartData && chartErr ? (
            <p className="fed-curve-detail-msg fed-curve-detail-msg-error">{chartErr}</p>
          ) : null}
          {!datesErr && hasChartData ? (
            <div
              ref={chartRef}
              className="fed-curve-detail-chart-interactive"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setTooltipPos(null);
                setTooltipViewportPos(null);
              }}
            >
              {chartErr ? <p className="fed-curve-detail-chart-err">{chartErr}</p> : null}
              <svg className="fed-curve-detail-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" role="img" aria-label="Подробная кривая доходности Treasury">
                {chart.gridYs.map((gy, gi) => (
                  <line
                    key={`h-${gi}`}
                    x1={PAD.l}
                    y1={gy}
                    x2={VIEW_W - PAD.r}
                    y2={gy}
                    className="fed-curve-detail-grid-h"
                  />
                ))}
                {chart.gridXs.map((gx, gi) => (
                  <line
                    key={`v-${gi}`}
                    x1={gx}
                    y1={PAD.t}
                    x2={gx}
                    y2={chart.bottomY}
                    className="fed-curve-detail-grid-v"
                  />
                ))}

                {chart.yLabels.map((label, gi) => {
                  const gy = chart.gridYs[gi];
                  if (gy === undefined) return null;
                  return (
                    <text key={label} x={PAD.l - 8} y={gy + 4} textAnchor="end" className="fed-curve-detail-y-label">
                      {label}
                    </text>
                  );
                })}

                {chart.xLabels.map(({ label, x }) => (
                  <text key={label} x={x} y={VIEW_H - 10} textAnchor="middle" className="fed-curve-detail-x-label">
                    {label}
                  </text>
                ))}

                {hoveredIndex !== null ? (
                  <line
                    x1={chart.xLabels[hoveredIndex]?.x ?? PAD.l}
                    y1={PAD.t}
                    x2={chart.xLabels[hoveredIndex]?.x ?? PAD.l}
                    y2={chart.bottomY}
                    className="fed-curve-detail-hover-line"
                  />
                ) : null}

                {showCompare ? (
                  <FedCurveLineGroup
                    pts={chart.comparePts}
                    pathD={comparePath}
                    maskId={compareMaskId}
                    lineClassName="fed-curve-detail-line fed-curve-detail-line--compare"
                    dotClassName="fed-curve-detail-dot fed-curve-detail-dot--compare"
                    hoveredIndex={hoveredIndex}
                  />
                ) : null}

                {chart.pinnedLayers.map((layer) =>
                  layer.pathD ? (
                    <FedCurveLineGroup
                      key={layer.date}
                      pts={layer.pts}
                      pathD={layer.pathD}
                      maskId={maskIdForDate(pinnedMaskPrefix, layer.date)}
                      lineClassName="fed-curve-detail-line"
                      dotClassName="fed-curve-detail-dot"
                      strokeColor={layer.color}
                      hoveredIndex={hoveredIndex}
                    />
                  ) : null,
                )}

                <FedCurveLineGroup
                  pts={chart.currentPts}
                  pathD={currentPath}
                  maskId={currentMaskId}
                  lineClassName="fed-curve-detail-line fed-curve-detail-line--current"
                  dotClassName="fed-curve-detail-dot fed-curve-detail-dot--current"
                  hoveredIndex={hoveredIndex}
                />
              </svg>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
        document.body,
      )}
      {calendarPopover}
      {tooltipViewportPos &&
      hoveredIndex !== null &&
      hoverAnchor?.tenorLabel &&
      tooltipRows.length > 0
        ? createPortal(
            <div
              className="fed-curve-detail-tip"
              style={{
                left: tooltipViewportPos.left,
                top: tooltipViewportPos.top,
                minHeight: tooltipHeight,
              }}
              role="tooltip"
            >
              <p className="fed-curve-detail-tip__tenor">{hoverAnchor.tenorLabel}</p>
              {tooltipRows.map((row, i) => (
                <p
                  key={`${i}-${row.text}`}
                  className={`fed-curve-detail-tip__row${
                    row.dotVariant === "current"
                      ? " fed-curve-detail-tip__row--current"
                      : row.dotVariant === "compare"
                        ? " fed-curve-detail-tip__row--compare"
                        : ""
                  }`}
                >
                  <span
                    className="fed-curve-detail-tip__dot"
                    style={row.dotColor ? { background: row.dotColor } : undefined}
                    aria-hidden
                  />
                  {row.text}
                </p>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
