import type { TelegramNewsMessage } from "@atlas-v1/shared";

const STORAGE_KEY = "atlas-v1-telegram-filters";
export const TELEGRAM_FILTERS_MAX = 40;
const FILTER_WORD_MAX_LEN = 64;

export function loadTelegramFilters(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeFilterList(parsed.map(String));
  } catch {
    return [];
  }
}

export function saveTelegramFilters(words: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFilterList(words)));
  } catch {
    // ignore quota / private mode
  }
}

export function normalizeFilterWord(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, FILTER_WORD_MAX_LEN);
}

export function normalizeFilterList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const word = normalizeFilterWord(item);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= TELEGRAM_FILTERS_MAX) break;
  }
  return out;
}

/** Пост скрывается, если в тексте есть любое из слов (без учёта регистра). */
export function messageBlockedByFilters(
  msg: TelegramNewsMessage,
  filters: string[],
): boolean {
  if (filters.length === 0) return false;
  const text = msg.text.toLowerCase();
  if (!text) return false;
  return filters.some((word) => text.includes(word.toLowerCase()));
}

export function applyTelegramFilters(
  messages: TelegramNewsMessage[],
  filters: string[],
): TelegramNewsMessage[] {
  if (filters.length === 0) return messages;
  return messages.filter((msg) => !messageBlockedByFilters(msg, filters));
}

/** Посты, которые скрыты активными фильтрами. */
export function hiddenByTelegramFilters(
  messages: TelegramNewsMessage[],
  filters: string[],
): TelegramNewsMessage[] {
  if (filters.length === 0) return [];
  return messages.filter((msg) => messageBlockedByFilters(msg, filters));
}

/** Какие слова-фильтры сработали на посте. */
export function matchedFilterWords(
  msg: TelegramNewsMessage,
  filters: string[],
): string[] {
  if (filters.length === 0 || !msg.text) return [];
  const text = msg.text.toLowerCase();
  return filters.filter((word) => text.includes(word.toLowerCase()));
}
