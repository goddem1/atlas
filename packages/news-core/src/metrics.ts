import type { MetricStatus, PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";

export type MetricGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type MetricFormat = "pct" | "min" | "count" | "usd" | "num";

export type MetricDefinition = {
  key: string;
  group: MetricGroup;
  title: string;
  description: string;
  caveat: string;
  minN: number;
  format: MetricFormat;
  higherBetter: boolean | null;
};

export const METRICS: MetricDefinition[] = [
  {
    key: "ingest_lag_min",
    group: "A",
    title: "Лаг последнего сообщения",
    description: "Минуты от самого свежего сохранённого поста канала до текущего времени.",
    caveat: "Это и тишина канала, и лаг сбора сразу: без сверки с Telegram их не разделить.",
    minN: 1,
    format: "min",
    higherBetter: false,
  },
  {
    key: "messages_per_day",
    group: "A",
    title: "Сообщений за сутки",
    description: "Число постов за последние 24 часа. Рядом — отношение к медиане предыдущих 7 суток.",
    caveat: "Короткий ряд из семи дней легко принимает обычный выходной за аномалию.",
    minN: 1,
    format: "count",
    higherBetter: null,
  },
  {
    key: "ingest_errors_24h",
    group: "A",
    title: "Ошибки сбора за 24 часа",
    description: "Каналы, у которых в состоянии сбора записана ошибка.",
    caveat: "Ошибка не стирается сама, пока следующий успешный проход её не очистит.",
    minN: 1,
    format: "count",
    higherBetter: false,
  },
  {
    key: "floodwait_events_24h",
    group: "A",
    title: "FloodWait за 24 часа",
    description: "Каналы, у которых окно ожидания Telegram попадает на последние сутки.",
    caveat: "Считаются каналы с отметкой, а не каждое отдельное срабатывание.",
    minN: 1,
    format: "count",
    higherBetter: false,
  },
  {
    key: "deleted_detected_share",
    group: "A",
    title: "Доля удалённых",
    description: "Доля сохранённых сообщений, помеченных удалёнными.",
    caveat: "Удалённые до первого сбора посты сюда не попадают.",
    minN: 30,
    format: "pct",
    higherBetter: null,
  },
  {
    key: "edited_share",
    group: "A",
    title: "Доля правок",
    description: "Доля сообщений с новой версией или с правкой, замеченной уже при бэкфилле.",
    caveat: "Правка до сбора могла изменить смысл задним числом.",
    minN: 30,
    format: "pct",
    higherBetter: null,
  },
  {
    key: "extract_queue_depth",
    group: "A",
    title: "Очередь разбора",
    description: "Версии сообщений без разбора активным промптом.",
    caveat: "Глубина очереди — снимок, не доля. Интервал для неё не считается.",
    minN: 0,
    format: "count",
    higherBetter: false,
  },
  {
    key: "extract_failure_rate",
    group: "A",
    title: "Доля невалидного JSON",
    description: "Доля разборов, которые не прошли схему даже после повторов.",
    caveat: "Сюда не входят ответы, где схема верна, но цитата не совпала с текстом.",
    minN: 30,
    format: "pct",
    higherBetter: false,
  },
  {
    key: "type_accuracy",
    group: "B",
    title: "Точность типа",
    description: "Доля размеченных сообщений, где тип не отмечен ошибкой.",
    caveat: "Если разметчик не выбрал поле «тип», тип считается верным и для вердикта «частично».",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "signal_precision",
    group: "B",
    title: "Precision сигналов",
    description: "Среди размеченных сообщений, которые модель назвала сигналом, доля без ошибки типа.",
    caveat: "Считается только по тому, что попало в разметку, а не по всем постам.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "signal_recall",
    group: "B",
    title: "Recall сигналов",
    description: "Среди реальных сигналов, включая флаг «пропущен сигнал», доля найденных моделью.",
    caveat: "Оценка идёт по выборке, где специально есть шум. Это не полный перебор канала.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_direction",
    group: "B",
    title: "Точность направления",
    description: "Доля разметок, где направление не отмечено ошибкой.",
    caveat: "Поле без отметки ошибки считается верным.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_entry",
    group: "B",
    title: "Точность входа",
    description: "Доля разметок, где вход не отмечен ошибкой.",
    caveat: "Поле без отметки ошибки считается верным.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_stop",
    group: "B",
    title: "Точность стопа",
    description: "Доля разметок, где стоп не отмечен ошибкой.",
    caveat: "Поле без отметки ошибки считается верным.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_targets",
    group: "B",
    title: "Точность целей",
    description: "Доля разметок, где цели не отмечены ошибкой.",
    caveat: "Поле без отметки ошибки считается верным.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_horizon",
    group: "B",
    title: "Точность горизонта",
    description: "Доля разметок, где горизонт не отмечен ошибкой.",
    caveat: "Поле без отметки ошибки считается верным.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "field_accuracy_coin",
    group: "B",
    title: "Точность монеты",
    description: "Доля разметок, где монета не отмечена ошибкой.",
    caveat: "Это суждение разметчика, отдельно от автоматической доли unknown.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "coin_resolution_accuracy",
    group: "B",
    title: "Точность привязки монеты",
    description: "Та же разметка поля «монета»: справочник не угадывается моделью, ошибку отмечает человек.",
    caveat: "Пока нет отметки по полю, привязка считается верной.",
    minN: 100,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "coin_unknown_share",
    group: "B",
    title: "Доля неизвестных монет",
    description: "Доля упоминаний, которых нет в справочнике.",
    caveat: "Новый тикер будет unknown, пока его не добавят в справочник.",
    minN: 30,
    format: "pct",
    higherBetter: false,
  },
  {
    key: "coin_ambiguous_share",
    group: "B",
    title: "Доля неоднозначных монет",
    description: "Доля упоминаний, которые совпали с несколькими монетами справочника.",
    caveat: "Неоднозначное не привязывается наугад.",
    minN: 30,
    format: "pct",
    higherBetter: false,
  },
  {
    key: "schema_valid_rate",
    group: "B",
    title: "Доля валидной схемы",
    description: "Доля разборов с JSON, прошедшим схему.",
    caveat: "Валидная схема не значит, что уровни правда есть в тексте.",
    minN: 30,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "evidence_valid_rate",
    group: "B",
    title: "Доля дословных цитат",
    description: "Доля разборов, где evidence — подстрока исходного текста.",
    caveat: "Пересказ своими словами сюда не проходит, даже если смысл близкий.",
    minN: 30,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "low_confidence_share",
    group: "B",
    title: "Доля низкой уверенности",
    description: "Доля разборов с confidence ниже порога из параметров.",
    caveat: "Порог начальный. Уверенность модели — не вероятность правоты.",
    minN: 30,
    format: "pct",
    higherBetter: false,
  },
  {
    key: "gold_set_size",
    group: "B",
    title: "Размер золотого набора",
    description: "Число ручных разметок.",
    caveat: "Пока разметок меньше 100, метрики качества остаются insufficient_data.",
    minN: 0,
    format: "count",
    higherBetter: true,
  },
  {
    key: "testable_share",
    group: "C",
    title: "Доля проверяемых вызовов",
    description: "Доля вызовов без причины непроверяемости.",
    caveat: "Проверяемость здесь про текст и правки. Цена сама по себе вызов не бракует, пока окно сделки ещё не прошло.",
    minN: 30,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "coin_price_coverage",
    group: "C",
    title: "Покрытие монет источником цены",
    description: "Доля упоминаний, у которых монета нашлась и у неё есть символ Binance или CoinGecko.",
    caveat: "Это наличие источника, а не уже скачанные свечи.",
    minN: 30,
    format: "pct",
    higherBetter: true,
  },
  {
    key: "ad_share",
    group: "C",
    title: "Доля рекламы",
    description: "Доля сообщений, чей разбор помечен как реклама.",
    caveat: "Реклама не становится вызовом.",
    minN: 30,
    format: "pct",
    higherBetter: null,
  },
  {
    key: "backfilled_share",
    group: "C",
    title: "Доля бэкфилла",
    description: "Доля сообщений, загруженных историей, а не живым сбором.",
    caveat: "У исторического поста правка могла появиться до первого сохранения.",
    minN: 30,
    format: "pct",
    higherBetter: null,
  },
  {
    key: "cost_per_day",
    group: "G",
    title: "Стоимость за сутки",
    description: "Сумма costUsd разборов за последние 24 часа.",
    caveat: "Если провайдер не вернул стоимость, такие вызовы входят в n, но не в сумму.",
    minN: 1,
    format: "usd",
    higherBetter: null,
  },
  {
    key: "cost_per_message",
    group: "G",
    title: "Стоимость сообщения",
    description: "Средняя costUsd одного разбора. Интервал — bootstrap среднего.",
    caveat: "Нулевые стоимости от провайдера занижают среднее.",
    minN: 2,
    format: "usd",
    higherBetter: null,
  },
  {
    key: "cost_per_extracted_signal",
    group: "G",
    title: "Стоимость извлечённого сигнала",
    description: "Сумма стоимости всех разборов, делённая на число валидных разборов типа signal.",
    caveat: "Это цена найденного моделью сигнала, не подтверждённого разметкой.",
    minN: 1,
    format: "usd",
    higherBetter: null,
  },
  {
    key: "tokens_in_total",
    group: "G",
    title: "Входящие токены",
    description: "Сумма tokensIn по стадии extract.",
    caveat: "Счётчик провайдера, без пересчёта токенизатором.",
    minN: 1,
    format: "count",
    higherBetter: null,
  },
  {
    key: "tokens_out_total",
    group: "G",
    title: "Исходящие токены",
    description: "Сумма tokensOut по стадии extract.",
    caveat: "Счётчик провайдера, без пересчёта токенизатором.",
    minN: 1,
    format: "count",
    higherBetter: null,
  },
];

const RESULT_CAVEAT = "Удалённые до сбора посты не видны, статистика может быть приукрашена. Пока закрытых оценок меньше 30, статус — мало данных, это не рейтинг канала.";

const RESULT_METRICS: MetricDefinition[] = [
  { key: "closed_calls_n", group: "D", title: "Закрытые оценки", description: "Число последних оценок тестера со статусом closed.", caveat: RESULT_CAVEAT, minN: 30, format: "count", higherBetter: null },
  { key: "not_triggered_share", group: "D", title: "Доля не сработавших входов", description: "Среди закрытых и не сработавших входов доля not_triggered. Это не поражение.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "open_calls_n", group: "D", title: "Ещё открытые оценки", description: "Оценки, у которых срок удержания или контрольная точка ещё не наступили.", caveat: RESULT_CAVEAT, minN: 30, format: "count", higherBetter: null },
  { key: "win_rate", group: "D", title: "Доля положительных", description: "Среди закрытых оценок с доходностью доля тех, где доходность выше нуля. not_triggered не входит.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "avg_r_multiple", group: "D", title: "Средний R", description: "Среднее rMultiple закрытых оценок, где был стоп. Интервал — bootstrap.", caveat: RESULT_CAVEAT, minN: 30, format: "num", higherBetter: null },
  { key: "median_return", group: "D", title: "Медианная доходность", description: "Медиана доходности закрытых оценок после комиссии и проскальзывания.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "profit_factor", group: "D", title: "Profit factor", description: "Сумма положительных доходностей, делённая на модуль суммы отрицательных.", caveat: RESULT_CAVEAT, minN: 30, format: "num", higherBetter: null },
  { key: "max_drawdown", group: "D", title: "Просадка суммы", description: "Наибольшее падение накопленной суммы доходностей от её пика, по времени выхода.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "excess_vs_btc", group: "D", title: "Превышение над BTC", description: "Средняя разница доходности оценки и BTC за то же окно.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "excess_vs_coin_hold", group: "D", title: "Превышение над удержанием монеты", description: "Средняя разница доходности оценки и удержания той же монеты.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "direction_accuracy", group: "D", title: "Точность направления", description: "Среди контрольных точек 7 дней, а если её нет — 1 дня, доля верных знаков.", caveat: RESULT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "time_to_result", group: "D", title: "Время до результата", description: "Средние минуты от входа до выхода у закрытых оценок.", caveat: RESULT_CAVEAT, minN: 30, format: "min", higherBetter: null },
  { key: "early_mention_rank", group: "D", title: "Ранг раннего упоминания", description: "Средний порядок упоминания среди вызовов, которые случились до роста монеты на 10% от цены у первого упоминания. В решение о входе этот ранг не подаётся.", caveat: RESULT_CAVEAT, minN: 30, format: "num", higherBetter: null },
];

METRICS.push(...RESULT_METRICS);

const PROFILE_CAVEAT = "Утверждение без id сообщения этого канала за эту неделю отбрасывается. Свежесть считается от записи профиля. Пока утверждений меньше 30, доля ссылок не получает статус качества.";

const PROFILE_METRICS: MetricDefinition[] = [
  { key: "profile_evidence_valid_rate", group: "E", title: "Доля утверждений со ссылкой", description: "Среди утверждений профиля доля тех, у которых все messageId есть в сообщениях канала за эту неделю.", caveat: PROFILE_CAVEAT, minN: 30, format: "pct", higherBetter: true },
  { key: "profile_freshness_days", group: "E", title: "Свежесть профиля, дни", description: "Сколько дней прошло с записи самого свежего профиля канала. Общая цифра — худший канал, у которого профиль уже есть.", caveat: PROFILE_CAVEAT, minN: 1, format: "num", higherBetter: false },
  { key: "profile_change_flag", group: "E", title: "Доля смен взгляда", description: "Среди профилей, у которых есть прошлая неделя, доля тех, где настрой, горизонт, темы или явная смена отличаются.", caveat: PROFILE_CAVEAT, minN: 30, format: "pct", higherBetter: null },
];

METRICS.push(...PROFILE_METRICS);

const SENTIMENT_CAVEAT = "Веса каналов равные и равны 1. Вес по результатам тестера не применяется. Реклама не входит. Почти одинаковые тексты считаются одним голосом, поэтому рядом с числом каналов есть effective n. Пока каналов меньше 5 или сообщений меньше 30, статус — мало данных.";

const SENTIMENT_METRICS: MetricDefinition[] = [
  { key: "sentiment_coverage", group: "F", title: "Сообщений в сентименте", description: "Число сообщений в последнем рыночном снимке. Число каналов видно в карточке независимых каналов.", caveat: SENTIMENT_CAVEAT, minN: 30, format: "count", higherBetter: null },
  { key: "effective_n_channels", group: "F", title: "Независимые каналы", description: "Число голосов после склейки репостов и почти-копий. n — каналы до склейки.", caveat: SENTIMENT_CAVEAT, minN: 5, format: "num", higherBetter: null },
  { key: "dispersion", group: "F", title: "Разброс каналов", description: "Стандартное отклонение счетов каналов в последнем рыночном снимке. Малый разброс значит, что каналы согласны.", caveat: SENTIMENT_CAVEAT, minN: 5, format: "num", higherBetter: null },
  { key: "overheated", group: "F", title: "Перегрев", description: "1, если доля каналов со счётом выше 0.5 не меньше 0.7 и разброс не больше 0.25. Иначе 0.", caveat: SENTIMENT_CAVEAT, minN: 5, format: "num", higherBetter: null },
  { key: "ad_excluded_share", group: "F", title: "Доля исключённой рекламы", description: "Доля разборов, помеченных рекламой и поэтому не вошедших в сентимент.", caveat: SENTIMENT_CAVEAT, minN: 30, format: "pct", higherBetter: null },
  { key: "coordinated_mention_flags", group: "F", title: "Флаги согласованных упоминаний", description: "Сколько раз малоизвестную монету за час назвали не меньше трёх каналов. BTC, ETH, SOL, BNB и XRP не считаются.", caveat: SENTIMENT_CAVEAT, minN: 3, format: "count", higherBetter: null },
  { key: "stability", group: "F", title: "Дневной сдвиг", description: "Модуль разницы рыночного счёта с предыдущим днём. Большой сдвиг без новых сообщений подозрителен.", caveat: SENTIMENT_CAVEAT, minN: 5, format: "num", higherBetter: null },
];

METRICS.push(...SENTIMENT_METRICS);

export type Thresholds = {
  assumptions: string;
  ingestLagWarnMin: number;
  ingestLagBadMin: number;
  minNGlobal: number;
  minNSlice: number;
  signalPrecisionMin: number;
  signalRecallMin: number;
  typeAccuracyMin: number;
  lowConfidence: number;
  minLabels: number;
  queueWarn: number;
  queueBad: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  assumptions: "начальные, подберите по данным",
  ingestLagWarnMin: 30,
  ingestLagBadMin: 120,
  minNGlobal: 100,
  minNSlice: 30,
  signalPrecisionMin: 0.7,
  signalRecallMin: 0.5,
  typeAccuracyMin: 0.8,
  lowConfidence: 0.45,
  minLabels: 100,
  queueWarn: 10,
  queueBad: 100,
};

export type MetricDraft = {
  metricKey: string;
  scopeType: string;
  scopeKey: string;
  value: number | null;
  n: number;
  ciLow: number | null;
  ciHigh: number | null;
  status: MetricStatus;
};

export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function bootstrapMean(values: number[], iterations = 400): { low: number; high: number } | null {
  if (values.length < 2) return null;
  let seed = 2166136261;
  for (const value of values) {
    seed ^= Math.round(value * 1000);
    seed = Math.imul(seed, 16777619);
  }
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) sum += values[Math.floor(next() * values.length)] ?? 0;
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return {
    low: means[Math.floor(0.025 * (iterations - 1))] ?? means[0] ?? 0,
    high: means[Math.ceil(0.975 * (iterations - 1))] ?? means[means.length - 1] ?? 0,
  };
}

function shareDraft(key: string, successes: number, n: number, scopeType: string, scopeKey: string): MetricDraft {
  const ci = wilsonInterval(successes, n);
  return {
    metricKey: key,
    scopeType,
    scopeKey,
    value: n > 0 ? successes / n : null,
    n,
    ciLow: ci?.low ?? null,
    ciHigh: ci?.high ?? null,
    status: n >= 30 ? "ok" : "insufficient_data",
  };
}

function proportion(
  key: string,
  successes: number,
  n: number,
  minN: number,
  higherBetter: boolean,
  okAt: number,
): MetricDraft {
  const ci = wilsonInterval(successes, n);
  const value = n > 0 ? successes / n : null;
  let status: MetricStatus = "insufficient_data";
  if (n >= minN && value != null) {
    const good = higherBetter ? value >= okAt : value <= okAt;
    const mid = higherBetter ? value >= okAt - 0.1 : value <= okAt + 0.1;
    status = good ? "ok" : mid ? "warn" : "bad";
  }
  return { metricKey: key, scopeType: "global", scopeKey: "", value, n, ciLow: ci?.low ?? null, ciHigh: ci?.high ?? null, status };
}

function fieldErrorsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function confidenceOf(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object" || !("confidence" in parsed)) return null;
  const value = (parsed as { confidence?: unknown }).confidence;
  return typeof value === "number" ? value : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? null;
}

export async function collectMetrics(prisma: PrismaClient, thresholds: Thresholds): Promise<MetricDraft[]> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const channels = await prisma.channel.findMany({
    include: {
      ingest: true,
      messages: { orderBy: { postedAt: "desc" }, take: 1, select: { postedAt: true } },
    },
  });
  const drafts: MetricDraft[] = [];
  const lags: number[] = [];
  for (const channel of channels) {
    const posted = channel.messages[0]?.postedAt;
    if (!posted) continue;
    const lag = (now - posted.getTime()) / 60000;
    lags.push(lag);
    const status: MetricStatus = lag > thresholds.ingestLagBadMin ? "bad" : lag > thresholds.ingestLagWarnMin ? "warn" : "ok";
    drafts.push({
      metricKey: "ingest_lag_min",
      scopeType: "channel",
      scopeKey: channel.username,
      value: lag,
      n: 1,
      ciLow: null,
      ciHigh: null,
      status,
    });
  }
  const worst = lags.length ? Math.max(...lags) : null;
  drafts.push({
    metricKey: "ingest_lag_min",
    scopeType: "global",
    scopeKey: "",
    value: worst,
    n: lags.length,
    ciLow: null,
    ciHigh: null,
    status: lags.length === 0 ? "insufficient_data" : worst != null && worst > thresholds.ingestLagBadMin ? "bad" : worst != null && worst > thresholds.ingestLagWarnMin ? "warn" : "ok",
  });

  const daily: number[] = [];
  for (let day = 7; day >= 1; day -= 1) {
    const from = new Date(now - (day + 1) * 24 * 60 * 60 * 1000);
    const to = new Date(now - day * 24 * 60 * 60 * 1000);
    daily.push(await prisma.message.count({ where: { postedAt: { gte: from, lt: to } } }));
  }
  const today = await prisma.message.count({ where: { postedAt: { gte: dayAgo } } });
  const baseline = median(daily);
  drafts.push({
    metricKey: "messages_per_day",
    scopeType: "global",
    scopeKey: "",
    value: today,
    n: today,
    ciLow: null,
    ciHigh: null,
    status: channels.length === 0 ? "insufficient_data" : baseline != null && baseline > 0 && (today > baseline * 3 || today < baseline / 3) ? "warn" : "ok",
  });

  const errors = channels.filter((channel) => channel.ingest?.lastError).length;
  drafts.push({
    metricKey: "ingest_errors_24h",
    scopeType: "global",
    scopeKey: "",
    value: errors,
    n: channels.length,
    ciLow: null,
    ciHigh: null,
    status: channels.length === 0 ? "insufficient_data" : errors > 0 ? "warn" : "ok",
  });
  const floods = channels.filter((channel) => {
    const until = channel.ingest?.floodWaitUntil;
    return until != null && until.getTime() > now - 24 * 60 * 60 * 1000;
  }).length;
  drafts.push({
    metricKey: "floodwait_events_24h",
    scopeType: "global",
    scopeKey: "",
    value: floods,
    n: channels.length,
    ciLow: null,
    ciHigh: null,
    status: channels.length === 0 ? "insufficient_data" : floods > 0 ? "warn" : "ok",
  });

  const messageCount = await prisma.message.count();
  const deleted = await prisma.message.count({ where: { isDeleted: true } });
  const edited = await prisma.message.count({
    where: { OR: [{ editedBeforeIngest: true }, { versions: { some: { version: { gt: 1 } } } }] },
  });
  drafts.push(proportion("deleted_detected_share", deleted, messageCount, 30, false, 0.2));
  drafts.push(proportion("edited_share", edited, messageCount, 30, false, 0.3));

  const prompt = await prisma.promptVersion.findFirst({ where: { name: "extract", isActive: true }, orderBy: { version: "desc" } });
  const versionCount = await prisma.messageVersion.count();
  const pending = await prisma.messageVersion.count({
    where: { extractions: { none: prompt ? { promptVersionId: prompt.id } : {} } },
  });
  drafts.push({
    metricKey: "extract_queue_depth",
    scopeType: "global",
    scopeKey: "",
    value: pending,
    n: versionCount,
    ciLow: null,
    ciHigh: null,
    status: pending >= thresholds.queueBad ? "bad" : pending >= thresholds.queueWarn ? "warn" : "ok",
  });

  const extractions = await prisma.extraction.findMany({
    select: {
      schemaValid: true,
      evidenceValid: true,
      msgType: true,
      parsedJson: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      createdAt: true,
    },
  });
  const invalid = extractions.filter((row) => !row.schemaValid).length;
  drafts.push(proportion("extract_failure_rate", invalid, extractions.length, 30, false, 0.05));
  drafts.push(proportion("schema_valid_rate", extractions.filter((row) => row.schemaValid).length, extractions.length, 30, true, 0.95));
  drafts.push(proportion("evidence_valid_rate", extractions.filter((row) => row.evidenceValid).length, extractions.length, 30, true, 0.9));
  const low = extractions.filter((row) => {
    const confidence = confidenceOf(row.parsedJson);
    return confidence != null && confidence < thresholds.lowConfidence;
  }).length;
  drafts.push(proportion("low_confidence_share", low, extractions.length, 30, false, 0.25));

  const coinRows = await prisma.extractionCoin.findMany({ select: { resolveStatus: true } });
  drafts.push(proportion("coin_unknown_share", coinRows.filter((row) => row.resolveStatus === "unknown").length, coinRows.length, 30, false, 0.2));
  drafts.push(proportion("coin_ambiguous_share", coinRows.filter((row) => row.resolveStatus === "ambiguous").length, coinRows.length, 30, false, 0.05));

  const labels = await prisma.labelRecord.findMany({
    include: { extraction: { select: { msgType: true } } },
  });
  const typeOk = labels.filter((label) => !fieldErrorsOf(label.fieldErrors).includes("msgType")).length;
  drafts.push(proportion("type_accuracy", typeOk, labels.length, thresholds.minNGlobal, true, thresholds.typeAccuracyMin));
  const predictedSignals = labels.filter((label) => label.extraction.msgType === "signal");
  const precise = predictedSignals.filter((label) => !fieldErrorsOf(label.fieldErrors).includes("msgType")).length;
  drafts.push(proportion("signal_precision", precise, predictedSignals.length, thresholds.minNGlobal, true, thresholds.signalPrecisionMin));
  const realSignals = labels.filter((label) => label.missedSignal || (label.extraction.msgType === "signal" && !fieldErrorsOf(label.fieldErrors).includes("msgType")));
  const found = realSignals.filter((label) => label.extraction.msgType === "signal" && !fieldErrorsOf(label.fieldErrors).includes("msgType")).length;
  drafts.push(proportion("signal_recall", found, realSignals.length, thresholds.minNGlobal, true, thresholds.signalRecallMin));
  for (const field of ["direction", "entry", "stop", "targets", "horizon", "coin"] as const) {
    const ok = labels.filter((label) => !fieldErrorsOf(label.fieldErrors).includes(field)).length;
    drafts.push(proportion(`field_accuracy_${field}`, ok, labels.length, thresholds.minNGlobal, true, 0.8));
  }
  const coinOk = labels.filter((label) => !fieldErrorsOf(label.fieldErrors).includes("coin")).length;
  drafts.push(proportion("coin_resolution_accuracy", coinOk, labels.length, thresholds.minNGlobal, true, 0.8));
  drafts.push({
    metricKey: "gold_set_size",
    scopeType: "global",
    scopeKey: "",
    value: labels.length,
    n: labels.length,
    ciLow: null,
    ciHigh: null,
    status: labels.length >= thresholds.minLabels ? "ok" : "insufficient_data",
  });

  const dayCosts = extractions.filter((row) => row.createdAt >= dayAgo);
  const daySum = dayCosts.reduce((sum, row) => sum + row.costUsd, 0);
  drafts.push({
    metricKey: "cost_per_day",
    scopeType: "global",
    scopeKey: "",
    value: dayCosts.length > 0 ? daySum : null,
    n: dayCosts.length,
    ciLow: null,
    ciHigh: null,
    status: dayCosts.length > 0 ? "ok" : "insufficient_data",
  });
  const costs = extractions.map((row) => row.costUsd);
  const mean = costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : null;
  const boot = bootstrapMean(costs);
  drafts.push({
    metricKey: "cost_per_message",
    scopeType: "global",
    scopeKey: "",
    value: mean,
    n: costs.length,
    ciLow: boot?.low ?? null,
    ciHigh: boot?.high ?? null,
    status: costs.length >= 2 ? "ok" : "insufficient_data",
  });
  const signals = extractions.filter((row) => row.schemaValid && row.msgType === "signal").length;
  const totalCost = costs.reduce((sum, value) => sum + value, 0);
  drafts.push({
    metricKey: "cost_per_extracted_signal",
    scopeType: "global",
    scopeKey: "",
    value: signals > 0 ? totalCost / signals : null,
    n: signals,
    ciLow: null,
    ciHigh: null,
    status: signals > 0 ? "ok" : "insufficient_data",
  });
  drafts.push({
    metricKey: "tokens_in_total",
    scopeType: "global",
    scopeKey: "",
    value: extractions.length > 0 ? extractions.reduce((sum, row) => sum + row.tokensIn, 0) : null,
    n: extractions.length,
    ciLow: null,
    ciHigh: null,
    status: extractions.length > 0 ? "ok" : "insufficient_data",
  });
  const calls = await prisma.call.findMany({ select: { status: true, untestableReason: true, channelId: true } });
  const testable = calls.filter((call) => call.status !== "untestable" && !call.untestableReason).length;
  drafts.push(proportion("testable_share", testable, calls.length, 30, true, 0.5));
  const mentioned = await prisma.extractionCoin.findMany({
    select: { resolveStatus: true, coin: { select: { binanceSymbol: true, coingeckoId: true } } },
  });
  const covered = mentioned.filter((row) => row.resolveStatus === "resolved" && (row.coin?.binanceSymbol || row.coin?.coingeckoId)).length;
  drafts.push(proportion("coin_price_coverage", covered, mentioned.length, 30, true, 0.8));
  const adMessages = await prisma.message.count({
    where: { versions: { some: { extractions: { some: { isAd: true } } } } },
  });
  drafts.push(shareDraft("ad_share", adMessages, messageCount, "global", ""));
  const backfilled = await prisma.message.count({ where: { backfilled: true } });
  drafts.push(shareDraft("backfilled_share", backfilled, messageCount, "global", ""));
  const channelsForShare = await prisma.channel.findMany({
    select: {
      id: true,
      username: true,
      _count: { select: { messages: true } },
    },
  });
  for (const channel of channelsForShare) {
    const channelAds = await prisma.message.count({
      where: { channelId: channel.id, versions: { some: { extractions: { some: { isAd: true } } } } },
    });
    const channelBackfill = await prisma.message.count({ where: { channelId: channel.id, backfilled: true } });
    drafts.push(shareDraft("ad_share", channelAds, channel._count.messages, "channel", channel.username));
    drafts.push(shareDraft("backfilled_share", channelBackfill, channel._count.messages, "channel", channel.username));
  }

  drafts.push({
    metricKey: "tokens_out_total",
    scopeType: "global",
    scopeKey: "",
    value: extractions.length > 0 ? extractions.reduce((sum, row) => sum + row.tokensOut, 0) : null,
    n: extractions.length,
    ciLow: null,
    ciHigh: null,
    status: extractions.length > 0 ? "ok" : "insufficient_data",
  });
  const evaluations = await prisma.callEvaluation.findMany({
    orderBy: { createdAt: "desc" },
    include: { call: { select: { openedAt: true, coinId: true, horizon: true } } },
  });
  const seen = new Set<string>();
  const latest = evaluations.filter((row) => {
    if (seen.has(row.callId)) return false;
    seen.add(row.callId);
    return true;
  });
  const coinIds = [...new Set(latest.map((row) => row.call.coinId))];
  const snapshots = coinIds.length
    ? await prisma.priceSnapshot.findMany({
      where: { source: "binance", coinId: { in: coinIds } },
      orderBy: { ts: "asc" },
      select: { coinId: true, ts: true, price: true },
    })
    : [];
  drafts.push(...resultDrafts(latest, "", earlyRanks(latest, snapshots)));
  for (const horizon of ["days", "weeks", "months"] as const) {
    drafts.push(...resultDrafts(latest.filter((row) => row.call.horizon === horizon), horizon, { value: null, n: 0 }));
  }
  drafts.push(...(await profileDrafts(prisma, now)));
  drafts.push(...(await sentimentDrafts(prisma)));
  return drafts;
}

async function sentimentDrafts(prisma: PrismaClient): Promise<MetricDraft[]> {
  const market = await prisma.sentimentSnapshot.findMany({ where: { scope: "market" }, orderBy: { date: "desc" } });
  const latest = market[0] ?? null;
  const previous = market[1] ?? null;
  const enough = (latest?.nChannels ?? 0) >= 5 && (latest?.nMessages ?? 0) >= 30;
  const sample = (key: string, value: number | null, n: number): MetricDraft => ({
    metricKey: key,
    scopeType: "global",
    scopeKey: "",
    value,
    n,
    ciLow: null,
    ciHigh: null,
    status: enough && n > 0 ? "ok" : "insufficient_data",
  });
  const flags = market.reduce((sum, row) => {
    const details = row.detailsJson && typeof row.detailsJson === "object" && "coordinated" in row.detailsJson ? row.detailsJson.coordinated : [];
    return sum + (Array.isArray(details) ? details.length : 0);
  }, 0);
  const ads = await prisma.extraction.count({ where: { isAd: true } });
  const parsed = await prisma.extraction.count({ where: { schemaValid: true } });
  const shift = latest && previous ? Math.abs(latest.score - previous.score) : null;
  const suspicious = Boolean(latest && previous && shift != null && shift > 0.4 && latest.nMessages <= previous.nMessages);
  return [
    sample("sentiment_coverage", latest?.nMessages ?? null, latest?.nMessages ?? 0),
    sample("effective_n_channels", latest?.effectiveNChannels ?? null, latest?.nChannels ?? 0),
    sample("dispersion", latest?.dispersion ?? null, latest?.nChannels ?? 0),
    sample("overheated", latest ? (latest.overheated ? 1 : 0) : null, latest?.nChannels ?? 0),
    { ...shareDraft("ad_excluded_share", ads, parsed, "global", ""), status: parsed >= 30 ? "ok" : "insufficient_data" },
    {
      metricKey: "coordinated_mention_flags",
      scopeType: "global",
      scopeKey: "",
      value: flags,
      n: latest?.nChannels ?? 0,
      ciLow: null,
      ciHigh: null,
      status: (latest?.nChannels ?? 0) >= 3 ? "ok" : "insufficient_data",
    },
    {
      metricKey: "stability",
      scopeType: "global",
      scopeKey: "",
      value: shift,
      n: latest?.nChannels ?? 0,
      ciLow: null,
      ciHigh: null,
      status: !enough || shift == null ? "insufficient_data" : suspicious ? "warn" : "ok",
    },
  ];
}

function profileStats(value: unknown): { claims: number; kept: number } {
  if (!value || typeof value !== "object" || !("stats" in value)) return { claims: 0, kept: 0 };
  const stats = (value as { stats?: { claims?: unknown; kept?: unknown } }).stats;
  return {
    claims: typeof stats?.claims === "number" ? stats.claims : 0,
    kept: typeof stats?.kept === "number" ? stats.kept : 0,
  };
}

function profileChanged(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "changed" in value && (value as { changed?: unknown }).changed === true);
}

async function profileDrafts(prisma: PrismaClient, now: number): Promise<MetricDraft[]> {
  const profiles = await prisma.channelProfile.findMany({
    orderBy: { weekStart: "desc" },
    include: { channel: { select: { username: true } } },
  });
  const claims = profiles.reduce((sum, row) => sum + profileStats(row.profileJson).claims, 0);
  const kept = profiles.reduce((sum, row) => sum + profileStats(row.profileJson).kept, 0);
  const evidence = proportion("profile_evidence_valid_rate", kept, claims, 30, true, 0.8);
  const latestByChannel = new Map<string, { username: string; createdAt: Date }>();
  for (const row of profiles) {
    if (!latestByChannel.has(row.channelId)) latestByChannel.set(row.channelId, { username: row.channel.username, createdAt: row.createdAt });
  }
  const ages = [...latestByChannel.values()].map((row) => ({ ...row, days: (now - row.createdAt.getTime()) / 86_400_000 }));
  const worst = ages.reduce((max, row) => Math.max(max, row.days), 0);
  const freshness: MetricDraft = {
    metricKey: "profile_freshness_days",
    scopeType: "global",
    scopeKey: "",
    value: ages.length ? worst : null,
    n: ages.length,
    ciLow: null,
    ciHigh: null,
    status: ages.length > 0 ? "ok" : "insufficient_data",
  };
  const comparable = profiles.filter((row) => row.diffFromPrevJson != null);
  const changes = comparable.filter((row) => profileChanged(row.diffFromPrevJson)).length;
  const change = shareDraft("profile_change_flag", changes, comparable.length, "global", "");
  const perChannel = ages.map((row) => ({
    metricKey: "profile_freshness_days",
    scopeType: "channel",
    scopeKey: row.username,
    value: row.days,
    n: 1,
    ciLow: null,
    ciHigh: null,
    status: "ok" as const,
  }));
  return [evidence, freshness, { ...change, status: comparable.length >= 30 ? "ok" : "insufficient_data" }, ...perChannel];
}

type EvalRow = {
  status: string;
  returnPct: number | null;
  rMultiple: number | null;
  btcReturnPct: number | null;
  coinHoldReturnPct: number | null;
  entryFilledAt: Date | null;
  exitAt: Date | null;
  checkpoints: unknown;
  call: { openedAt: Date; coinId: string; horizon: string };
};

function sampleStatus(n: number): MetricStatus {
  return n >= 30 ? "ok" : "insufficient_data";
}

function resultDrafts(rows: EvalRow[], scopeKey: string, rank: { value: number | null; n: number }): MetricDraft[] {
  const scopeType = scopeKey ? "horizon" : "global";
  const closed = rows.filter((row) => row.status === "closed" && row.returnPct != null);
  const wins = closed.filter((row) => (row.returnPct ?? 0) > 0).length;
  const triggered = rows.filter((row) => row.status === "not_triggered").length;
  const open = rows.filter((row) => row.status === "open").length;
  const returns = closed.map((row) => (row.returnPct ?? 0) / 100);
  const rs = closed.map((row) => row.rMultiple).filter((value): value is number => value != null);
  const losses = returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  const gain = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const row of [...closed].sort((a, b) => (a.exitAt?.getTime() ?? 0) - (b.exitAt?.getTime() ?? 0))) {
    equity += (row.returnPct ?? 0) / 100;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  const excessBtc = closed.map((row) => (row.btcReturnPct == null || row.returnPct == null ? null : (row.returnPct - row.btcReturnPct) / 100)).filter((value): value is number => value != null);
  const excessHold = closed.map((row) => (row.coinHoldReturnPct == null || row.returnPct == null ? null : (row.returnPct - row.coinHoldReturnPct) / 100)).filter((value): value is number => value != null);
  const minutes = closed
    .map((row) => (row.entryFilledAt && row.exitAt ? (row.exitAt.getTime() - row.entryFilledAt.getTime()) / 60000 : null))
    .filter((value): value is number => value != null);
  let correct = 0;
  let pointed = 0;
  for (const row of rows) {
    const point = checkpointOf(row.checkpoints);
    if (!point) continue;
    pointed += 1;
    if (point.correct) correct += 1;
  }
  const winCi = wilsonInterval(wins, closed.length);
  const triggerCi = wilsonInterval(triggered, triggered + closed.length);
  const directionCi = wilsonInterval(correct, pointed);
  const rCi = bootstrapMean(rs);
  const minuteCi = bootstrapMean(minutes);
  const btcCi = bootstrapMean(excessBtc);
  const holdCi = bootstrapMean(excessHold);
  const draft = (key: string, value: number | null, n: number, ciLow: number | null, ciHigh: number | null): MetricDraft => ({
    metricKey: key,
    scopeType,
    scopeKey,
    value,
    n,
    ciLow,
    ciHigh,
    status: sampleStatus(n),
  });
  return [
    draft("closed_calls_n", closed.length, closed.length, null, null),
    draft("not_triggered_share", triggered + closed.length > 0 ? triggered / (triggered + closed.length) : null, triggered + closed.length, triggerCi?.low ?? null, triggerCi?.high ?? null),
    draft("open_calls_n", open, open, null, null),
    draft("win_rate", closed.length > 0 ? wins / closed.length : null, closed.length, winCi?.low ?? null, winCi?.high ?? null),
    draft("avg_r_multiple", rs.length ? rs.reduce((sum, value) => sum + value, 0) / rs.length : null, rs.length, rCi?.low ?? null, rCi?.high ?? null),
    draft("median_return", median(returns), returns.length, null, null),
    draft("profit_factor", losses < 0 ? gain / Math.abs(losses) : null, closed.length, null, null),
    draft("max_drawdown", closed.length ? drawdown : null, closed.length, null, null),
    draft("excess_vs_btc", excessBtc.length ? excessBtc.reduce((sum, value) => sum + value, 0) / excessBtc.length : null, excessBtc.length, btcCi?.low ?? null, btcCi?.high ?? null),
    draft("excess_vs_coin_hold", excessHold.length ? excessHold.reduce((sum, value) => sum + value, 0) / excessHold.length : null, excessHold.length, holdCi?.low ?? null, holdCi?.high ?? null),
    draft("direction_accuracy", pointed > 0 ? correct / pointed : null, pointed, directionCi?.low ?? null, directionCi?.high ?? null),
    draft("time_to_result", minutes.length ? minutes.reduce((sum, value) => sum + value, 0) / minutes.length : null, minutes.length, minuteCi?.low ?? null, minuteCi?.high ?? null),
    draft("early_mention_rank", scopeKey ? null : rank.value, scopeKey ? 0 : rank.n, null, null),
  ];
}

function checkpointOf(value: unknown): { correct: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { "7d"?: { correct?: boolean }; "1d"?: { correct?: boolean } };
  const point = record["7d"] ?? record["1d"];
  return point && typeof point.correct === "boolean" ? { correct: point.correct } : null;
}

function earlyRanks(rows: EvalRow[], snapshots: Array<{ coinId: string; ts: Date; price: number }>): { value: number | null; n: number } {
  const byCoin = new Map<string, EvalRow[]>();
  for (const row of rows) {
    const list = byCoin.get(row.call.coinId) ?? [];
    list.push(row);
    byCoin.set(row.call.coinId, list);
  }
  const ranks: number[] = [];
  for (const [coinId, calls] of byCoin) {
    const ordered = [...calls].sort((a, b) => a.call.openedAt.getTime() - b.call.openedAt.getTime());
    const first = ordered[0];
    if (!first) continue;
    const prices = snapshots.filter((item) => item.coinId === coinId && item.ts.getTime() >= first.call.openedAt.getTime());
    const base = prices[0]?.price;
    if (base == null) continue;
    const grew = prices.find((item) => item.price >= base * 1.1);
    if (!grew) continue;
    const before = ordered.filter((row) => row.call.openedAt.getTime() <= grew.ts.getTime());
    before.forEach((_, index) => ranks.push(index + 1));
  }
  if (ranks.length === 0) return { value: null, n: 0 };
  return { value: ranks.reduce((sum, value) => sum + value, 0) / ranks.length, n: ranks.length };
}

export async function storeMetrics(prisma: PrismaClient, paramSetId: string | null): Promise<MetricDraft[]> {
  const thresholds = DEFAULT_THRESHOLDS;
  const drafts = await collectMetrics(prisma, thresholds);
  await prisma.metricSnapshot.createMany({
    data: drafts.map((draft) => ({ ...draft, paramSetId })),
  });
  return drafts;
}
