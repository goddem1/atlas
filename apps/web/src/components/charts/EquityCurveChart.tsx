import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./equity-curve-chart.css";

export type EquityCurveChartPoint = {
  date: string;
  value: number;
};

type Props = {
  points: EquityCurveChartPoint[];
  variant?: "mini" | "full";
  className?: string;
  /** Горизонтальная линия и метка общего PnL на уровне последней точки (для попапа). */
  showTotalPnlLine?: boolean;
};

type ChartRow = {
  date: string;
  slot: number;
  isTradeDay: boolean;
  value: number;
  valuePos: number;
  valueNeg: number;
  linePos: number | null;
  lineNeg: number | null;
};

const CHART_ZERO_LINE_COLOR = "#c7c7cc";
const CHART_POS_FILL = "rgba(52, 199, 89, 0.32)";
const CHART_NEG_FILL = "rgba(255, 59, 48, 0.26)";
const CHART_POS_LINE = "#34c759";
const CHART_NEG_LINE = "#ff3b30";

function rowFromTradeDay(date: string, value: number, slot: number): ChartRow {
  return {
    date,
    slot,
    isTradeDay: true,
    value,
    valuePos: value >= 0 ? value : 0,
    valueNeg: value < 0 ? value : 0,
    linePos: value >= 0 ? value : null,
    lineNeg: value < 0 ? value : null,
  };
}

function rowFromZeroCrossing(slot: number): ChartRow {
  return {
    date: "",
    slot,
    isTradeDay: false,
    value: 0,
    valuePos: 0,
    valueNeg: 0,
    linePos: 0,
    lineNeg: 0,
  };
}

function tradeDayKey(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function aggregateByTradeDay(points: EquityCurveChartPoint[]): EquityCurveChartPoint[] {
  const byDay = new Map<string, EquityCurveChartPoint>();
  for (const point of points) {
    const key = tradeDayKey(point.date);
    const prev = byDay.get(key);
    if (!prev || new Date(point.date).getTime() >= new Date(prev.date).getTime()) {
      byDay.set(key, point);
    }
  }
  return Array.from(byDay.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function withZeroCrossings(rows: ChartRow[]): ChartRow[] {
  if (rows.length < 2) return rows;
  const out: ChartRow[] = [rows[0]!];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const curr = rows[i]!;
    const prevValue = prev.value;
    const currValue = curr.value;
    const crossesZero =
      (prevValue > 0 && currValue < 0) || (prevValue < 0 && currValue > 0);
    if (crossesZero) {
      const ratio = prevValue / (prevValue - currValue);
      const slot = prev.slot + ratio * (curr.slot - prev.slot);
      out.push(rowFromZeroCrossing(slot));
    }
    out.push(curr);
  }
  return out;
}

function buildChartData(points: EquityCurveChartPoint[]): ChartRow[] {
  const rows = aggregateByTradeDay(points).map((p, index) =>
    rowFromTradeDay(p.date, Number(p.value), index),
  );
  if (rows.length === 0) return rows;
  return withZeroCrossings(rows);
}

function resolveChartHeight(variant: "mini" | "full", measuredHeight: number | null): number {
  if (measuredHeight != null && measuredHeight > 0) return measuredHeight;
  return variant === "mini" ? 100 : 180;
}

function formatUsd(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatTotalPnlLabel(value: number): string {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const sign = value < 0 ? "−" : "";
  return `PnL: ${sign}$${formatted}`;
}

type TooltipPayloadItem = { value?: number | string; payload?: ChartRow };
type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
};

function formatTooltipDate(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(dt);
}

function formatTooltipCloseTime(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  }).format(dt);
}

function EquityCurveTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload.find((item) => item.payload?.isTradeDay)?.payload;
  if (!row) return null;
  return (
    <div className="equity-curve-tooltip">
      <div className="equity-curve-tooltip-date">{formatTooltipDate(row.date)}</div>
      <div className="equity-curve-tooltip-close">Закрытие {formatTooltipCloseTime(row.date)}</div>
      <div className="equity-curve-tooltip-value">{formatUsd(row.value)}</div>
    </div>
  );
}

function EquityCurveActiveDot(props: { cx?: number; cy?: number; payload?: ChartRow }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.isTradeDay) return null;
  const color = payload.value >= 0 ? CHART_POS_LINE : CHART_NEG_LINE;
  return <circle cx={cx} cy={cy} r={4} fill="#ffffff" stroke={color} strokeWidth={1.6} />;
}

export function EquityCurveChart({
  points,
  variant = "full",
  className,
  showTotalPnlLine = false,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const data = useMemo<ChartRow[]>(() => buildChartData(points), [points]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const updateHeight = () => setMeasuredHeight(el.getBoundingClientRect().height);
    updateHeight();
    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartHeight = resolveChartHeight(variant, measuredHeight);

  const lastValue = useMemo(() => {
    const days = aggregateByTradeDay(points);
    if (days.length === 0) return null;
    return Number(days[days.length - 1]!.value);
  }, [points]);
  const yDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    const values = data.map((row) => row.value);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad];
  }, [data]);

  const totalPnlBadgeTop = useMemo(() => {
    if (lastValue == null) return 0;
    const plotTop = 8;
    const plotHeight = chartHeight - plotTop;
    const [min, max] = yDomain;
    const range = max - min || 1;
    const ratio = 1 - (lastValue - min) / range;
    return plotTop + ratio * plotHeight;
  }, [lastValue, chartHeight, yDomain]);

  const totalPnlColor = lastValue != null && lastValue >= 0 ? "#34c759" : "#ff3b30";

  return (
    <div
      ref={chartRef}
      className={`equity-curve-chart equity-curve-chart--${variant}${showTotalPnlLine && lastValue != null ? " equity-curve-chart--with-total-pnl" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="equity-curve-chart-plot">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="slot" type="number" domain={["dataMin", "dataMax"]} hide padding={{ left: 10, right: 10 }} />
          <YAxis hide domain={yDomain} />
          <ReferenceLine y={0} stroke={CHART_ZERO_LINE_COLOR} strokeWidth={1} />
          {showTotalPnlLine && lastValue != null ? (
            <ReferenceLine
              y={lastValue}
              stroke={totalPnlColor}
              strokeWidth={1.2}
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
            />
          ) : null}
          <Tooltip content={<EquityCurveTooltip />} cursor={{ stroke: "#d5d5da", strokeWidth: 1 }} />
          <Area
            type="linear"
            dataKey="valuePos"
            stroke="none"
            fill={CHART_POS_FILL}
            baseLine={0}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="valueNeg"
            stroke="none"
            fill={CHART_NEG_FILL}
            baseLine={0}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="linePos"
            stroke={CHART_POS_LINE}
            strokeWidth={variant === "mini" ? 1.8 : 2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="lineNeg"
            stroke={CHART_NEG_LINE}
            strokeWidth={variant === "mini" ? 1.8 : 2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="transparent"
            strokeWidth={variant === "mini" ? 8 : 10}
            dot={false}
            activeDot={EquityCurveActiveDot}
            isAnimationActive={false}
            legendType="none"
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      {showTotalPnlLine && lastValue != null ? (
        <div className="equity-curve-total-pnl-badge-slot">
          <div className="equity-curve-total-pnl-badge equity-curve-total-pnl-badge--measure" aria-hidden="true">
            {formatTotalPnlLabel(lastValue)}
          </div>
          <div
            className="equity-curve-total-pnl-badge"
            style={{ top: totalPnlBadgeTop, color: totalPnlColor, borderColor: totalPnlColor }}
          >
            {formatTotalPnlLabel(lastValue)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
