const TOKEN_KEY = "prvtnews-token";

export type ChannelRow = {
  id: string;
  username: string;
  title: string;
  kind: "opinion" | "news";
  notes: string;
  isActive: boolean;
  addedAt: string;
  messageCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  floodWaitUntil: string | null;
};

export function readToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function writeToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Запрос не выполнен");
  return body as T;
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listChannels(): Promise<ChannelRow[]> {
  return request("/api/channels");
}

export function addChannel(username: string, kind: "opinion" | "news"): Promise<{ id: string }> {
  return request("/api/channels", {
    method: "POST",
    body: JSON.stringify({ username, kind }),
  });
}

export function removeChannel(id: string): Promise<void> {
  return request(`/api/channels/${id}`, { method: "DELETE" });
}

export type MetricCard = {
  key: string;
  group: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  title: string;
  description: string;
  caveat: string;
  minN: number;
  format: "pct" | "min" | "count" | "usd" | "num";
  value: number | null;
  n: number;
  ciLow: number | null;
  ciHigh: number | null;
  status: "ok" | "warn" | "bad" | "insufficient_data";
  trend: Array<number | null>;
};

export type LabelItem = {
  extractionId: string;
  username: string;
  postedAt: string;
  text: string;
  replyText: string;
  context: string[];
  msgType: string | null;
  evidenceValid: boolean;
  isAd: boolean;
  parsed: unknown;
  coins: Array<{ rawMention: string; status: string; symbol: string | null }>;
};

export function loadMetrics(): Promise<{ assumptions: string; metrics: MetricCard[] }> {
  return request("/api/metrics");
}

export function recomputeMetrics(): Promise<{ stored: number }> {
  return request("/api/metrics/recompute", { method: "POST" });
}

export function loadOverview(): Promise<{
  assumptions: string;
  labeled: number;
  open: boolean;
  gates: Array<{ id: string; title: string; passed: boolean; detail: string }>;
  features: Array<{ id: string; title: string; enabled: boolean; reason: string }>;
}> {
  return request("/api/service/overview");
}

export function nextLabel(): Promise<{ item: LabelItem | null; labeled: number; remaining: number }> {
  return request("/api/labels/next");
}

export type CallRow = {
  id: string;
  username: string;
  symbol: string;
  kind: string;
  direction: string;
  horizon: string;
  status: string;
  openedAt: string;
  untestableReason: string | null;
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  targets: number[];
};

export type CallDetail = CallRow & {
  text: string;
  parsed: unknown;
  closeReason: string | null;
  events: Array<{ type: string; at: string; text: string }>;
  extractionId: string | null;
  prices: Array<{ ts: string; price: number }>;
  evaluation: { status: string; returnPct: number | null; exitReason: string | null; entryPrice: number | null; exitPrice: number | null } | null;
  testerNote: string;
};

export type ChannelSummary = {
  testerEnabled: boolean;
  reason: string;
  caveat: string;
  channels: Array<{
    username: string;
    title: string;
    messages: number;
    deleted: number;
    edited: number;
    ads: number;
    calls: number;
    testable: number;
    open: number;
    closed: number;
    untestable: number;
    types: Record<string, number>;
    results: string;
    profile: { weekStart: string; freshnessDays: number; claims: number; kept: number; mood: string; changed: boolean } | null;
  }>;
};

export type SentimentPoint = {
  date: string;
  key: string;
  score: number;
  dispersion: number;
  nMessages: number;
  nChannels: number;
  effectiveNChannels: number;
  overheated: boolean;
};

export type SentimentView = {
  note: string;
  market: SentimentPoint[];
  coins: SentimentPoint[];
  themes: SentimentPoint[];
  flags: Array<{ symbol: string; at: string; channels: string[] }>;
};

export type DigestView = {
  digest: {
    day: string;
    newMessages: number;
    taken: Array<{ symbol: string; direction: string; username: string }>;
    consensus: Array<{ symbol: string; side: string; voices: number }>;
    disagreement: Array<{ symbol: string; voices: number; spread: number }>;
    alerts: Array<{ level: "warn" | "bad"; text: string }>;
  };
  panorama: {
    asOf: string;
    disclaimer: string;
    market: { score: number; nChannels: number; effectiveNChannels: number; nMessages: number; dispersion: number; overheated: boolean } | null;
    taken: Array<{ symbol: string; direction: string; count: number }>;
    consensus: Array<{ symbol: string; side: string; voices: number }>;
    disagreement: Array<{ symbol: string; voices: number; spread: number }>;
  };
};

export function loadDigestView(): Promise<DigestView> {
  return request("/api/digest");
}

export function loadSentiment(): Promise<SentimentView> {
  return request("/api/sentiment");
}

export function loadChannelSummary(): Promise<ChannelSummary> {
  return request("/api/service/channels");
}

export function refreshPrices(): Promise<{ skipped: boolean; reason: string; evaluated: number; prices: { symbols: number; points: number } }> {
  return request("/api/tester/recompute", { method: "POST", body: JSON.stringify({}) });
}

export type ReviewRow = {
  id: string;
  reason: string;
  rawMention: string;
  username: string;
  text: string;
  candidates: Array<{ id: string; symbol: string; direction: string; status: string }>;
};

export function listCalls(): Promise<CallRow[]> {
  return request("/api/calls");
}

export function loadCall(id: string): Promise<CallDetail> {
  return request(`/api/calls/${id}`);
}

export function listReviews(): Promise<ReviewRow[]> {
  return request("/api/reviews");
}

export function resolveReview(id: string, callId: string): Promise<{ ok: boolean }> {
  return request(`/api/reviews/${id}/resolve`, { method: "POST", body: JSON.stringify({ callId }) });
}

export type PromptRow = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  body: string;
  activation: { ok: boolean; reason: string };
};

export function listPrompts(): Promise<{ labeled: number; prompts: PromptRow[] }> {
  return request("/api/prompts");
}

export function savePrompt(name: string, body: string): Promise<{ id: string; version: number; isActive: boolean }> {
  return request("/api/prompts", { method: "POST", body: JSON.stringify({ name, body }) });
}

export function evalPrompt(id: string): Promise<{ skipped: boolean; labeled: number; created: number; reason: string }> {
  return request(`/api/prompts/${id}/eval`, { method: "POST", body: JSON.stringify({}) });
}

export function activatePrompt(id: string): Promise<{ ok: boolean; reason: string }> {
  return request(`/api/prompts/${id}/activate`, { method: "POST", body: JSON.stringify({}) });
}

export type ParamRow = {
  id: string;
  kind: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  params: unknown;
};

export function listParams(): Promise<{ sets: ParamRow[] }> {
  return request("/api/params");
}

export function saveParams(kind: string, params: unknown): Promise<{ id: string; version: number; isActive: boolean }> {
  return request("/api/params", { method: "POST", body: JSON.stringify({ kind, params }) });
}

export function recomputeParams(id: string): Promise<{ activated: boolean; reason?: string; evaluated?: number; stored?: number; snapshots?: number }> {
  return request(`/api/params/${id}/recompute`, { method: "POST", body: JSON.stringify({}) });
}

export function saveLabel(body: {
  extractionId: string;
  verdict: "correct" | "wrong" | "partial";
  fieldErrors: string[];
  missedSignal: boolean;
  note: string;
}): Promise<{ ok: boolean }> {
  return request("/api/labels", { method: "POST", body: JSON.stringify(body) });
}
