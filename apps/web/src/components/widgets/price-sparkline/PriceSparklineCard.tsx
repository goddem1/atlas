import { useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { formatPriceTicker } from "../../../lib/formatChart";

const VIEW_W = 320;
const VIEW_H = 132;
const PAD = { t: 6, r: 4, b: 22, l: 4 };
/** Вертикальные деления и подписи — неделя, 7 дней. */
const WEEK_DIVISIONS = 7;

function cn(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export interface PriceSparklineCardProps {
  /** Тикер для подписи (напр. BTC) */
  symbol: string;
  /** Последняя цена (отформатированная строка) */
  priceDisplay: string;
  /** % изменения последней цены относительно предпоследней */
  changePercent: number;
  /** Значения серии для графика (обычно 7 close) */
  series: number[];
  /** Подписи по оси X — до 7 (день недели и т.д.) */
  xLabels: string[];
  /** Иконка актива; по умолчанию круг с буквой */
  icon?: ReactNode;
  /** Открыть выбор актива (иконка становится кнопкой) */
  onIconClick?: () => void;
  /** Сообщение об ошибке / состоянии под графиком */
  statusText?: string | null;
  onDeleteWidget?: () => void;
  className?: string;
  /** Класс только для зоны перетаскивания (тикер), не вся шапка */
  dragHandleClassName?: string;
}

type ChartPoint = { x: number; y: number; seriesIndex: number };

function buildPoints(values: number[]): ChartPoint[] {
  if (values.length < 2) return [];
  const innerW = VIEW_W - PAD.l - PAD.r;
  const innerH = VIEW_H - PAD.t - PAD.b;
  const finite = values
    .map((v, i) => ({ v, i }))
    .filter((e) => Number.isFinite(e.v));
  if (finite.length < 2) return [];
  const nums = finite.map((e) => e.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Number.isFinite(max - min) && max !== min ? max - min : 1;
  const denom = values.length - 1;
  return finite.map(({ v, i }) => {
    const x = PAD.l + (denom <= 0 ? 0 : (i / denom) * innerW);
    const y = PAD.t + innerH - ((v - min) / span) * innerH;
    const px = Number.isFinite(x) ? x : PAD.l;
    const py = Number.isFinite(y) ? y : PAD.t + innerH;
    return { x: px, y: py, seriesIndex: i };
  });
}

function areaPath(pts: ChartPoint[], bottomY: number) {
  if (pts.length === 0 || !Number.isFinite(bottomY)) return "";
  const line = pts
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  if (!line) return "";
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  if (!Number.isFinite(last.x) || !Number.isFinite(first.x)) return "";
  return `${line} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

function linePath(pts: ChartPoint[]) {
  if (pts.length === 0) return "";
  return pts
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

export function PriceSparklineCard({
  symbol,
  priceDisplay,
  changePercent,
  series,
  xLabels,
  icon,
  onIconClick,
  statusText,
  onDeleteWidget,
  className = "",
  dragHandleClassName,
}: PriceSparklineCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fillGradientId = `spark-fill-${useId().replace(/:/g, "")}`;
  const pts = buildPoints(series);
  const bottomY = VIEW_H - PAD.b;
  const up = changePercent >= 0;
  const accent = up ? "#22c55e" : "#ef4444";
  const innerW = VIEW_W - PAD.l - PAD.r;
  const gridXs = Array.from({ length: WEEK_DIVISIONS }, (_, i) => PAD.l + (i / (WEEK_DIVISIONS - 1)) * innerW);
  const axisLabels = Array.from({ length: WEEK_DIVISIONS }, (_, i) => xLabels[i] ?? "");

  const defaultIcon = <div className="price-widget-default-icon">{symbol.slice(0, 1)}</div>;

  const iconBody = icon ?? defaultIcon;
  const iconEl = onIconClick ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onIconClick();
      }}
      className="price-widget-icon-button"
      aria-label="Выбрать актив"
    >
      {iconBody}
    </button>
  ) : (
    iconBody
  );

  const dragCn = cn("price-widget-drag-handle", dragHandleClassName);
  const canHover = pts.length > 1;
  const fallbackPtsIndex = pts.length > 0 ? pts.length - 1 : 0;
  const activePtsIndex =
    hoveredIndex !== null && hoveredIndex !== undefined && pts[hoveredIndex]
      ? hoveredIndex
      : fallbackPtsIndex;
  const activePoint = pts[activePtsIndex] ?? null;
  const activeSeriesIndex = activePoint?.seriesIndex ?? Math.max(0, series.length - 1);
  const gridActiveIndex = Math.min(Math.max(0, activeSeriesIndex), WEEK_DIVISIONS - 1);

  const displayPrice = useMemo(() => {
    const value = series[activeSeriesIndex];
    if (value !== undefined && Number.isFinite(value)) return formatPriceTicker(value);
    return priceDisplay;
  }, [activeSeriesIndex, priceDisplay, series]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!canHover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const svgX = (relativeX / rect.width) * VIEW_W;
    let nearest = 0;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pts.length; i += 1) {
      const delta = Math.abs(pts[i]!.x - svgX);
      if (delta < nearestDelta) {
        nearest = i;
        nearestDelta = delta;
      }
    }
    setHoveredIndex((prev) => (prev === nearest ? prev : nearest));
  };

  return (
    <div className={cn("price-widget-card", className)}>
      <div
        className={`portfolio-menu-wrap${menuOpen ? " is-open" : ""}`}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          <button
            type="button"
            className="portfolio-menu-circle-btn"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close" />
          </button>
        </div>
      </div>
      <div className={cn("price-widget-header", dragCn)}>
        <div className="price-widget-asset-head">
          {iconEl}
          <p className="price-widget-symbol">{symbol}</p>
        </div>
        <div className="price-widget-price-group">
          <span className="price-widget-price">{displayPrice}</span>
        </div>
        <div
          className="price-widget-change-badge"
          style={{
            borderColor: accent,
            color: accent,
          }}
        >
          <span aria-hidden>{up ? "↑" : "↓"}</span>
          {up ? "" : "−"}
          {Math.abs(changePercent).toFixed(2)}%
        </div>
      </div>

      <div
        className="price-widget-chart-wrap"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg
          className="price-widget-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`График ${symbol}`}
        >
          <defs>
            <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridXs.map((gx, gi) => (
            <line
              key={gi}
              x1={gx}
              y1={PAD.t}
              x2={gx}
              y2={bottomY}
              stroke={gi === gridActiveIndex ? accent : "#e5e5e5"}
              strokeOpacity={gi === gridActiveIndex ? 0.35 : 1}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {pts.length > 1 && (
            <>
              <path d={areaPath(pts, bottomY)} fill={`url(#${fillGradientId})`} />
              <path
                d={linePath(pts)}
                fill="none"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {hoveredIndex !== null && activePoint && Number.isFinite(activePoint.x) ? (
                <line
                  x1={activePoint.x}
                  y1={PAD.t}
                  x2={activePoint.x}
                  y2={bottomY}
                  className="price-widget-hover-line"
                />
              ) : null}
              {activePoint && Number.isFinite(activePoint.x) && Number.isFinite(activePoint.y) ? (
                <circle cx={activePoint.x} cy={activePoint.y} r="4" fill={accent} />
              ) : null}
            </>
          )}
        </svg>

        <svg className="price-widget-axis-svg" viewBox={`0 0 ${VIEW_W} 18`} preserveAspectRatio="none" aria-hidden>
          {axisLabels.map((label, i) => (
            <text
              key={i}
              x={gridXs[i]}
              y={12}
              textAnchor="middle"
              className={cn(
                "price-widget-axis-text",
                i === gridActiveIndex ? "price-widget-axis-text-active" : undefined,
              )}
            >
              {label}
            </text>
          ))}
        </svg>

        {statusText ? (
          <p className="price-widget-status">{statusText}</p>
        ) : null}
      </div>
    </div>
  );
}
