import type {
  BondsYieldCurveResponse,
  CandleApiRow,
  CryptocurrencyListItem,
  KlineDrawingPinsResponse,
  KlineDrawingToolPin,
  KlineIndicatorsResponse,
  KlineOverlaysResponse,
  KlineStoredIndicators,
  KlineStoredOverlay,
  MacroEventsResponse,
  MacroSeriesResponse,
  PortfolioAssetDetailResponse,
  PortfolioChartResponse,
  PortfolioSummaryResponse,
  PortfolioTimeframe,
  PortfolioTransactionUpsertInput,
  TelegramNewsChannel,
  TelegramNewsMessage,
  TelegramNewsWidgetResponse,
  TelegramNewsDailyIndexResponse,
  UserDashboardState,
  CmcDailySnapshotHistoryField,
  CmcDailySnapshotHistoryPoint,
  CmcDailySnapshotLatestResponse,
  MarketIndexDailyBarsResponse,
  FearGreedDailyBarsResponse,
} from "@atlas-v1/shared";

import { normalizeKlinePairSymbol } from "@atlas-v1/shared";

function apiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
  const normalized = raw.replace(/\/$/, "");
  if (normalized) return normalized;
  // Dev: см. vite.config proxy /api → 127.0.0.1:3001 (иначе cross-origin часто даёт «Failed to fetch»).
  if (import.meta.env.DEV) return "/api";
  return "";
}

const authFetchInit: RequestInit = { credentials: "include" };

function portfolioFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...authFetchInit, ...init, credentials: "include" });
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text();
    let parsedError: string | null = null;
    try {
      const parsed = JSON.parse(t) as { error?: string };
      parsedError = typeof parsed?.error === "string" ? parsed.error : null;
    } catch {
      // ignore JSON parse error and fallback to raw text
    }
    throw new Error(parsedError || t || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCryptocurrencies(): Promise<CryptocurrencyListItem[]> {
  const res = await fetch(`${apiBase()}/cryptocurrencies`, { cache: "no-store" });
  return parseJson<CryptocurrencyListItem[]>(res);
}

export async function fetchCandles(pair: string, days = 7): Promise<CandleApiRow[]> {
  const q = new URLSearchParams({ pair, days: String(days) });
  const res = await fetch(`${apiBase()}/widgets/candles?${q}`, { cache: "no-store" });
  return parseJson<CandleApiRow[]>(res);
}

export async function fetchBondsYieldCurve(
  compareDays: number,
  asOfDate?: string | null,
): Promise<BondsYieldCurveResponse> {
  const q = new URLSearchParams({ compareDays: String(compareDays) });
  if (asOfDate) q.set("asOfDate", asOfDate);
  const res = await fetch(`${apiBase()}/widgets/bonds-yield-curve?${q}`, { cache: "no-store" });
  return parseJson<BondsYieldCurveResponse>(res);
}

export type BondsYieldDateBounds = { min: string | null; max: string | null };

export async function fetchBondsYieldCurveDateBounds(): Promise<BondsYieldDateBounds> {
  const res = await fetch(`${apiBase()}/widgets/bonds-yield-curve/dates/bounds`, { cache: "no-store" });
  return parseJson<BondsYieldDateBounds>(res);
}

/** month: 1–12 */
export async function fetchBondsYieldCurveDatesForMonth(year: number, month: number): Promise<string[]> {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${apiBase()}/widgets/bonds-yield-curve/dates/month?${q}`, { cache: "no-store" });
  const body = await parseJson<{ dates: string[] }>(res);
  return body.dates ?? [];
}

export async function fetchBondsYieldCurveNeighborDate(
  date: string,
  direction: "prev" | "next",
): Promise<string | null> {
  const q = new URLSearchParams({ date, direction });
  const res = await fetch(`${apiBase()}/widgets/bonds-yield-curve/dates/neighbor?${q}`, { cache: "no-store" });
  const body = await parseJson<{ date: string | null }>(res);
  return body.date ?? null;
}

export async function fetchMacroEvents(params?: {
  from?: Date;
  to?: Date;
  locale?: string;
}): Promise<MacroEventsResponse> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from.toISOString());
  if (params?.to) q.set("to", params.to.toISOString());
  if (params?.locale) q.set("locale", params.locale);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/events${suffix}`, { cache: "no-store" });
  return parseJson<MacroEventsResponse>(res);
}

export interface MacroReleaseStatusResponse {
  inProgressEventIds: string[];
  serverNowIso: string;
}

export async function fetchMacroReleaseStatus(): Promise<MacroReleaseStatusResponse> {
  const res = await fetch(`${apiBase()}/macro/release-status`, { cache: "no-store" });
  return parseJson<MacroReleaseStatusResponse>(res);
}

export async function fetchMacroSeries(params: {
  indicatorId?: string;
  indicatorName?: string;
  locale?: string;
  compact?: boolean;
}): Promise<MacroSeriesResponse> {
  const q = new URLSearchParams();
  if (params.indicatorId) q.set("indicatorId", params.indicatorId);
  if (params.indicatorName) q.set("indicatorName", params.indicatorName);
  if (params.locale) q.set("locale", params.locale);
  if (params.compact) q.set("compact", "1");
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/series${suffix}`, { cache: "no-store" });
  return parseJson<MacroSeriesResponse>(res);
}

export interface MacroSlotsResponse {
  slots: Record<
    string,
    {
      unit: string;
      tiny: Array<{ label: string; value: number }>;
      year: Array<{ label: string; value: number }>;
    }
  >;
}

export async function fetchMacroSlots(params: {
  indicatorIds: string[];
  locale?: string;
}): Promise<MacroSlotsResponse> {
  const q = new URLSearchParams();
  q.set("indicatorIds", params.indicatorIds.join(","));
  if (params.locale) q.set("locale", params.locale);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/macro/slots${suffix}`, { cache: "no-store" });
  return parseJson<MacroSlotsResponse>(res);
}

export function buildMacroSlotImageUrl(params: {
  indicatorId?: string;
  indicatorName?: string;
  mode?: "tiny" | "preview";
  width?: number;
  height?: number;
}): string {
  const q = new URLSearchParams();
  if (params.indicatorId) q.set("indicatorId", params.indicatorId);
  if (params.indicatorName) q.set("indicatorName", params.indicatorName);
  if (params.mode) q.set("mode", params.mode);
  if (params.width) q.set("width", String(params.width));
  if (params.height) q.set("height", String(params.height));
  const suffix = q.toString() ? `?${q}` : "";
  return `${apiBase()}/macro/slot-image${suffix}`;
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummaryResponse> {
  const res = await portfolioFetch(`${apiBase()}/portfolio`, { cache: "no-store" });
  return parseJson<PortfolioSummaryResponse>(res);
}

export async function fetchPortfolioChart(timeframe: PortfolioTimeframe): Promise<PortfolioChartResponse> {
  const q = new URLSearchParams({ timeframe });
  const res = await portfolioFetch(`${apiBase()}/portfolio/chart?${q}`, { cache: "no-store" });
  return parseJson<PortfolioChartResponse>(res);
}

export async function createPortfolioTransaction(
  payload: PortfolioTransactionUpsertInput,
): Promise<{ id: string }> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string }>(res);
}

export async function fetchPortfolioAssetDetail(symbol: string): Promise<PortfolioAssetDetailResponse> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/${encodeURIComponent(symbol)}`, {
    cache: "no-store",
  });
  return parseJson<PortfolioAssetDetailResponse>(res);
}

export async function updatePortfolioTransaction(
  id: string,
  payload: Omit<PortfolioTransactionUpsertInput, "symbol">,
): Promise<void> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/transaction/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function deletePortfolioTransaction(id: string): Promise<void> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/transaction/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function createPortfolioGoal(
  symbol: string,
  targetPriceUsd: string,
): Promise<{ id: string }> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, targetPriceUsd }),
  });
  return parseJson<{ id: string }>(res);
}

export async function deletePortfolioGoal(id: string): Promise<void> {
  const res = await portfolioFetch(`${apiBase()}/portfolio/goal/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function fetchUserDashboardState(): Promise<UserDashboardState> {
  const res = await portfolioFetch(`${apiBase()}/dashboard/state`, { cache: "no-store" });
  return parseJson<UserDashboardState>(res);
}

export async function saveUserDashboardState(state: UserDashboardState): Promise<UserDashboardState> {
  const res = await portfolioFetch(`${apiBase()}/dashboard/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  return parseJson<UserDashboardState>(res);
}

export type ProfileUserResponse = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  updatedAt: string;
};

export function resolveApiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  const base = apiBase();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function profileAvatarUrl(
  image: string | null | undefined,
  updatedAt?: string | null,
): string | null {
  const url = resolveApiAssetUrl(image);
  if (!url) return null;
  if (!updatedAt) return url;
  return `${url}?v=${encodeURIComponent(updatedAt)}`;
}

export async function fetchProfile(): Promise<ProfileUserResponse> {
  const res = await portfolioFetch(`${apiBase()}/profile`, { cache: "no-store" });
  return parseJson<ProfileUserResponse>(res);
}

export async function updateProfileName(name: string): Promise<ProfileUserResponse> {
  const res = await portfolioFetch(`${apiBase()}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseJson<ProfileUserResponse>(res);
}

export async function uploadProfileAvatar(dataUrl: string): Promise<ProfileUserResponse> {
  const res = await portfolioFetch(`${apiBase()}/profile/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  return parseJson<ProfileUserResponse>(res);
}

export async function fetchKlineDrawingPins(): Promise<KlineDrawingToolPin[]> {
  const res = await portfolioFetch(`${apiBase()}/kline-chart/drawing-pins`, { cache: "no-store" });
  const body = await parseJson<KlineDrawingPinsResponse>(res);
  return body.pins ?? [];
}

export async function saveKlineDrawingPins(pins: KlineDrawingToolPin[]): Promise<KlineDrawingToolPin[]> {
  const res = await portfolioFetch(`${apiBase()}/kline-chart/drawing-pins`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pins }),
  });
  const body = await parseJson<KlineDrawingPinsResponse>(res);
  return body.pins ?? [];
}

export async function fetchKlineOverlays(pair: string): Promise<KlineStoredOverlay[]> {
  const normalizedPair = encodeURIComponent(normalizeKlinePairSymbol(pair));
  const res = await portfolioFetch(`${apiBase()}/kline-chart/overlays/${normalizedPair}`, {
    cache: "no-store",
  });
  const body = await parseJson<KlineOverlaysResponse>(res);
  return body.overlays ?? [];
}

export async function saveKlineOverlays(
  pair: string,
  overlays: KlineStoredOverlay[],
): Promise<KlineStoredOverlay[]> {
  const normalizedPair = encodeURIComponent(normalizeKlinePairSymbol(pair));
  const res = await portfolioFetch(`${apiBase()}/kline-chart/overlays/${normalizedPair}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overlays }),
  });
  const body = await parseJson<KlineOverlaysResponse>(res);
  return body.overlays ?? [];
}

export async function fetchKlineIndicators(pair: string): Promise<KlineStoredIndicators | null> {
  const normalizedPair = encodeURIComponent(normalizeKlinePairSymbol(pair));
  const res = await portfolioFetch(`${apiBase()}/kline-chart/indicators/${normalizedPair}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ indicators: KlineStoredIndicators | null }>(res);
  return body.indicators ?? null;
}

export async function saveKlineIndicators(
  pair: string,
  indicators: KlineStoredIndicators,
): Promise<KlineStoredIndicators> {
  const normalizedPair = encodeURIComponent(normalizeKlinePairSymbol(pair));
  const res = await portfolioFetch(`${apiBase()}/kline-chart/indicators/${normalizedPair}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ indicators }),
  });
  const body = await parseJson<KlineIndicatorsResponse>(res);
  return body.indicators ?? { main: [], sub: [] };
}

export async function fetchTelegramNewsChannels(
  usernames?: string[],
): Promise<TelegramNewsChannel[]> {
  const q = new URLSearchParams();
  if (usernames !== undefined) q.set("usernames", usernames.join(","));
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/telegram/channels${suffix}`, { cache: "no-store" });
  const body = await parseJson<{ channels: TelegramNewsChannel[] }>(res);
  return body.channels ?? [];
}

export async function fetchTelegramNewsMessages(
  username: string,
  options?: { limit?: number; offsetId?: number; refresh?: boolean },
): Promise<TelegramNewsMessage[]> {
  const q = new URLSearchParams();
  if (options?.limit != null) q.set("limit", String(options.limit));
  if (options?.offsetId != null && options.offsetId > 0) q.set("offsetId", String(options.offsetId));
  if (options?.refresh) q.set("refresh", "1");
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(
    `${apiBase()}/telegram/channels/${encodeURIComponent(username)}/messages${suffix}`,
    { cache: "no-store" },
  );
  const body = await parseJson<{ messages: TelegramNewsMessage[] }>(res);
  return body.messages ?? [];
}

export async function fetchTelegramNewsFeed(
  usernames: string[],
  options?: { limit?: number; before?: string; refresh?: boolean },
): Promise<TelegramNewsMessage[]> {
  const q = new URLSearchParams();
  if (usernames.length > 0) q.set("usernames", usernames.join(","));
  if (options?.limit != null) q.set("limit", String(options.limit));
  if (options?.before) q.set("before", options.before);
  if (options?.refresh) q.set("refresh", "1");
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/telegram/feed${suffix}`, { cache: "no-store" });
  const body = await parseJson<{ messages: TelegramNewsMessage[] }>(res);
  return body.messages ?? [];
}

export async function fetchTelegramNewsWidget(
  usernames: string[],
  filters: string[] = [],
): Promise<TelegramNewsWidgetResponse> {
  const q = new URLSearchParams();
  if (usernames.length > 0) q.set("usernames", usernames.join(","));
  if (filters.length > 0) q.set("filters", filters.join(","));
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/telegram/news-widget${suffix}`, { cache: "no-store" });
  return parseJson<TelegramNewsWidgetResponse>(res);
}

export async function fetchTelegramNewsDailyIndex(options?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<TelegramNewsDailyIndexResponse> {
  const q = new URLSearchParams();
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  if (options?.limit != null) q.set("limit", String(options.limit));
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/telegram/news-index${suffix}`, { cache: "no-store" });
  return parseJson<TelegramNewsDailyIndexResponse>(res);
}

export function telegramNewsChannelPhotoUrl(username: string): string {
  return `${apiBase()}/telegram/channels/${encodeURIComponent(username)}/photo`;
}

export function telegramNewsMessageMediaUrl(username: string, messageId: number): string {
  return `${apiBase()}/telegram/channels/${encodeURIComponent(username)}/messages/${messageId}/media`;
}

export function telegramNewsMessageVideoUrl(username: string, messageId: number): string {
  return `${apiBase()}/telegram/channels/${encodeURIComponent(username)}/messages/${messageId}/video`;
}

export function telegramNewsMessageVideoThumbUrl(username: string, messageId: number): string {
  return `${apiBase()}/telegram/channels/${encodeURIComponent(username)}/messages/${messageId}/video-thumb`;
}

export type NewsFeedbackCandidate = {
  postKey: string;
  channelUsername: string;
  messageId: number;
  date: string;
  text: string;
  url: string;
  source: "top5" | "candidate";
  llmWeight: number | null;
  llmPolarity: number | null;
  llmType: string | null;
  llmCategory: string | null;
  llmHeadline: string | null;
  llmWhy: string | null;
  llmImpact: string | null;
  hasFeedback: boolean;
  feedback: {
    humanNote: string;
    humanWeight: number | null;
    humanPolarity: number | null;
    humanType: string | null;
    humanCorrect: boolean | null;
    priceMoveBtc: number | null;
    priceMoveEth: number | null;
    priceMoveWindowHours: number | null;
  } | null;
};

export type NewsFeedbackCandidatesResponse = {
  day: string;
  sentiment: number | null;
  formula: string | null;
  candidateCount: number;
  top5: NewsFeedbackCandidate[];
  candidates: NewsFeedbackCandidate[];
};

export type NewsFeedbackPriceHintResponse = {
  priceMoveBtc: number | null;
  priceMoveEth: number | null;
  priceMoveWindowHours: number;
};

export type SaveNewsFeedbackInput = {
  postKey: string;
  day: string;
  postText: string;
  postTimestamp: string;
  source: "top5" | "candidate";
  llmWeight?: number;
  llmPolarity?: number;
  llmType?: string;
  llmCategory?: string;
  llmHeadline?: string;
  humanWeight?: number;
  humanPolarity?: number;
  humanType?: string;
  humanCorrect?: boolean;
  humanNote: string;
};

export async function fetchNewsFeedbackCandidates(day: string): Promise<NewsFeedbackCandidatesResponse> {
  const q = new URLSearchParams({ day });
  const res = await fetch(`${apiBase()}/telegram/news-feedback/candidates?${q}`, {
    ...authFetchInit,
    cache: "no-store",
  });
  return parseJson<NewsFeedbackCandidatesResponse>(res);
}

export async function fetchNewsFeedbackPriceHint(
  postTimestamp: string,
): Promise<NewsFeedbackPriceHintResponse> {
  const q = new URLSearchParams({ timestamp: postTimestamp });
  const res = await fetch(`${apiBase()}/telegram/news-feedback/price-hint?${q}`, {
    ...authFetchInit,
    cache: "no-store",
  });
  return parseJson<NewsFeedbackPriceHintResponse>(res);
}

export async function saveNewsFeedback(input: SaveNewsFeedbackInput): Promise<{ ok: true }> {
  const res = await fetch(`${apiBase()}/telegram/news-feedback`, {
    ...authFetchInit,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ ok: true }>(res);
}

/** Завершённый МСК-день для разметки (как в newsWidgetLlm). */
export function resolveNewsFeedbackMskDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour"));
  const today = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (hour >= 23) return today;
  const utc = Date.UTC(y, m - 1, d);
  const prev = new Date(utc - 24 * 60 * 60 * 1000);
  return `${String(prev.getUTCFullYear()).padStart(4, "0")}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}

export type NoteListItem = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  coverImageUrl: string | null;
};

export type NoteDetail = {
  id: string;
  title: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

export async function fetchNotesList(): Promise<NoteListItem[]> {
  const res = await portfolioFetch(`${apiBase()}/notes`, { cache: "no-store" });
  return parseJson<NoteListItem[]>(res);
}

export async function fetchNote(id: string): Promise<NoteDetail> {
  const res = await portfolioFetch(`${apiBase()}/notes/${encodeURIComponent(id)}`, { cache: "no-store" });
  return parseJson<NoteDetail>(res);
}

export async function createNote(input?: { title?: string; content?: unknown }): Promise<NoteDetail> {
  const res = await portfolioFetch(`${apiBase()}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  return parseJson<NoteDetail>(res);
}

export async function updateNote(
  id: string,
  input: { title?: string; content?: unknown },
): Promise<NoteDetail> {
  const res = await portfolioFetch(`${apiBase()}/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<NoteDetail>(res);
}

export async function deleteNote(id: string): Promise<void> {
  const res = await portfolioFetch(`${apiBase()}/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await parseJson(res);
}

export async function requestNoteUploadUrl(contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const res = await portfolioFetch(`${apiBase()}/notes/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  return parseJson<{ uploadUrl: string; publicUrl: string }>(res);
}

function resolveNoteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
}

export async function uploadNoteImage(file: File): Promise<string> {
  const contentType = file.type || "image/jpeg";
  const { uploadUrl, publicUrl } = await requestNoteUploadUrl(contentType);
  const targetUrl = resolveNoteAssetUrl(uploadUrl);
  const isSameOrigin = targetUrl.startsWith(window.location.origin);
  const putRes = await fetch(targetUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
    credentials: isSameOrigin ? "include" : "omit",
  });
  if (!putRes.ok) {
    let detail = "";
    try {
      const parsed = (await putRes.json()) as { error?: string };
      detail = parsed.error?.trim() ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Не удалось загрузить изображение");
  }
  return resolveNoteAssetUrl(publicUrl);
}

export type TradePeriod = "day" | "month" | "year" | "all";

export type TradeRecord = {
  id: string;
  symbol: string;
  direction: "long" | "short" | string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  quantityUnit: "coins" | "usd";
  entryAt: string;
  exitAt: string | null;
  commission: string;
  fundingFee: string;
  reason: string | null;
  comment: unknown;
  createdAt: string;
  updatedAt: string;
  pnlUsd: number;
  pnlPercent: number;
};

export type TradeUpsertPayload = {
  symbol?: string;
  direction?: string;
  entryPrice?: number | string;
  exitPrice?: number | string;
  quantity?: number | string;
  quantityUnit?: "coins" | "usd";
  entryAt?: string;
  exitAt?: string | null;
  commission?: number | string;
  fundingFee?: number | string;
  reason?: string | null;
  comment?: unknown;
};

export type EquityCurvePoint = {
  date: string;
  cumulativePnl: number;
};

function tradeQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchTrades(query?: {
  symbol?: string;
  direction?: string;
  from?: string;
  to?: string;
  pnlMin?: string;
  pnlMax?: string;
  period?: TradePeriod;
}): Promise<TradeRecord[]> {
  const res = await portfolioFetch(`${apiBase()}/trades${tradeQuery(query ?? {})}`, { cache: "no-store" });
  return parseJson<TradeRecord[]>(res);
}

export async function fetchTrade(id: string): Promise<TradeRecord> {
  const res = await portfolioFetch(`${apiBase()}/trades/${encodeURIComponent(id)}`, { cache: "no-store" });
  return parseJson<TradeRecord>(res);
}

export async function fetchTradeEquityCurve(period: TradePeriod = "all"): Promise<EquityCurvePoint[]> {
  const res = await portfolioFetch(`${apiBase()}/trades/equity-curve?period=${encodeURIComponent(period)}`, {
    cache: "no-store",
  });
  return parseJson<EquityCurvePoint[]>(res);
}

export async function createTrade(input: TradeUpsertPayload): Promise<TradeRecord> {
  const res = await portfolioFetch(`${apiBase()}/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<TradeRecord>(res);
}

export async function updateTrade(id: string, input: TradeUpsertPayload): Promise<TradeRecord> {
  const res = await portfolioFetch(`${apiBase()}/trades/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<TradeRecord>(res);
}

export async function deleteTrade(id: string): Promise<void> {
  const res = await portfolioFetch(`${apiBase()}/trades/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await parseJson(res);
}

export type MarketIndicesHistoryResponse = {
  field: CmcDailySnapshotHistoryField;
  days: number;
  points: CmcDailySnapshotHistoryPoint[];
};

export async function fetchMarketIndicesLatest(): Promise<CmcDailySnapshotLatestResponse> {
  const res = await fetch(`${apiBase()}/market-indices/latest`, { cache: "no-store" });
  return parseJson<CmcDailySnapshotLatestResponse>(res);
}

export async function fetchMarketIndicesHistory(
  field: CmcDailySnapshotHistoryField,
  days = 30,
): Promise<MarketIndicesHistoryResponse> {
  const q = new URLSearchParams({ field, days: String(days) });
  const res = await fetch(`${apiBase()}/market-indices/history?${q}`, { cache: "no-store" });
  return parseJson<MarketIndicesHistoryResponse>(res);
}

export async function fetchMarketIndexDailyBars(options: {
  indexId: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<MarketIndexDailyBarsResponse> {
  const q = new URLSearchParams({ indexId: options.indexId });
  if (options.limit != null) q.set("limit", String(options.limit));
  if (options.from) q.set("from", options.from);
  if (options.to) q.set("to", options.to);
  const res = await fetch(`${apiBase()}/market-indices/bars?${q}`, { cache: "no-store" });
  return parseJson<MarketIndexDailyBarsResponse>(res);
}

export async function fetchFearGreedDailyBars(options?: {
  limit?: number;
  from?: string;
  to?: string;
}): Promise<FearGreedDailyBarsResponse> {
  const q = new URLSearchParams();
  if (options?.limit != null) q.set("limit", String(options.limit));
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase()}/market-indices/fear-greed/history${suffix}`, {
    cache: "no-store",
  });
  return parseJson<FearGreedDailyBarsResponse>(res);
}

