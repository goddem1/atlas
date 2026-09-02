import type { PortfolioChartPoint, PortfolioTimeframe } from "@atlas-v1/shared";
import { EquityCurveChart } from "../../charts/EquityCurveChart";
import "../../charts/equity-curve-chart.css";
import { TimeframeSwitcher } from "./TimeframeSwitcher";

type Props = {
  points: PortfolioChartPoint[];
  timeframe: PortfolioTimeframe;
  onTimeframe: (next: PortfolioTimeframe) => void;
};

export function PortfolioChart({ points, timeframe, onTimeframe }: Props) {
  const data = points.map((p) => ({
    date: p.date,
    value: Number(p.valueUsd),
  }));

  return (
    <div className="portfolio-chart-block">
      <div className="portfolio-chart-wrap">
        <EquityCurveChart points={data} variant="full" />
      </div>
      <TimeframeSwitcher value={timeframe} onChange={onTimeframe} />
    </div>
  );
}
