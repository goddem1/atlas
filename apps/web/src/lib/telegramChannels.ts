import { TELEGRAM_CHANNELS_MAX, normalizeTelegramUsername } from "@atlas-v1/shared";

const STORAGE_KEY = "atlas-v1-telegram-channels";

/** `null` — ещё не сохраняли (первый запуск, брать дефолт с API). */
export function loadTelegramChannels(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return normalizeChannelList(parsed.map(String));
  } catch {
    return null;
  }
}

export function saveTelegramChannels(usernames: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeChannelList(usernames)));
  } catch {
    // ignore quota / private mode
  }
}

export function normalizeChannelList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const username = normalizeTelegramUsername(item);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= TELEGRAM_CHANNELS_MAX) break;
  }
  return out;
}
