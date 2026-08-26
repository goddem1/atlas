import type { TelegramNewsMessage, TelegramNewsWidgetCategory } from "@atlas-v1/shared";
import { TELEGRAM_NEWS_WIDGET_CATEGORIES } from "@atlas-v1/shared";

export type NewsTagId = TelegramNewsWidgetCategory;

export type NewsTag = {
  id: NewsTagId;
  label: string;
  color: string;
};

export type NewsWidgetItem = {
  key: string;
  channelUsername: string;
  messageId: number;
  text: string;
  url: string;
  date: string;
  tag: NewsTag;
};

const TAGS = TELEGRAM_NEWS_WIDGET_CATEGORIES;

/** Клиентский fallback, если LLM не вернул category. */
const TAG_RULES: Array<{ id: NewsTagId; re: RegExp }> = [
  {
    id: "macro",
    re: /\b(цб|фрс|ставк|инфляц|ввп|безработиц|cpi|ppi|nfp|макро|фнс|бюджет|мвф|ecb|fed|powell|пауэлл|fomc)\b/i,
  },
  {
    id: "funds",
    re: /\b(etf|фонд|фонды|blackrock|fidelity|vanguard|grayscale|ark invest|inflow|outflow|приток|отток|btc-etf|eth-etf)\b/i,
  },
  {
    id: "crypto",
    re: /\b(btc|bitcoin|eth|ethereum|crypto|крипт|биткоин|токен|блокчейн|defi|nft|solana|binance|coinbase|стейк|хак|взлом)\b/i,
  },
  {
    id: "markets",
    re: /\b(акци[яи]|индекс|s&p|nasdaq|imoex|нефть|золот|доллар|рубл|облигац|трейдинг|рынок|бирж|ликвидац|фьючерс)\b/i,
  },
];

const POSITIVE_PATTERN =
  "рост|ралли|рекорд|прибыл|быч|surge|rally|high|strong|beat|upgrade|позитив|укрепил|взлет|взлёт";
const NEGATIVE_PATTERN =
  "паден|обвал|убыт|медвеж|crash|sell|war|санкц|слаб|снижен|рисков|рецесс|дефолт|продаж|негатив";

function countKeywordHits(text: string, pattern: string): number {
  return (text.match(new RegExp(`\\b(?:${pattern})\\b`, "gi")) ?? []).length;
}

export function tagFromCategory(category: NewsTagId | undefined | null): NewsTag {
  if (category && TAGS[category]) return TAGS[category];
  return TAGS.markets;
}

export function classifyNewsTag(text: string): NewsTag {
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) return TAGS[rule.id];
  }
  return TAGS.markets;
}

export function compactNewsText(text: string, max = 100): string {
  const oneLine = text.replace(/\s+/g, " ").trim().replace(/…+/g, "").replace(/\.{3,}/g, ".");
  if (oneLine.length <= max) return oneLine;
  const slice = oneLine.slice(0, max);
  const space = slice.lastIndexOf(" ");
  const cut = space >= 55 ? space : max;
  let out = slice.slice(0, cut).trim().replace(/[,:;–—-]+$/, "").trim();
  if (out && !/[.!?]$/.test(out)) out = `${out}.`;
  return out;
}

export function toNewsWidgetItem(
  msg: TelegramNewsMessage,
  category?: NewsTagId | null,
): NewsWidgetItem {
  return {
    key: `${msg.channelUsername}:${msg.id}`,
    channelUsername: msg.channelUsername,
    messageId: msg.id,
    text: compactNewsText(msg.text || (msg.hasMedia ? "[медиа]" : "")),
    url: msg.url,
    date: msg.date,
    tag: category ? tagFromCategory(category) : classifyNewsTag(msg.text),
  };
}

/** Настроение ленты 0–100: выше — больше позитивных сигналов в текстах. */
export function scoreNewsSentiment(texts: string[]): number {
  if (texts.length === 0) return 50;
  let pos = 0;
  let neg = 0;
  for (const text of texts) {
    pos += countKeywordHits(text, POSITIVE_PATTERN);
    neg += countKeywordHits(text, NEGATIVE_PATTERN);
  }
  const total = pos + neg;
  if (total === 0) return 54;
  const ratio = (pos - neg) / total;
  return Math.round(Math.min(92, Math.max(12, 50 + ratio * 40)));
}

export function sentimentTone(score: number): "good" | "mid" | "bad" {
  if (score >= 58) return "good";
  if (score <= 42) return "bad";
  return "mid";
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
): string {
  return `rgb(${lerpChannel(from.r, to.r, t)}, ${lerpChannel(from.g, to.g, t)}, ${lerpChannel(from.b, to.b, t)})`;
}

/** Цвет подписи на шкале: красный → серый → зелёный по позиции 0–100. */
export function sentimentMeterColor(score: number): string {
  const t = Math.min(100, Math.max(0, score)) / 100;
  const red = { r: 255, g: 56, b: 60 };
  const green = { r: 52, g: 198, b: 89 };
  const gray = { r: 128, g: 128, b: 128 };

  if (t <= 0.5) return lerpRgb(red, gray, t / 0.5);
  return lerpRgb(gray, green, (t - 0.5) / 0.5);
}
