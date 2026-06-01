export type ChartPoint = { x: number; y: number; index: number };

export type ChartPad = { t: number; r: number; b: number; l: number };

export function smoothLinePath(pts: ChartPoint[]): string {
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

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ceilToTenth(v: number): number {
  return Math.ceil(v * 10) / 10;
}

function valueAtTenor(
  tenors: string[],
  values: Array<number | null>,
  symbol: string,
): number | null {
  const i = tenors.indexOf(symbol);
  if (i < 0) return null;
  const v = values[i] ?? null;
  return v !== null && Number.isFinite(v) ? v : null;
}

export function computeYScale(
  tenors: string[],
  series: Array<Array<number | null>>,
  yTickCount = 5,
): { min: number; max: number; ticks: number[] } | null {
  const all = series
    .flat()
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (all.length === 0) return null;

  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);

  const v1MValues = series
    .map((s) => valueAtTenor(tenors, s, "1M"))
    .filter((v): v is number => v !== null);
  const v30YValues = series
    .map((s) => valueAtTenor(tenors, s, "30Y"))
    .filter((v): v is number => v !== null);

  let min: number;
  let max: number;

  if (v1MValues.length > 0 && v30YValues.length > 0) {
    const anchorMin = round1(Math.min(...v1MValues) - 0.1);
    const anchorMax = round1(ceilToTenth(Math.max(...v30YValues)) + 0.1);
    min = round1(Math.min(anchorMin, dataMin - 0.1));
    max = round1(Math.max(anchorMax, ceilToTenth(dataMax) + 0.1));
  } else {
    min = round1(dataMin - 0.1);
    max = round1(ceilToTenth(dataMax) + 0.1);
  }

  if (max <= min) return null;
  const step = (max - min) / (yTickCount - 1);
  const ticks = Array.from({ length: yTickCount }, (_, i) => round1(min + step * i));
  ticks[0] = min;
  ticks[yTickCount - 1] = max;
  return { min, max, ticks };
}

export function formatDateDdMmYy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  return `${dd}.${mm}.${yy}`;
}

export function valuesByTenors(
  tenors: string[],
  rows: Array<{ symbol: string; close: string | null }>,
): Array<number | null> {
  const map = new Map(rows.map((r) => [r.symbol, r.close]));
  return tenors.map((t) => {
    const raw = map.get(t);
    if (raw == null) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  });
}

export function buildCurvePoints(
  tenors: string[],
  values: Array<number | null>,
  min: number,
  max: number,
  viewW: number,
  viewH: number,
  pad: ChartPad,
): ChartPoint[] {
  const count = tenors.length;
  const innerH = viewH - pad.t - pad.b;
  const span = max - min || 1;
  const innerW = viewW - pad.l - pad.r;
  const denom = count - 1;
  const pts: ChartPoint[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const x = pad.l + (denom <= 0 ? 0 : (i / denom) * innerW);
    const y = pad.t + innerH - ((v - min) / span) * innerH;
    pts.push({ x, y, index: i });
  });
  return pts;
}
