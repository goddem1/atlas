import { Prisma } from "@prisma/client";
import WS from "ws";

/** Node 20 в Docker не имеет global WebSocket (появился в Node 21+). */
const BinanceWebSocket: typeof WebSocket =
  typeof globalThis.WebSocket !== "undefined"
    ? globalThis.WebSocket
    : (WS as unknown as typeof WebSocket);

const BINANCE_REST_KLINES_URL = "https://data-api.binance.vision/api/v3/klines";
const BINANCE_WS_ORIGIN = "wss://stream.binance.com:9443";
const DAY_MS = 24 * 60 * 60 * 1000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const REST_TIMEOUT_MS = 10_000;
const MAX_STREAMS_PER_SOCKET = 1024;

type KlineTuple = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  ...unknown[],
];

type WsEnvelope = {
  stream?: string;
  data?: {
    e?: string;
    E?: number;
    k?: {
      t?: number;
      T?: number;
      s?: string;
      i?: string;
      o?: string;
      c?: string;
      h?: string;
      l?: string;
      v?: string;
      x?: boolean;
    };
  };
};

type StreamLog = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

type LiveCandleState = {
  symbol: string;
  openTimeMs: number;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volumeBeforeTrackedMinute: Prisma.Decimal;
  trackedMinuteOpenTimeMs: number | null;
  trackedMinuteVolume: Prisma.Decimal;
  isClosed: boolean;
  isPrimed: boolean;
};

export type LiveCandle = {
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  openTimeMs: number;
  isClosed: boolean;
};

const defaultLog: StreamLog = {
  info: (obj, msg) => {
    console.info(msg ?? "[binance-ws]", obj);
  },
  warn: (obj, msg) => {
    console.warn(msg ?? "[binance-ws]", obj);
  },
  error: (obj, msg) => {
    console.error(msg ?? "[binance-ws]", obj);
  },
};

const liveCandles = new Map<string, LiveCandleState>();
const primePromises = new Map<string, Promise<void>>();

let streamLog: StreamLog = defaultLog;
let socket: InstanceType<typeof BinanceWebSocket> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let subscribedSymbols: string[] = [];
let reconnectAttempt = 0;
let stopRequested = false;
let connectedAtMs = 0;

function decimalMax(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.greaterThan(right) ? left : right;
}

function decimalMin(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.lessThan(right) ? left : right;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function liveKey(symbol: string, openTimeMs: number): string {
  return `${symbol}:${openTimeMs}`;
}

export function toMskDayStartMs(input: number | Date): number {
  const ms = typeof input === "number" ? input : input.getTime();
  return Math.floor((ms + MSK_OFFSET_MS) / DAY_MS) * DAY_MS - MSK_OFFSET_MS;
}

export function toMskDayStartDate(input: number | Date): Date {
  return new Date(toMskDayStartMs(input));
}

function currentTrackedVolume(state: LiveCandleState): Prisma.Decimal {
  return state.trackedMinuteOpenTimeMs == null ? new Prisma.Decimal(0) : state.trackedMinuteVolume;
}

function totalVolume(state: LiveCandleState): Prisma.Decimal {
  return state.volumeBeforeTrackedMinute.add(currentTrackedVolume(state));
}

function toPublicCandle(state: LiveCandleState): LiveCandle {
  return {
    symbol: state.symbol,
    open: state.open.toString(),
    high: state.high.toString(),
    low: state.low.toString(),
    close: state.close.toString(),
    volume: totalVolume(state).toString(),
    openTimeMs: state.openTimeMs,
    isClosed: state.isClosed,
  };
}

function buildCombinedStreamUrl(symbols: string[]): string {
  const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@kline_1m`).join("/");
  return `${BINANCE_WS_ORIGIN}/stream?streams=${streams}`;
}

function ensureSocketReconnect(): void {
  if (stopRequested || reconnectTimer != null || subscribedSymbols.length === 0) {
    return;
  }

  const delayMs = Math.min(60_000, 5_000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, delayMs);

  streamLog.warn(
    {
      service: "binanceCandleStream",
      delayMs,
      attempt: reconnectAttempt,
    },
    "binance_candle_stream_reconnect_scheduled",
  );
}

function maybeResetReconnectAttempt(): void {
  if (connectedAtMs > 0 && Date.now() - connectedAtMs >= 30_000) {
    reconnectAttempt = 0;
  }
}

function createStateFromMinute(symbol: string, dayStartMs: number, minute: {
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  minuteOpenTimeMs: number;
}): LiveCandleState {
  return {
    symbol,
    openTimeMs: dayStartMs,
    open: minute.open,
    high: minute.high,
    low: minute.low,
    close: minute.close,
    volumeBeforeTrackedMinute: new Prisma.Decimal(0),
    trackedMinuteOpenTimeMs: minute.minuteOpenTimeMs,
    trackedMinuteVolume: minute.volume,
    isClosed: false,
    isPrimed: false,
  };
}

function mergeRestSnapshotIntoState(symbol: string, snapshot: LiveCandle): void {
  const existing = liveCandles.get(symbol);
  if (!existing || existing.openTimeMs !== snapshot.openTimeMs) {
    return;
  }

  const snapshotOpen = new Prisma.Decimal(snapshot.open);
  const snapshotHigh = new Prisma.Decimal(snapshot.high);
  const snapshotLow = new Prisma.Decimal(snapshot.low);
  const snapshotClose = new Prisma.Decimal(snapshot.close);
  const snapshotVolume = new Prisma.Decimal(snapshot.volume);
  const trackedMinuteVolume = currentTrackedVolume(existing);
  let volumeBeforeTrackedMinute = snapshotVolume.sub(trackedMinuteVolume);
  if (volumeBeforeTrackedMinute.lessThan(0)) {
    volumeBeforeTrackedMinute = new Prisma.Decimal(0);
  }

  liveCandles.set(symbol, {
    ...existing,
    open: snapshotOpen,
    high: decimalMax(existing.high, snapshotHigh),
    low: decimalMin(existing.low, snapshotLow),
    close: existing.close,
    volumeBeforeTrackedMinute,
    isClosed: snapshot.isClosed,
    isPrimed: true,
  });
}

function schedulePrimeFromRest(symbol: string, openTimeMs: number): void {
  const key = liveKey(symbol, openTimeMs);
  if (primePromises.has(key)) {
    return;
  }

  const primePromise = (async () => {
    try {
      const snapshot = await fetchRestMskDailyCandle(symbol, openTimeMs);
      if (snapshot) {
        mergeRestSnapshotIntoState(symbol, snapshot);
      }
    } catch (error) {
      streamLog.warn(
        {
          service: "binanceCandleStream",
          symbol,
          openTimeMs,
          err: error instanceof Error ? error.message : String(error),
        },
        "binance_candle_stream_prime_failed",
      );
    } finally {
      primePromises.delete(key);
    }
  })();

  primePromises.set(key, primePromise);
}

function applyMinuteKline(payload: NonNullable<WsEnvelope["data"]>): void {
  const kline = payload.k;
  if (
    payload.e !== "kline" ||
    !kline ||
    kline.i !== "1m" ||
    typeof kline.s !== "string" ||
    typeof kline.t !== "number" ||
    typeof kline.o !== "string" ||
    typeof kline.h !== "string" ||
    typeof kline.l !== "string" ||
    typeof kline.c !== "string" ||
    typeof kline.v !== "string"
  ) {
    return;
  }

  const symbol = normalizeSymbol(kline.s);
  const minuteOpenTimeMs = kline.t;
  const dayStartMs = toMskDayStartMs(minuteOpenTimeMs);
  const minuteOpen = new Prisma.Decimal(kline.o);
  const minuteHigh = new Prisma.Decimal(kline.h);
  const minuteLow = new Prisma.Decimal(kline.l);
  const minuteClose = new Prisma.Decimal(kline.c);
  const minuteVolume = new Prisma.Decimal(kline.v);

  const existing = liveCandles.get(symbol);
  if (!existing || existing.openTimeMs !== dayStartMs) {
    liveCandles.set(
      symbol,
      createStateFromMinute(symbol, dayStartMs, {
        open: minuteOpen,
        high: minuteHigh,
        low: minuteLow,
        close: minuteClose,
        volume: minuteVolume,
        minuteOpenTimeMs,
      }),
    );
    schedulePrimeFromRest(symbol, dayStartMs);
    return;
  }

  let volumeBeforeTrackedMinute = existing.volumeBeforeTrackedMinute;
  let trackedMinuteOpenTimeMs = existing.trackedMinuteOpenTimeMs;
  let trackedMinuteVolume = existing.trackedMinuteVolume;

  if (trackedMinuteOpenTimeMs == null) {
    trackedMinuteOpenTimeMs = minuteOpenTimeMs;
    trackedMinuteVolume = minuteVolume;
  } else if (minuteOpenTimeMs > trackedMinuteOpenTimeMs) {
    volumeBeforeTrackedMinute = volumeBeforeTrackedMinute.add(trackedMinuteVolume);
    trackedMinuteOpenTimeMs = minuteOpenTimeMs;
    trackedMinuteVolume = minuteVolume;
  } else if (minuteOpenTimeMs === trackedMinuteOpenTimeMs) {
    trackedMinuteVolume = minuteVolume;
  } else {
    return;
  }

  liveCandles.set(symbol, {
    ...existing,
    high: decimalMax(existing.high, minuteHigh),
    low: decimalMin(existing.low, minuteLow),
    close: minuteClose,
    volumeBeforeTrackedMinute,
    trackedMinuteOpenTimeMs,
    trackedMinuteVolume,
    isClosed: false,
  });

  if (!existing.isPrimed) {
    schedulePrimeFromRest(symbol, dayStartMs);
  }
}

function handleSocketMessage(event: MessageEvent<string>): void {
  try {
    const raw = JSON.parse(event.data) as WsEnvelope;
    if (raw.data) {
      applyMinuteKline(raw.data);
    }
  } catch (error) {
    streamLog.warn(
      {
        service: "binanceCandleStream",
        err: error instanceof Error ? error.message : String(error),
      },
      "binance_candle_stream_message_parse_failed",
    );
  }
}

function connectSocket(): void {
  if (stopRequested || subscribedSymbols.length === 0) {
    return;
  }

  if (subscribedSymbols.length > MAX_STREAMS_PER_SOCKET) {
    streamLog.error(
      {
        service: "binanceCandleStream",
        count: subscribedSymbols.length,
        limit: MAX_STREAMS_PER_SOCKET,
      },
      "binance_candle_stream_too_many_symbols",
    );
    return;
  }

  const url = buildCombinedStreamUrl(subscribedSymbols);
  const ws = new BinanceWebSocket(url);
  socket = ws;

  ws.addEventListener("open", () => {
    connectedAtMs = Date.now();
    streamLog.info(
      {
        service: "binanceCandleStream",
        count: subscribedSymbols.length,
      },
      "binance_candle_stream_connected",
    );
  });

  ws.addEventListener("message", (event) => {
    if (socket !== ws) {
      return;
    }
    handleSocketMessage(event);
  });

  ws.addEventListener("error", (event) => {
    if (socket !== ws) {
      return;
    }
    streamLog.warn(
      {
        service: "binanceCandleStream",
        error: event.type,
      },
      "binance_candle_stream_error",
    );
  });

  ws.addEventListener("close", (event) => {
    if (socket !== ws) {
      return;
    }
    maybeResetReconnectAttempt();
    socket = null;
    connectedAtMs = 0;
    streamLog.warn(
      {
        service: "binanceCandleStream",
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      },
      "binance_candle_stream_closed",
    );
    ensureSocketReconnect();
  });
}

export async function fetchRestMskDailyCandle(symbolRaw: string, openTimeMs: number): Promise<LiveCandle | null> {
  const symbol = normalizeSymbol(symbolRaw);
  const params = new URLSearchParams({
    symbol,
    interval: "1d",
    limit: "1",
    startTime: String(openTimeMs),
    endTime: String(openTimeMs + DAY_MS - 1),
    timeZone: "3",
  });

  const response = await fetch(`${BINANCE_REST_KLINES_URL}?${params}`, {
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${symbol}: HTTP ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as KlineTuple[];
  const row = rows[0];
  if (!row) {
    return null;
  }

  const rowOpenTimeMs = row[0];
  if (!Number.isFinite(rowOpenTimeMs) || toMskDayStartMs(rowOpenTimeMs) !== openTimeMs) {
    return null;
  }

  return {
    symbol,
    openTimeMs,
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    isClosed: openTimeMs < toMskDayStartMs(Date.now()),
  };
}

export function startBinanceCandleStream(
  symbols: string[],
  options?: {
    log?: StreamLog;
  },
): void {
  stopBinanceCandleStream();
  liveCandles.clear();

  streamLog = options?.log ?? defaultLog;
  if (process.env.BINANCE_WS_DISABLED === "true") {
    streamLog.info({ service: "binanceCandleStream" }, "binance_candle_stream_disabled");
    return;
  }

  subscribedSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
  stopRequested = false;
  reconnectAttempt = 0;

  if (subscribedSymbols.length === 0) {
    streamLog.warn({ service: "binanceCandleStream" }, "binance_candle_stream_no_symbols");
    return;
  }

  connectSocket();
}

export function getLiveCandle(pairRaw: string): LiveCandle | null {
  const state = liveCandles.get(normalizeSymbol(pairRaw));
  return state ? toPublicCandle(state) : null;
}

export function clearLiveCandle(pairRaw: string, openTimeMs?: number): boolean {
  const symbol = normalizeSymbol(pairRaw);
  const state = liveCandles.get(symbol);
  if (!state) {
    return false;
  }
  if (openTimeMs != null && state.openTimeMs !== openTimeMs) {
    return false;
  }
  return liveCandles.delete(symbol);
}

export function stopBinanceCandleStream(): void {
  stopRequested = true;
  connectedAtMs = 0;

  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    const activeSocket = socket;
    socket = null;
    try {
      activeSocket.close(1000, "shutdown");
    } catch {
      // ignore socket close race during shutdown
    }
  }

  subscribedSymbols = [];
  reconnectAttempt = 0;
  primePromises.clear();
}

export async function waitForPendingPrimeTasks(): Promise<void> {
  if (primePromises.size === 0) {
    return;
  }
  await Promise.allSettled([...primePromises.values()]);
}

export { DAY_MS as MSK_DAY_MS };
