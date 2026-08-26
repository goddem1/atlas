import { useCallback, useEffect, useMemo, useState } from "react";
import { TELEGRAM_NEWS_WIDGET_CATEGORIES } from "@atlas-v1/shared";
import {
  fetchNewsFeedbackCandidates,
  fetchNewsFeedbackPriceHint,
  resolveNewsFeedbackMskDay,
  saveNewsFeedback,
  type NewsFeedbackCandidate,
  type NewsFeedbackCandidatesResponse,
} from "../../services/api";
import { tagFromCategory, type NewsTagId } from "../../components/widgets/news/newsClassify";
import "./news-feedback-review.css";

type CardFormState = {
  humanNote: string;
  humanWeight: string;
  humanPolarity: string;
  humanType: string;
  humanCorrect: "" | "true" | "false";
};

function defaultForm(item: NewsFeedbackCandidate): CardFormState {
  const fb = item.feedback;
  return {
    humanNote: fb?.humanNote ?? "",
    humanWeight: fb?.humanWeight != null ? String(fb.humanWeight) : "",
    humanPolarity: fb?.humanPolarity != null ? String(fb.humanPolarity) : "",
    humanType: fb?.humanType ?? "",
    humanCorrect:
      fb?.humanCorrect === true ? "true" : fb?.humanCorrect === false ? "false" : "",
  };
}

function parseOptionalInt(raw: string): number | undefined {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

const FEEDBACK_FIELD_HINTS = {
  weight:
    "Важность для рынка (1–5). 1 — локальная новость, 5 — системный шок. Сомневаешься — ставь меньше.",
  polarity:
    "Знак влияния: −1 негатив, 0 нейтрал, +1 позитив. Только знак — силу задаёт w, не «подкручивай» p.",
  type:
    "Тип: moved — уже двинула цену; will_move — событие впереди; narrative — меняет sentiment без мгновенного движения.",
  llmCorrect:
    "Согласен ли с оценкой LLM по этой новости (w, p, t, категория)? «Нет» — укажи правильные значения выше.",
} as const;

function FeedbackCard({
  item,
  day,
  onSaved,
}: {
  item: NewsFeedbackCandidate;
  day: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CardFormState>(() => defaultForm(item));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [priceHint, setPriceHint] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  useEffect(() => {
    setForm(defaultForm(item));
    setErr(null);
    setPriceHint(null);
  }, [item]);

  const tag = tagFromCategory((item.llmCategory as NewsTagId | null) ?? null);

  const loadPriceHint = useCallback(async () => {
    setPriceLoading(true);
    setErr(null);
    try {
      const hint = await fetchNewsFeedbackPriceHint(item.date);
      const parts: string[] = [];
      if (hint.priceMoveBtc != null) {
        parts.push(
          `BTC ${hint.priceMoveBtc > 0 ? "+" : ""}${hint.priceMoveBtc.toFixed(2)}% за ${hint.priceMoveWindowHours}ч`,
        );
      }
      if (hint.priceMoveEth != null) {
        parts.push(
          `ETH ${hint.priceMoveEth > 0 ? "+" : ""}${hint.priceMoveEth.toFixed(2)}% за ${hint.priceMoveWindowHours}ч`,
        );
      }
      setPriceHint(parts.length > 0 ? parts.join(" · ") : "Нет данных по свечам");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить движение цены");
    } finally {
      setPriceLoading(false);
    }
  }, [item.date]);

  const save = useCallback(async () => {
    if (!form.humanNote.trim()) {
      setErr("Комментарий обязателен");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveNewsFeedback({
        postKey: item.postKey,
        day,
        postText: item.text,
        postTimestamp: item.date,
        source: item.source,
        llmType: item.llmType ?? undefined,
        llmCategory: item.llmCategory ?? undefined,
        llmHeadline: item.llmHeadline ?? undefined,
        llmWeight: item.llmWeight ?? undefined,
        llmPolarity: item.llmPolarity ?? undefined,
        humanNote: form.humanNote.trim(),
        humanWeight: parseOptionalInt(form.humanWeight),
        humanPolarity: parseOptionalInt(form.humanPolarity),
        humanType: form.humanType || undefined,
        humanCorrect:
          form.humanCorrect === "true" ? true : form.humanCorrect === "false" ? false : undefined,
      });
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }, [day, form, item, onSaved]);

  return (
    <article className="atlas-glass news-feedback-card">
      <div className="news-feedback-card-head">
        <span className="news-feedback-tag" style={{ backgroundColor: tag.color }}>
          {tag.label}
        </span>
        <div className="news-feedback-card-main">
          <p className="news-feedback-channel">
            @{item.channelUsername} · {new Date(item.date).toLocaleString("ru-RU")}
            {item.hasFeedback ? <span className="news-feedback-badge">есть фидбек</span> : null}
          </p>
          <p className="news-feedback-text">{item.llmHeadline ?? item.text}</p>
          {item.source === "top5" ? (
            <p className="news-feedback-llm">
              LLM: t={item.llmType ?? "—"} · cat={item.llmCategory ?? "—"}
              {item.llmWhy ? ` · ${item.llmWhy}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="news-feedback-form">
        <div className="news-feedback-row">
          <div className="news-feedback-field">
            <label htmlFor={`w-${item.postKey}`} title={FEEDBACK_FIELD_HINTS.weight}>
              w (1–5)
            </label>
            <span className="news-feedback-field-hint">{FEEDBACK_FIELD_HINTS.weight}</span>
            <input
              id={`w-${item.postKey}`}
              type="number"
              min={1}
              max={5}
              value={form.humanWeight}
              onChange={(e) => setForm((s) => ({ ...s, humanWeight: e.target.value }))}
            />
          </div>
          <div className="news-feedback-field">
            <label htmlFor={`p-${item.postKey}`} title={FEEDBACK_FIELD_HINTS.polarity}>
              p (−1/0/+1)
            </label>
            <span className="news-feedback-field-hint">{FEEDBACK_FIELD_HINTS.polarity}</span>
            <input
              id={`p-${item.postKey}`}
              type="number"
              min={-1}
              max={1}
              value={form.humanPolarity}
              onChange={(e) => setForm((s) => ({ ...s, humanPolarity: e.target.value }))}
            />
          </div>
          <div className="news-feedback-field">
            <label htmlFor={`t-${item.postKey}`} title={FEEDBACK_FIELD_HINTS.type}>
              t (тип)
            </label>
            <span className="news-feedback-field-hint">{FEEDBACK_FIELD_HINTS.type}</span>
            <select
              id={`t-${item.postKey}`}
              value={form.humanType}
              onChange={(e) => setForm((s) => ({ ...s, humanType: e.target.value }))}
            >
              <option value="">—</option>
              <option value="moved">moved — уже двинула</option>
              <option value="will_move">will_move — событие впереди</option>
              <option value="narrative">narrative — нарратив</option>
            </select>
          </div>
          <div className="news-feedback-field">
            <label htmlFor={`ok-${item.postKey}`} title={FEEDBACK_FIELD_HINTS.llmCorrect}>
              LLM верно?
            </label>
            <span className="news-feedback-field-hint">{FEEDBACK_FIELD_HINTS.llmCorrect}</span>
            <select
              id={`ok-${item.postKey}`}
              value={form.humanCorrect}
              onChange={(e) =>
                setForm((s) => ({ ...s, humanCorrect: e.target.value as CardFormState["humanCorrect"] }))
              }
            >
              <option value="">—</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </div>
        </div>

        <div className="news-feedback-field">
          <label htmlFor={`note-${item.postKey}`}>Комментарий автора</label>
          <textarea
            id={`note-${item.postKey}`}
            value={form.humanNote}
            onChange={(e) => setForm((s) => ({ ...s, humanNote: e.target.value }))}
            placeholder="Почему эта новость важна / неважна, как калибровать w и p…"
          />
        </div>

        <div className="news-feedback-actions">
          <button
            type="button"
            className="news-feedback-btn"
            onClick={() => void loadPriceHint()}
            disabled={priceLoading}
          >
            {priceLoading ? "Загрузка…" : "Показать движение цены"}
          </button>
          <button
            type="button"
            className="news-feedback-btn is-primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {priceHint ? <span className="news-feedback-price-hint">{priceHint}</span> : null}
        </div>

        {err ? <p className="news-feedback-msg news-feedback-msg--err">{err}</p> : null}
      </div>
    </article>
  );
}

export function NewsFeedbackReview() {
  const skipAuth = import.meta.env.DEV;
  const [day, setDay] = useState(() => resolveNewsFeedbackMskDay());
  const [data, setData] = useState<NewsFeedbackCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    void fetchNewsFeedbackCandidates(day)
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setErr(e instanceof Error ? e.message : "Не удалось загрузить кандидатов");
      })
      .finally(() => setLoading(false));
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryLegend = useMemo(
    () => Object.values(TELEGRAM_NEWS_WIDGET_CATEGORIES).map((c) => c.label).join(" · "),
    [],
  );

  return (
    <div className="news-feedback-page">
      <div className="news-feedback-shell">
        <header className="news-feedback-head">
          <h1 className="news-feedback-title">Разметка news-виджета</h1>
          <input
            className="news-feedback-day-input"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <button type="button" className="news-feedback-btn" onClick={load} disabled={loading}>
            Обновить
          </button>
        </header>

        <p className="news-feedback-meta">
          Категории: {categoryLegend}. Фидбек попадает в few-shot блок следующего LLM-расчёта (23:00 МСК).
          {skipAuth ? " Локальный режим: авторизация отключена." : null}
        </p>

        {loading ? <p className="news-feedback-msg">Загрузка…</p> : null}
        {err ? <p className="news-feedback-msg news-feedback-msg--err">{err}</p> : null}

        {data ? (
          <>
            <p className="news-feedback-meta">
              День <strong>{data.day}</strong> · сентимент{" "}
              <strong>{data.sentiment ?? "—"}%</strong> · кандидатов{" "}
              <strong>{data.candidateCount}</strong>
            </p>
            {data.formula ? <p className="news-feedback-meta">{data.formula}</p> : null}

            <h2 className="news-feedback-section-title">
              Топ-5 дня{data.top5.length > 0 ? ` (${data.top5.length})` : ""}
            </h2>
            {data.top5.length === 0 ? (
              <p className="news-feedback-msg">Нет топ-5 за выбранный день.</p>
            ) : (
              data.top5.map((item) => (
                <FeedbackCard key={item.postKey} item={item} day={data.day} onSaved={load} />
              ))
            )}

            <button
              type="button"
              className="news-feedback-btn news-feedback-toggle"
              onClick={() => setShowCandidates((v) => !v)}
            >
              {showCandidates ? "Скрыть остальные кандидаты" : `Показать все кандидаты (${data.candidates.length})`}
            </button>

            {showCandidates
              ? data.candidates.map((item) => (
                  <FeedbackCard key={item.postKey} item={item} day={data.day} onSaved={load} />
                ))
              : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
