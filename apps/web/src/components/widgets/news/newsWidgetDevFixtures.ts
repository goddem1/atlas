/**
 * Тестовые новости для локальной вёрстки виджета.
 * Подключаются только при `import.meta.env.DEV`.
 * Перед/при выкладке на прод файл можно удалить (в production Vite их не использует).
 */
import type { TelegramNewsWidgetExplanation } from "@atlas-v1/shared";
import type { NewsWidgetItem } from "./newsClassify";

const NOW = Date.now();

export const DEV_NEWS_SENTIMENT = 68;

export const DEV_NEWS_EXPLANATION: TelegramNewsWidgetExplanation = {
  formula:
    "[DEV] Тестовый сентимент 68%: условно 7 позитивных и 3 негативных сигнала. Удалить fixtures перед продом.",
  notes: [
    {
      id: "dev-news-0",
      why: "Сильный макро-сигнал (тестовая заметка).",
      impact: "Может сдвинуть риск-аппетит.",
    },
    {
      id: "dev-news-1",
      why: "Крипто-новость с широким охватом (тест).",
      impact: "Волатильность по BTC/ETH.",
    },
    {
      id: "dev-news-2",
      why: "Потоки фондов / ETF (тест).",
      impact: "Давление на спотовый рынок.",
    },
    {
      id: "dev-news-3",
      why: "Рыночный заголовок (тест).",
      impact: "Корреляция с индексами.",
    },
    {
      id: "dev-news-4",
      why: "Нейтральный фон (тест).",
      impact: "Слабый эффект на сентимент.",
    },
  ],
};

export const DEV_NEWS_ITEMS: NewsWidgetItem[] = [
  {
    key: "dev-news-0",
    channelUsername: "dev_macro",
    messageId: 1,
    text: "ФРС сохранила ставку без изменений. Рынки ждут сигналов по снижению во втором полугодии.",
    url: "https://t.me/",
    date: new Date(NOW - 12 * 60_000).toISOString(),
    tag: { id: "macro", label: "Макро", color: "#FF8D28" },
  },
  {
    key: "dev-news-1",
    channelUsername: "dev_crypto",
    messageId: 2,
    text: "Bitcoin закрепился выше ключевого уровня; объёмы выросли на фоне притока в спотовые ETF.",
    url: "https://t.me/",
    date: new Date(NOW - 35 * 60_000).toISOString(),
    tag: { id: "crypto", label: "Крипто", color: "#0088FF" },
  },
  {
    key: "dev-news-2",
    channelUsername: "dev_funds",
    messageId: 3,
    text: "ETF на Ethereum зафиксировали чистый приток вторую неделю подряд — крупнейшие покупки у BlackRock и Fidelity.",
    url: "https://t.me/",
    date: new Date(NOW - 90 * 60_000).toISOString(),
    tag: { id: "funds", label: "Фонда", color: "#CB30E0" },
  },
  {
    key: "dev-news-3",
    channelUsername: "dev_markets",
    messageId: 4,
    text: "S&P 500 обновил локальный максимум; доллар ослаб, доходности Treasuries снизились.",
    url: "https://t.me/",
    date: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    tag: { id: "markets", label: "Рынок", color: "#34C759" },
  },
  {
    key: "dev-news-4",
    channelUsername: "dev_macro",
    messageId: 5,
    text: "Инфляция в еврозоне замедлилась сильнее прогноза — ожидания по ставке ЕЦБ сместились вниз.",
    url: "https://t.me/",
    date: new Date(NOW - 5 * 60 * 60_000).toISOString(),
    tag: { id: "macro", label: "Макро", color: "#FF8D28" },
  },
];
