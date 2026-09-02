import "./fear-greed-gauge.css";

const SEGMENT_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#86efac", "#22c55e"] as const;
const INACTIVE_COLOR = "#ececf1";

const SEGMENT_COUNT = 5;
const SEGMENT_GAP_DEG = 17;

type Props = {
  value: number;
  className?: string;
  displayValue?: string;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function segmentArcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function filledSegmentCount(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped <= 0) return 0;
  return Math.min(SEGMENT_COUNT, Math.ceil(clamped / (100 / SEGMENT_COUNT)));
}

export function FearGreedGauge({ value, className, displayValue }: Props) {
  const cx = 44;
  const cy = 42;
  const r = 39;
  const strokeWidth = 6;
  const segmentDeg = (180 - SEGMENT_GAP_DEG * (SEGMENT_COUNT - 1)) / SEGMENT_COUNT;
  const filledCount = filledSegmentCount(value);
  const label = displayValue ?? String(Math.round(value));

  return (
    <div className={cn("fear-greed-gauge", className)}>
      <svg
        className="fear-greed-gauge__svg"
        viewBox="0 -3 88 47"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
          const start = i * (segmentDeg + SEGMENT_GAP_DEG);
          const end = start + segmentDeg;
          const color = i < filledCount ? SEGMENT_COLORS[i] : INACTIVE_COLOR;
          return (
            <path
              key={i}
              d={segmentArcPath(cx, cy, r, start, end)}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <span className="fear-greed-gauge__value">{label}</span>
    </div>
  );
}
