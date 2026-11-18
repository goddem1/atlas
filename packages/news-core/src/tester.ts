export function parseKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    if (![openTime, open, high, low, close].every((value) => Number.isFinite(value))) continue;
    candles.push({ openTime, open, high, low, close });
  }
  return candles;
}

export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type TesterParams = {
  assumptions: string;
  entryDelayMin: number;
  entryValidityHours: { days: number; weeks: number; months: number };
  maxHoldingDays: { days: number; weeks: number; months: number };
  feePctPerSide: number;
  slippagePct: number;
  minMovePct: number;
  minClosedCalls: number;
};

export const DEFAULT_TESTER: TesterParams = {
  assumptions: "начальные, подберите по данным",
  entryDelayMin: 5,
  entryValidityHours: { days: 72, weeks: 240, months: 720 },
  maxHoldingDays: { days: 7, weeks: 30, months: 90 },
  feePctPerSide: 0.1,
  slippagePct: 0.05,
  minMovePct: 0,
  minClosedCalls: 30,
};

export type EvalInput = {
  postedAt: number;
  now: number;
  direction: "long" | "short" | "neutral";
  horizon: "days" | "weeks" | "months" | "unknown";
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  targets: number[];
  entryCandles: Candle[];
  holdCandles: Candle[];
  btcCandles: Candle[];
  params: TesterParams;
};

export type EvalResult = {
  status: "open" | "closed" | "not_triggered" | "untestable";
  untestableReason: string | null;
  entryFilledAt: number | null;
  entryPrice: number | null;
  exitAt: number | null;
  exitPrice: number | null;
  exitReason: "target" | "stop" | "expired" | null;
  returnPct: number | null;
  rMultiple: number | null;
  feesPct: number;
  slippagePct: number;
  btcReturnPct: number | null;
  coinHoldReturnPct: number | null;
  maxAdversePct: number | null;
  maxFavorablePct: number | null;
  checkpoints: Record<string, { returnPct: number; correct: boolean }> | null;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function horizonKey(horizon: EvalInput["horizon"]): "days" | "weeks" | "months" {
  if (horizon === "weeks" || horizon === "months") return horizon;
  return "days";
}

function after(candles: Candle[], time: number): Candle[] {
  return candles.filter((candle) => candle.openTime >= time).sort((a, b) => a.openTime - b.openTime);
}

function slip(price: number, params: TesterParams, worseUp: boolean): number {
  const rate = params.slippagePct / 100;
  return price * (worseUp ? 1 + rate : 1 - rate);
}

function returnPct(direction: "long" | "short", entryExec: number, exitExec: number, params: TesterParams): number {
  const gross = direction === "long" ? (exitExec / entryExec - 1) * 100 : ((entryExec - exitExec) / entryExec) * 100;
  return gross - 2 * params.feePctPerSide;
}

function zoneOf(input: EvalInput): { low: number; high: number } | null {
  if (input.entryLow == null && input.entryHigh == null) return null;
  const low = input.entryLow ?? input.entryHigh ?? 0;
  const high = input.entryHigh ?? input.entryLow ?? low;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function firstTarget(direction: "long" | "short", targets: number[]): number | null {
  const nums = targets.filter((value) => Number.isFinite(value));
  if (nums.length === 0) return null;
  nums.sort((a, b) => a - b);
  return direction === "long" ? nums[0] ?? null : nums[nums.length - 1] ?? null;
}

function hit(direction: "long" | "short", candle: Candle, stop: number | null, target: number | null): "stop" | "target" | null {
  const stopHit = stop != null && (direction === "long" ? candle.low <= stop : candle.high >= stop);
  const targetHit = target != null && (direction === "long" ? candle.high >= target : candle.low <= target);
  if (stopHit) return "stop";
  if (targetHit) return "target";
  return null;
}

function excursion(direction: "long" | "short", entry: number, candles: Candle[]): { adverse: number; favorable: number } {
  let adverse = 0;
  let favorable = 0;
  for (const candle of candles) {
    const worst = direction === "long" ? ((candle.low - entry) / entry) * 100 : ((entry - candle.high) / entry) * 100;
    const best = direction === "long" ? ((candle.high - entry) / entry) * 100 : ((entry - candle.low) / entry) * 100;
    adverse = Math.min(adverse, worst);
    favorable = Math.max(favorable, best);
  }
  return { adverse, favorable };
}

function closeAt(candles: Candle[], time: number): { at: number; price: number } | null {
  const next = after(candles, time)[0];
  if (!next) return null;
  return { at: next.openTime, price: next.close };
}

export function evaluateCall(input: EvalInput): EvalResult {
  const params = input.params;
  const feesPct = 2 * params.feePctPerSide;
  const base = {
    feesPct,
    slippagePct: params.slippagePct,
    checkpoints: null,
    entryFilledAt: null,
    entryPrice: null,
    exitAt: null,
    exitPrice: null,
    exitReason: null,
    returnPct: null,
    rMultiple: null,
    btcReturnPct: null,
    coinHoldReturnPct: null,
    maxAdversePct: null,
    maxFavorablePct: null,
  } satisfies Partial<EvalResult>;
  if (input.direction === "neutral") {
    return { ...base, status: "untestable", untestableReason: "нет направления" };
  }
  const direction = input.direction;
  const key = horizonKey(input.horizon);
  const hasLevels = zoneOf(input) != null || input.stop != null || input.targets.length > 0;
  if (!hasLevels) return evaluateView(input, direction, base);

  const entryCandles = after(input.entryCandles, input.postedAt);
  const zone = zoneOf(input);
  const validityEnd = input.postedAt + params.entryValidityHours[key] * HOUR;
  let fillCandle: Candle | null = null;
  let fillPrice = 0;
  if (zone) {
    for (const candle of entryCandles) {
      if (candle.openTime > validityEnd) break;
      if (candle.low <= zone.high && candle.high >= zone.low) {
        fillCandle = candle;
        fillPrice = Math.min(zone.high, Math.max(zone.low, candle.open));
        break;
      }
    }
    if (!fillCandle) {
      const waiting = input.now < validityEnd;
      return { ...base, status: waiting ? "open" : "not_triggered", untestableReason: null };
    }
  } else {
    const readyAt = input.postedAt + params.entryDelayMin * 60 * 1000;
    fillCandle = after(entryCandles, readyAt)[0] ?? null;
    if (!fillCandle) return { ...base, status: "untestable", untestableReason: "нет цены" };
    fillPrice = fillCandle.open;
  }

  const entryExec = slip(fillPrice, params, direction === "long");
  const target = firstTarget(direction, input.targets);
  const deadline = input.postedAt + params.maxHoldingDays[key] * DAY;
  const path = [
    fillCandle,
    ...after(input.holdCandles, fillCandle.openTime + 1).filter((candle) => candle.openTime <= deadline),
  ];
  let exitReason: "target" | "stop" | "expired" | null = null;
  let exitPrice = 0;
  let exitAt = 0;
  for (const candle of path) {
    const event = hit(direction, candle, input.stop, target);
    if (event) {
      exitReason = event;
      exitPrice = event === "stop" ? (input.stop as number) : (target as number);
      exitAt = candle.openTime;
      break;
    }
  }
  if (!exitReason) {
    if (input.now < deadline) {
      return {
        ...base,
        status: "open",
        untestableReason: null,
        entryFilledAt: fillCandle.openTime,
        entryPrice: fillPrice,
      };
    }
    const last = [...path].reverse().find((candle) => candle.openTime <= deadline);
    if (!last) return { ...base, status: "untestable", untestableReason: "нет цены" };
    exitReason = "expired";
    exitPrice = last.close;
    exitAt = last.openTime;
  }
  const exitWorseUp = direction === "short";
  const exitExec = slip(exitPrice, params, exitWorseUp);
  const result = returnPct(direction, entryExec, exitExec, params);
  const move = excursion(direction, fillPrice, path.filter((candle) => candle.openTime <= exitAt));
  let rMultiple: number | null = null;
  if (input.stop != null) {
    const stopExec = slip(input.stop, params, direction === "short");
    const risk = direction === "long" ? entryExec - stopExec : stopExec - entryExec;
    if (risk > 0) rMultiple = ((direction === "long" ? exitExec - entryExec : entryExec - exitExec) - (2 * params.feePctPerSide / 100) * entryExec) / risk;
  }
  const holdEnd = closeAt(input.holdCandles, exitAt) ?? { at: exitAt, price: exitPrice };
  const btc = closeAt(after(input.btcCandles, input.postedAt), fillCandle.openTime);
  const btcExit = closeAt(after(input.btcCandles, input.postedAt), exitAt);
  const btcReturnPct = btc && btcExit ? ((btcExit.price - btc.price) / btc.price) * 100 : null;
  const coinHoldReturnPct = ((holdEnd.price - fillPrice) / fillPrice) * 100 * (direction === "long" ? 1 : -1);
  return {
    ...base,
    status: "closed",
    untestableReason: null,
    entryFilledAt: fillCandle.openTime,
    entryPrice: fillPrice,
    exitAt,
    exitPrice,
    exitReason,
    returnPct: result,
    rMultiple,
    btcReturnPct,
    coinHoldReturnPct,
    maxAdversePct: move.adverse,
    maxFavorablePct: move.favorable,
  };
}

function evaluateView(
  input: EvalInput,
  direction: "long" | "short",
  base: Omit<EvalResult, "status" | "untestableReason">,
): EvalResult {
  const marks = [
    ["1d", input.postedAt + DAY],
    ["7d", input.postedAt + 7 * DAY],
    ["30d", input.postedAt + 30 * DAY],
  ] as const;
  const checkpoints: Record<string, { returnPct: number; correct: boolean }> = {};
  const future = after(input.holdCandles, input.postedAt);
  for (const [name, time] of marks) {
    if (time > input.now) continue;
    const point = closeAt(future, time);
    if (!point) continue;
    const raw = ((point.price - future[0]!.open) / future[0]!.open) * 100;
    const signed = direction === "long" ? raw : -raw;
    checkpoints[name] = { returnPct: signed, correct: signed > input.params.minMovePct };
  }
  if (Object.keys(checkpoints).length === 0) {
    return { ...base, status: input.now < input.postedAt + DAY ? "open" : "untestable", untestableReason: input.now < input.postedAt + DAY ? null : "нет цены", checkpoints: null };
  }
  const done = input.now >= input.postedAt + 30 * DAY;
  return {
    ...base,
    status: done ? "closed" : "open",
    untestableReason: null,
    checkpoints,
    returnPct: checkpoints["7d"]?.returnPct ?? checkpoints["1d"]?.returnPct ?? null,
  };
}
