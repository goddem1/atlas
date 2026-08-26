const STORAGE_KEY = "atlas-v1-telegram-news-read";

/** username → ISO-время последнего просмотренного поста */
export type TelegramNewsReadMap = Record<string, string>;

export function loadTelegramNewsReadState(): TelegramNewsReadMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: TelegramNewsReadMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key.toLowerCase()] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveTelegramNewsReadState(map: TelegramNewsReadMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function markTelegramNewsChannelRead(
  username: string,
  readAt: string,
): TelegramNewsReadMap {
  const key = username.toLowerCase();
  const readTs = Date.parse(readAt);
  if (!Number.isFinite(readTs)) return loadTelegramNewsReadState();

  const prev = loadTelegramNewsReadState();
  const prevTs = prev[key] ? Date.parse(prev[key]!) : 0;
  if (Number.isFinite(prevTs) && readTs <= prevTs) return prev;

  const next = { ...prev, [key]: readAt };
  saveTelegramNewsReadState(next);
  return next;
}

export function isTelegramNewsChannelUnread(
  username: string,
  lastMessageAt: string | null,
  readMap: TelegramNewsReadMap,
): boolean {
  if (!lastMessageAt) return false;
  const lastTs = Date.parse(lastMessageAt);
  if (!Number.isFinite(lastTs)) return false;

  const readAt = readMap[username.toLowerCase()];
  if (!readAt) return true;

  const readTs = Date.parse(readAt);
  if (!Number.isFinite(readTs)) return true;
  return lastTs > readTs;
}
