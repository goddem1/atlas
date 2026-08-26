/** Максимум каналов в подписке клиента. */
export const TELEGRAM_CHANNELS_MAX = 30;

/** Канал новостного Telegram-ридера. */
export type TelegramNewsChannel = {
  username: string;
  title: string;
  /** Есть ли аватар (для URL /telegram/channels/:username/photo). */
  hasPhoto: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type TelegramNewsChannelsResponse = {
  channels: TelegramNewsChannel[];
};

/** Сущность текста (offset/length — UTF-16, как в Telegram). */
export type TelegramNewsTextEntity = {
  offset: number;
  length: number;
  type: "url" | "text_url" | "mention" | "hashtag";
  /** Для text_url — целевой URL; для остальных может отсутствовать. */
  url?: string;
};

/** Пост канала. */
export type TelegramNewsMessage = {
  id: number;
  channelUsername: string;
  date: string;
  text: string;
  entities: TelegramNewsTextEntity[];
  views: number | null;
  forwards: number | null;
  isForwarded: boolean;
  hasMedia: boolean;
  /** Есть скачиваемое изображение (фото / превью webpage / image-document). */
  hasImage: boolean;
  /** Есть видео (document video/*); стрим через /messages/:id/video. */
  hasVideo: boolean;
  /** Есть превью-кадр видео (/messages/:id/video-thumb). */
  hasVideoThumb: boolean;
  /** Размер видео в байтах, если известен; null если не видео / неизвестно. */
  videoSize: number | null;
  mediaType: "photo" | "video" | "audio" | "document" | "webpage" | "other" | null;
  url: string;
};

export type TelegramNewsMessagesResponse = {
  messages: TelegramNewsMessage[];
};

/** Тип важности новости для отбора топ-5. */
export type TelegramNewsWidgetItemKind = "moved" | "will_move" | "narrative";

/** Категория тега в news-виджете. */
export type TelegramNewsWidgetCategory = "macro" | "crypto" | "funds" | "markets";

export const TELEGRAM_NEWS_WIDGET_CATEGORIES: Record<
  TelegramNewsWidgetCategory,
  { id: TelegramNewsWidgetCategory; label: string; color: string }
> = {
  macro: { id: "macro", label: "Макро", color: "#FF8D28" },
  crypto: { id: "crypto", label: "Крипто", color: "#0088FF" },
  funds: { id: "funds", label: "Фонда", color: "#CB30E0" },
  markets: { id: "markets", label: "Рынок", color: "#34C759" },
};

export function parseTelegramNewsWidgetCategory(
  raw: unknown,
): TelegramNewsWidgetCategory | undefined {
  if (raw === "macro" || raw === "crypto" || raw === "funds" || raw === "markets") return raw;
  if (raw === "Макро" || raw === "макро") return "macro";
  if (raw === "Крипто" || raw === "крипто") return "crypto";
  if (raw === "Фонда" || raw === "фонда" || raw === "Фонды" || raw === "фонды") return "funds";
  if (raw === "Рынок" || raw === "рынок") return "markets";
  return undefined;
}

/** Пояснение к одной новости в виджете. */
export type TelegramNewsWidgetItemNote = {
  /** `channelUsername:messageId` */
  id: string;
  /** Короткий перефраз для строки виджета (1 строка). */
  headline?: string;
  /** Почему новость попала в топ. */
  why: string;
  /** Как влияет на крипту/рынки. */
  impact: string;
  /** moved | will_move | narrative */
  kind?: TelegramNewsWidgetItemKind;
  /** Одна из 4 категорий тега. */
  category?: TelegramNewsWidgetCategory;
};

/** Структурированное объяснение LLM для панели info. */
export type TelegramNewsWidgetExplanation = {
  /** Как посчитан процент сентимента (формула и цифры). */
  formula: string;
  /** Пояснения к топ-новостям (порядок как у items). */
  notes: TelegramNewsWidgetItemNote[];
};

/** Ответ LLM-виджета новостей (сентимент + топ-5). */
export type TelegramNewsWidgetResponse = {
  sentiment: number;
  /** Краткий заголовок/статус (fallback / legacy). */
  why: string;
  explanation: TelegramNewsWidgetExplanation;
  items: TelegramNewsMessage[];
  cached: boolean;
  updatedAt: string;
  /** День выборки (YYYY-MM-DD, календарь Europe/Moscow). */
  day?: string;
  /** Сколько постов дня ушло в анализ. */
  candidateCount?: number;
};

/** Точка дневного индекса новостей для графика. */
export type TelegramNewsDailyIndexPoint = {
  day: string;
  sentiment: number;
  candidateCount: number;
  source: "llm" | "heuristic";
  updatedAt: string;
};

export type TelegramNewsDailyIndexResponse = {
  points: TelegramNewsDailyIndexPoint[];
};

/** Нормализация @Name / t.me/Name → name. */
export function normalizeTelegramUsername(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "");
  s = s.replace(/^@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  return s.trim().toLowerCase();
}
