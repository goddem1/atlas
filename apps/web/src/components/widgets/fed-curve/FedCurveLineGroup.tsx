import type { ChartPoint } from "./fedCurveChartUtils";

const MASK_STROKE_W = 3;
const MASK_HOLE_R = 5;

type Props = {
  pts: ChartPoint[];
  pathD: string;
  maskId: string;
  lineClassName: string;
  dotClassName: string;
  hoveredIndex: number | null;
  strokeColor?: string;
  dotR?: number;
  dotRHover?: number;
};

/** Линия с «дырками» в узлах + кольца поверх (линия не проходит через центр точек). */
export function FedCurveLineGroup({
  pts,
  pathD,
  maskId,
  lineClassName,
  dotClassName,
  hoveredIndex,
  strokeColor,
  dotR = 3.5,
  dotRHover = 5,
}: Props) {
  if (pts.length < 2) return null;

  const strokeStyle = strokeColor ? { stroke: strokeColor } : undefined;

  return (
    <>
      <defs>
        <mask id={maskId}>
          <path
            d={pathD}
            fill="none"
            stroke="white"
            strokeWidth={MASK_STROKE_W}
            vectorEffect="non-scaling-stroke"
          />
          {pts.map((p) => (
            <circle key={`hole-${p.index}`} cx={p.x} cy={p.y} r={MASK_HOLE_R} fill="black" />
          ))}
        </mask>
      </defs>
      <path d={pathD} mask={`url(#${maskId})`} className={lineClassName} style={strokeStyle} />
      {pts.map((p) => (
        <circle
          key={`dot-${p.index}`}
          cx={p.x}
          cy={p.y}
          r={hoveredIndex === p.index ? dotRHover : dotR}
          className={dotClassName}
          style={strokeStyle}
        />
      ))}
    </>
  );
}
