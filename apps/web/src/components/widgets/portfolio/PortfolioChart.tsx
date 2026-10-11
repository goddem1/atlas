import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioChartPoint, PortfolioTimeframe } from "@atlas-v1/shared";
import { TimeframeSwitcher } from "./TimeframeSwitcher";

type Props = {
  points: PortfolioChartPoint[];
  timeframe: PortfolioTimeframe;
  onTimeframe: (next: PortfolioTimeframe) => void;
};

function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

type TooltipPayloadItem = {
  value?: number | string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
};

function PortfolioChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const raw = Number(payload[0]?.value ?? 0);
  const value = Number.isFinite(raw) ? raw : 0;
  return (
    <div className="portfolio-chart-tooltip">
      <div className="portfolio-chart-tooltip-date">{String(label ?? "")}</div>
      <div className="portfolio-chart-tooltip-value">{formatUsd(value)}</div>
    </div>
  );
}

export function PortfolioChart({ points, timeframe, onTimeframe }: Props) {
  const gradientId = `portfolioGradient-${useId().replace(/:/g, "")}`;
  const data = useMemo(
    () =>
      points.map((p) => ({
        date: p.date,
        value: Number(p.valueUsd),
      })),
    [points],
  );

  const accent = useMemo(() => {
    const first = data.find((p) => Number.isFinite(p.value))?.value;
    const last = [...data].reverse().find((p) => Number.isFinite(p.value))?.value;
    if (first == null || last == null) return "#22c55e";
    return last >= first ? "#22c55e" : "#ef4444";
  }, [data]);

  return (
    <div className="portfolio-chart-block">
      <div className="portfolio-chart-wrap">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide padding={{ left: 0, right: 0 }} />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              content={<PortfolioChartTooltip />}
              cursor={{ stroke: "rgba(23, 23, 23, 0.35)", strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={accent}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: accent, stroke: "#fff", strokeWidth: 1.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <TimeframeSwitcher value={timeframe} onChange={onTimeframe} />
    </div>
  );
}
