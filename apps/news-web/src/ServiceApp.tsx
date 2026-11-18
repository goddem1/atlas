import { useCallback, useEffect, useState } from "react";
import { activatePrompt, evalPrompt, listCalls, listParams, listPrompts, listReviews, loadCall, loadChannelSummary, loadDigestView, loadMetrics, loadOverview, loadSentiment, nextLabel, recomputeMetrics, recomputeParams, refreshPrices, resolveReview, saveLabel, saveParams, savePrompt, type CallDetail, type CallRow, type ChannelSummary, type DigestView, type LabelItem, type MetricCard, type ParamRow, type PromptRow, type ReviewRow, type SentimentView } from "./api";

const DISCLAIMER = "Аналитика чужих мнений. Не инвестиционная рекомендация";

function titleFor(path: string): string {
  if (path.startsWith("/service/labels")) return "Разметка";
  if (path.startsWith("/service/signals")) return "Сигналы";
  if (path.startsWith("/service/channels")) return "Каналы";
  if (path.startsWith("/service/sentiment")) return "Сентимент";
  if (path.startsWith("/service/prompts")) return "Промпты";
  if (path.startsWith("/service/params")) return "Параметры";
  if (path.startsWith("/service/digest")) return "Дайджест";
  return "Обзор";
}
const FIELDS: Array<[string, string]> = [
  ["msgType", "тип"],
  ["direction", "направление"],
  ["entry", "вход"],
  ["stop", "стоп"],
  ["targets", "цели"],
  ["horizon", "горизонт"],
  ["coin", "монета"],
];

export function ServiceApp({ onLogout }: { onLogout: () => void }) {
  const path = window.location.pathname;
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">сервисное окно</p>
          <h1 className="mt-2 text-3xl font-semibold">{titleFor(path)}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{DISCLAIMER}</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <a className="rounded-xl border border-line px-3 py-2" href="/service">Обзор</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/signals">Сигналы</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/labels">Разметка</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/channels">Каналы</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/sentiment">Сентимент</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/prompts">Промпты</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/params">Параметры</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/service/digest">Дайджест</a>
          <a className="rounded-xl border border-line px-3 py-2" href="/">Список</a>
          <button className="rounded-xl border border-line px-3 py-2" type="button" onClick={onLogout}>Выйти</button>
        </nav>
      </header>
      {path.startsWith("/service/labels") ? <Labels onLogout={onLogout} /> : path.startsWith("/service/signals") ? <Signals onLogout={onLogout} /> : path.startsWith("/service/channels") ? <Channels onLogout={onLogout} /> : path.startsWith("/service/sentiment") ? <Sentiment onLogout={onLogout} /> : path.startsWith("/service/prompts") ? <Prompts onLogout={onLogout} /> : path.startsWith("/service/params") ? <Params onLogout={onLogout} /> : path.startsWith("/service/digest") ? <Digest onLogout={onLogout} /> : <Overview onLogout={onLogout} />}
    </main>
  );
}

function Overview({ onLogout }: { onLogout: () => void }) {
  const [assumptions, setAssumptions] = useState("");
  const [gates, setGates] = useState<Array<{ id: string; title: string; passed: boolean; detail: string }>>([]);
  const [features, setFeatures] = useState<Array<{ id: string; title: string; enabled: boolean; reason: string }>>([]);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    const [overview, catalog] = await Promise.all([loadOverview(), loadMetrics()]);
    setAssumptions(overview.assumptions);
    setGates(overview.gates);
    setFeatures(overview.features);
    setMetrics(catalog.metrics);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить обзор";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout, reload]);

  async function recompute() {
    setPending(true);
    setError("");
    try {
      await recomputeMetrics();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось пересчитать");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-amber-200">Пороги: {assumptions}</p>
        <button className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" type="button" disabled={pending} onClick={() => void recompute()}>
          {pending ? "Считаю…" : "Пересчитать метрики"}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {gates.map((gate) => (
          <article key={gate.id} className="rounded-2xl border border-line bg-panel p-4">
            <p className={gate.passed ? "text-emerald-300" : "text-amber-200"}>{gate.passed ? "Пройдено" : "Не пройдено"}</p>
            <h2 className="mt-1 font-medium">{gate.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{gate.detail}</p>
          </article>
        ))}
        {features.map((feature) => (
          <article key={feature.id} className="rounded-2xl border border-line bg-panel p-4">
            <p className={feature.enabled ? "text-emerald-300" : "text-slate-400"}>{feature.enabled ? "Включено" : "Выключено"}</p>
            <h2 className="mt-1 font-medium">{feature.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{feature.reason}</p>
          </article>
        ))}
      </div>
      {(["A", "B", "C", "D", "E", "F", "G"] as const).map((group) => (
        <div key={group}>
          <h2 className="text-lg font-medium">Группа {group}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {metrics.filter((metric) => metric.group === group).map((metric) => (
              <MetricView key={metric.key} metric={metric} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function MetricView({ metric }: { metric: MetricCard }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{metric.title}</h3>
        <span className={statusClass(metric.status)}>{statusLabel(metric.status)}</span>
      </div>
      <p className="mt-3 text-2xl">{formatMetric(metric)}</p>
      <p className="mt-1 text-sm text-slate-400">
        n={metric.n}
        {metric.minN > 0 ? `, минимум ${metric.minN}` : ""}
        {metric.ciLow != null && metric.ciHigh != null ? `, интервал ${formatPair(metric, metric.ciLow, metric.ciHigh)}` : ", интервал не считается"}
      </p>
      <Trend values={metric.trend} />
      <button className="mt-3 text-sm text-indigo-400" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Скрыть пояснение" : "Как считается и почему может врать"}
      </button>
      {open ? (
        <div className="mt-2 space-y-1 text-sm text-slate-300">
          <p>{metric.description}</p>
          <p className="text-slate-400">{metric.caveat}</p>
        </div>
      ) : null}
    </article>
  );
}

function Trend({ values }: { values: Array<number | null> }) {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min || 1;
  return (
    <div className="mt-3 flex h-8 items-end gap-1">
      {nums.map((value, index) => (
        <span key={index} className="w-2 rounded-sm bg-indigo-500" style={{ height: `${8 + ((value - min) / span) * 24}px` }} />
      ))}
    </div>
  );
}

function Labels({ onLogout }: { onLogout: () => void }) {
  const [item, setItem] = useState<LabelItem | null>(null);
  const [labeled, setLabeled] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [verdict, setVerdict] = useState<"correct" | "wrong" | "partial" | "">("");
  const [fields, setFields] = useState<string[]>([]);
  const [missed, setMissed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const next = await nextLabel();
    setItem(next.item);
    setLabeled(next.labeled);
    setRemaining(next.remaining);
    setVerdict("");
    setFields([]);
    setMissed(false);
    setNote("");
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось открыть очередь";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [load, onLogout]);

  const submit = useCallback(async () => {
    if (!item || !verdict) return;
    setError("");
    try {
      await saveLabel({ extractionId: item.extractionId, verdict, fieldErrors: fields, missedSignal: missed, note });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить разметку");
    }
  }, [fields, item, load, missed, note, verdict]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "1") setVerdict("correct");
      if (event.key === "2") setVerdict("wrong");
      if (event.key === "3") setVerdict("partial");
      if (event.key.toLowerCase() === "m") setMissed((value) => !value);
      if (event.key === "Enter") void submit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  const parsed = item?.parsed && typeof item.parsed === "object" ? (item.parsed as { evidence?: string }) : null;
  const evidence = typeof parsed?.evidence === "string" ? parsed.evidence : "";

  return (
    <section className="mt-8">
      <p className="text-sm text-slate-400">Размечено {labeled}. В очереди ещё {remaining}. Клавиши: 1 верно, 2 ошибка, 3 частично, M пропущен сигнал, Enter сохранить.</p>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {!item ? <p className="mt-6 text-slate-400">Очередь пуста. Сначала нужен сбор каналов, затем команда pnpm news:extract.</p> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-sm text-slate-400">@{item.username} · {new Date(item.postedAt).toLocaleString("ru-RU")}</p>
            {item.context.length > 0 ? <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-500">{item.context.join("\n---\n")}</pre> : null}
            {item.replyText ? <p className="mt-3 text-sm text-slate-400">Ответ на: {item.replyText}</p> : null}
            <p className="mt-4 whitespace-pre-wrap leading-6">{highlight(item.text, evidence, item.evidenceValid)}</p>
          </article>
          <article className="rounded-2xl border border-line bg-panel p-4">
            <p>Тип модели: {item.msgType ?? "нет"} · цитата {item.evidenceValid ? "дословная" : "не совпала"}{item.isAd ? " · реклама" : ""}</p>
            <ul className="mt-2 text-sm text-slate-300">
              {item.coins.map((coin) => (
                <li key={coin.rawMention}>{coin.rawMention}: {coin.status}{coin.symbol ? ` ${coin.symbol}` : ""}</li>
              ))}
            </ul>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(item.parsed, null, 2)}</pre>
            <div className="mt-4 flex gap-2">
              <Choice current={verdict} value="correct" onPick={setVerdict}>Верно</Choice>
              <Choice current={verdict} value="wrong" onPick={setVerdict}>Ошибка</Choice>
              <Choice current={verdict} value="partial" onPick={setVerdict}>Частично</Choice>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {FIELDS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={fields.includes(key) ? "rounded-full bg-rose-500/30 px-3 py-1 text-sm" : "rounded-full border border-line px-3 py-1 text-sm"}
                  onClick={() => setFields((current) => current.includes(key) ? current.filter((field) => field !== key) : [...current, key])}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={missed} onChange={(event) => setMissed(event.target.checked)} />
              Пропущен сигнал
            </label>
            <textarea className="mt-3 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Заметка" />
            <button className="mt-3 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" type="button" disabled={!verdict} onClick={() => void submit()}>
              Сохранить
            </button>
          </article>
        </div>
      )}
    </section>
  );
}

function Choice({ current, value, onPick, children }: { current: string; value: "correct" | "wrong" | "partial"; onPick: (value: "correct" | "wrong" | "partial") => void; children: string }) {
  return (
    <button type="button" className={current === value ? "rounded-xl bg-indigo-500 px-3 py-2 text-sm" : "rounded-xl border border-line px-3 py-2 text-sm"} onClick={() => onPick(value)}>
      {children}
    </button>
  );
}

function highlight(text: string, quote: string, valid: boolean) {
  if (!valid || !quote) return text;
  const index = text.indexOf(quote);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-indigo-500/40 text-inherit">{quote}</mark>
      {text.slice(index + quote.length)}
    </>
  );
}

function formatMetric(metric: MetricCard): string {
  if (metric.value == null) return "нет данных";
  if (metric.format === "pct") return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.format === "min") return `${Math.round(metric.value)} мин`;
  if (metric.format === "usd") return `$${metric.value.toFixed(4)}`;
  if (metric.format === "num") return metric.value.toFixed(2);
  return String(Math.round(metric.value));
}

function formatPair(metric: MetricCard, low: number, high: number): string {
  if (metric.format === "pct") return `${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}%`;
  if (metric.format === "usd") return `$${low.toFixed(4)}–${high.toFixed(4)}`;
  return `${low.toFixed(1)}–${high.toFixed(1)}`;
}

function statusLabel(status: MetricCard["status"]): string {
  if (status === "ok") return "ok";
  if (status === "warn") return "warn";
  if (status === "bad") return "bad";
  return "мало данных";
}

function Signals({ onLogout }: { onLogout: () => void }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [error, setError] = useState("");
  const [confirmWrong, setConfirmWrong] = useState(false);

  const reload = useCallback(async () => {
    const [nextCalls, nextReviews] = await Promise.all([listCalls(), listReviews()]);
    setCalls(nextCalls);
    setReviews(nextReviews);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить сигналы";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout, reload]);

  async function open(id: string) {
    setConfirmWrong(false);
    setError("");
    try {
      setDetail(await loadCall(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть вызов");
    }
  }

  async function attach(reviewId: string, callId: string) {
    setError("");
    try {
      await resolveReview(reviewId, callId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось привязать");
    }
  }

  async function markWrong() {
    if (!detail?.extractionId) return;
    setError("");
    try {
      await saveLabel({
        extractionId: detail.extractionId,
        verdict: "wrong",
        fieldErrors: ["msgType"],
        missedSignal: false,
        note: "со страницы сигналов",
      });
      setConfirmWrong(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить в разметку");
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <p className="text-sm text-slate-400">Цены подгружаются с Binance. Решение тестера появляется только после 100 разметок и достаточного precision.</p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <div>
        <h2 className="text-lg font-medium">На ручную проверку: {reviews.length}</h2>
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-sm text-amber-200">{review.reason}{review.rawMention ? ` · ${review.rawMention}` : ""}</p>
              <p className="mt-1 text-sm text-slate-400">@{review.username}</p>
              <p className="mt-2 whitespace-pre-wrap">{review.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {review.candidates.map((candidate) => (
                  <button key={candidate.id} className="rounded-xl border border-line px-3 py-2 text-sm" type="button" onClick={() => void attach(review.id, candidate.id)}>
                    Привязать к {candidate.symbol} {candidate.direction}
                  </button>
                ))}
                {review.candidates.length === 0 ? <p className="text-sm text-slate-400">Кандидатов нет, вызов не создаётся наугад.</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {calls.map((call) => (
            <li key={call.id}>
              <button className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-left" type="button" onClick={() => void open(call.id)}>
                <span className="font-medium">{call.symbol} · {call.direction} · {call.kind}</span>
                <span className="mt-1 block text-sm text-slate-400">@{call.username} · {call.status}{call.untestableReason ? ` · ${call.untestableReason}` : ""}</span>
              </button>
            </li>
          ))}
          {calls.length === 0 ? <li className="text-sm text-slate-400">Вызовов пока нет. Их создаёт разбор: pnpm news:extract.</li> : null}
        </ul>
        {detail ? (
          <article className="rounded-2xl border border-line bg-panel p-4">
            <h2 className="font-medium">{detail.symbol} · {detail.direction}</h2>
            <p className="mt-1 text-sm text-slate-400">{detail.status} · горизонт {detail.horizon}{detail.untestableReason ? ` · ${detail.untestableReason}` : ""}</p>
            <p className="mt-3 text-sm text-slate-300">Вход {detail.entryLow ?? "—"}–{detail.entryHigh ?? "—"}, стоп {detail.stop ?? "—"}, цели {detail.targets.join(", ") || "—"}</p>
            <p className="mt-3 text-sm text-amber-200">{detail.testerNote}</p>
            {detail.evaluation ? (
              <p className="mt-1 text-sm text-slate-300">
                {detail.evaluation.status}
                {detail.evaluation.exitReason ? ` · ${detail.evaluation.exitReason}` : ""}
                {detail.evaluation.returnPct != null ? ` · ${detail.evaluation.returnPct.toFixed(2)}%` : ""}
              </p>
            ) : null}
            {detail.prices.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {detail.prices.map((point) => (
                  <li key={point.ts}>{new Date(point.ts).toLocaleString()} · {point.price}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 whitespace-pre-wrap">{detail.text}</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {detail.events.map((event) => (
                <li key={`${event.at}-${event.type}`}>{event.type}: {event.text}</li>
              ))}
            </ul>
            {detail.extractionId ? (
              confirmWrong ? (
                <button className="mt-4 rounded-xl bg-rose-500 px-3 py-2 text-sm" type="button" onClick={() => void markWrong()}>Подтвердить: разбор неверный</button>
              ) : (
                <button className="mt-4 rounded-xl border border-line px-3 py-2 text-sm" type="button" onClick={() => setConfirmWrong(true)}>Разбор неверный</button>
              )
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  );
}

function Digest({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<DigestView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadDigestView().then(setView).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось собрать дайджест";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout]);

  const digest = view?.digest;
  const panorama = view?.panorama;
  return (
    <section className="mt-8 space-y-6">
      <p className="max-w-2xl text-sm text-slate-400">День последних постов. Этот экран для сервиса и может называть каналы. Блок для Panorama отдаётся без имён и сам никуда не отправляется.</p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {digest ? (
        <>
          <div>
            <h2 className="text-lg font-medium">{digest.day}</h2>
            <p className="mt-2 text-sm text-slate-300">Новых постов {digest.newMessages}. В работу взяли {digest.taken.length === 0 ? "ничего" : digest.taken.map((call) => `${call.symbol} ${call.direction} @${call.username}`).join(", ")}.</p>
            <p className="mt-1 text-sm text-slate-300">Консенсус: {digest.consensus.map((row) => `${row.symbol} ${row.side}, голосов ${row.voices}`).join("; ") || "нет, для него нужно два голоса в одну сторону"}.</p>
            <p className="mt-1 text-sm text-slate-300">Расхождения: {digest.disagreement.map((row) => `${row.symbol}, разброс ${row.spread.toFixed(2)}`).join("; ") || "нет"}.</p>
          </div>
          <div>
            <h2 className="text-lg font-medium">Сбои</h2>
            <ul className="mt-3 space-y-2">
              {digest.alerts.map((alert) => (
                <li key={alert.text} className={alert.level === "bad" ? "text-sm text-rose-300" : "text-sm text-amber-200"}>{alert.text}</li>
              ))}
              {digest.alerts.length === 0 ? <li className="text-sm text-slate-400">Сбоев нет.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
      {panorama ? (
        <div>
          <h2 className="text-lg font-medium">Для Panorama</h2>
          <p className="mt-2 text-sm text-slate-400">{panorama.disclaimer}</p>
          <p className="mt-2 text-sm text-slate-300">
            {panorama.market ? `Рынок ${panorama.market.score.toFixed(2)}, каналов ${panorama.market.nChannels}, независимых ${panorama.market.effectiveNChannels.toFixed(1)}.` : "Рыночного снимка за этот день нет."}
          </p>
          <p className="mt-1 text-sm text-slate-300">В работу, без имён: {panorama.taken.map((row) => `${row.symbol} ${row.direction} × ${row.count}`).join(", ") || "нет"}.</p>
        </div>
      ) : null}
    </section>
  );
}

function Prompts({ onLogout }: { onLogout: () => void }) {
  const [rows, setRows] = useState<PromptRow[]>([]);
  const [labeled, setLabeled] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    const payload = await listPrompts();
    setRows(payload.prompts);
    setLabeled(payload.labeled);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить промпты";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout, reload]);

  async function run(id: string) {
    setPending(true);
    setError("");
    try {
      const result = await evalPrompt(id);
      setError(result.reason);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Прогон не выполнен");
    } finally {
      setPending(false);
    }
  }

  async function copy(prompt: PromptRow) {
    setPending(true);
    setError("");
    try {
      const created = await savePrompt(prompt.name, prompt.body);
      setError(`${prompt.name} v${created.version} сохранена выключенной`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Копия не сохранена");
    } finally {
      setPending(false);
    }
  }

  async function activate(id: string) {
    setPending(true);
    setError("");
    try {
      const result = await activatePrompt(id);
      setError(result.reason);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Версия не включена");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 space-y-4">
      <p className="text-sm text-slate-400">Золотой набор: {labeled}. Новая версия сохраняется выключенной. Включить её можно вручную только после прогона на размеченных сообщениях.</p>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      {rows.map((prompt) => (
        <article key={prompt.id} className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-medium">{prompt.name} v{prompt.version}{prompt.isActive ? " · включена" : " · выключена"}</h2>
          <p className="mt-1 text-sm text-slate-400">{prompt.activation.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" disabled={pending} onClick={() => void copy(prompt)}>Сохранить копию выключенной</button>
            <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" disabled={pending} onClick={() => void run(prompt.id)}>Прогнать на золотом наборе</button>
            <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" disabled={pending || prompt.isActive} onClick={() => void activate(prompt.id)}>Включить вручную</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Params({ onLogout }: { onLogout: () => void }) {
  const [rows, setRows] = useState<ParamRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    const payload = await listParams();
    setRows(payload.sets);
    setDrafts((current) => {
      const next = { ...current };
      for (const row of payload.sets) {
        if (!next[row.id]) next[row.id] = JSON.stringify(row.params, null, 2);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить параметры";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout, reload]);

  async function save(row: ParamRow) {
    setPending(true);
    setError("");
    try {
      const params = JSON.parse(drafts[row.id] ?? "") as unknown;
      const created = await saveParams(row.kind, params);
      setError(`${row.kind} v${created.version} сохранена выключенной`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  async function recompute(row: ParamRow) {
    setPending(true);
    setError("");
    try {
      const result = await recomputeParams(row.id);
      setError(result.reason ?? `${row.kind} v${row.version} включена`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Пересчёт не выполнен");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 space-y-4">
      <p className="text-sm text-slate-400">Новая версия не стирает старые оценки. Тестер пишет оценки только после ворот разбора.</p>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-medium">{row.kind} v{row.version}{row.isActive ? " · включена" : " · выключена"}</h2>
          <textarea className="mt-3 h-40 w-full rounded-xl border border-line bg-transparent p-3 font-mono text-xs" value={drafts[row.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" disabled={pending} onClick={() => void save(row)}>Сохранить новой версией</button>
            <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" disabled={pending} onClick={() => void recompute(row)}>Включить и пересчитать</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Sentiment({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<SentimentView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSentiment().then(setView).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить сентимент";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout]);

  return (
    <section className="mt-8 space-y-6">
      <p className="max-w-2xl text-sm text-slate-400">{view?.note}</p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <div>
        <h2 className="text-lg font-medium">Рынок по дням</h2>
        <ul className="mt-3 space-y-2">
          {view?.market.map((point) => (
            <li key={point.date} className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm">
              {new Date(point.date).toLocaleDateString()} · счёт {point.score.toFixed(2)} · каналов {point.nChannels}, независимых {point.effectiveNChannels.toFixed(1)} · сообщений {point.nMessages} · разброс {point.dispersion.toFixed(2)}
              {point.overheated ? " · перегрев" : ""}
            </li>
          ))}
          {view && view.market.length === 0 ? <li className="text-sm text-slate-400">Снимков нет. Их пишет pnpm news:sentiment.</li> : null}
        </ul>
      </div>
      <div>
        <h2 className="text-lg font-medium">Монеты, последний день</h2>
        <ul className="mt-3 space-y-2">
          {view?.coins.map((point) => (
            <li key={point.key} className="text-sm text-slate-300">{point.key}: {point.score.toFixed(2)}, каналов {point.nChannels}, независимых {point.effectiveNChannels.toFixed(1)}, сообщений {point.nMessages}</li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-lg font-medium">Темы из разбора</h2>
        <p className="mt-1 text-sm text-slate-400">Показаны теги, которые в последнем дне опираются хотя бы на два сообщения. Остальные остаются в снимках, но один тег модели не становится темой.</p>
        <ul className="mt-3 space-y-2">
          {view?.themes.filter((point) => point.nMessages >= 2).map((point) => (
            <li key={point.key} className="text-sm text-slate-300">{point.key}: {point.score.toFixed(2)}, сообщений {point.nMessages}</li>
          ))}
          {view && view.themes.filter((point) => point.nMessages >= 2).length === 0 ? <li className="text-sm text-slate-400">Повторяющихся тегов нет.</li> : null}
        </ul>
      </div>
      <div>
        <h2 className="text-lg font-medium">Согласованные упоминания</h2>
        <ul className="mt-3 space-y-2">
          {view?.flags.map((flag) => (
            <li key={`${flag.symbol}-${flag.at}`} className="text-sm text-amber-200">{flag.symbol} · {new Date(flag.at).toLocaleString()} · {flag.channels.join(", ") || "каналы не названы"}</li>
          ))}
          {view && view.flags.length === 0 ? <li className="text-sm text-slate-400">Флагов нет. Порог — три канала за час и монета не из крупных.</li> : null}
        </ul>
      </div>
    </section>
  );
}

function Channels({ onLogout }: { onLogout: () => void }) {
  const [summary, setSummary] = useState<ChannelSummary | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setSummary(await loadChannelSummary());
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить каналы";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout, reload]);

  async function refresh() {
    setPending(true);
    setError("");
    try {
      const result = await refreshPrices();
      setError(result.skipped ? `Цены обновлены, символов ${result.prices.symbols}. Тестер не запущен: ${result.reason}.` : `Оценок: ${result.evaluated}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить цены");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">{summary?.caveat}</p>
        <button className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" type="button" disabled={pending} onClick={() => void refresh()}>
          {pending ? "Качаю цены…" : "Обновить цены"}
        </button>
      </div>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      <div className="space-y-3">
        {summary?.channels.map((channel) => (
          <article key={channel.username} className="rounded-2xl border border-line bg-panel p-4">
            <h2 className="font-medium">@{channel.username}</h2>
            <p className="mt-1 text-sm text-slate-400">{channel.title || "без названия"} · по алфавиту, не по результату</p>
            <p className="mt-3 text-sm text-slate-300">
              Сообщений {channel.messages}, удалено {channel.deleted}, правок {channel.edited}, рекламы {channel.ads}.
              Вызовов {channel.calls}, проверяемых {channel.testable}, открытых {channel.open}, закрытых {channel.closed}, непроверяемых {channel.untestable}.
            </p>
            <p className="mt-1 text-sm text-slate-300">Типы: {Object.entries(channel.types).map(([type, count]) => `${type} ${count}`).join(", ") || "нет разбора"}</p>
            <p className="mt-1 text-sm text-amber-200">Дни, недели и месяцы: {channel.results}</p>
            <p className="mt-1 text-sm text-slate-300">
              {channel.profile
                ? `Профиль за неделю с ${new Date(channel.profile.weekStart).toLocaleDateString()}: ${channel.profile.mood || "настрой не подтверждён ссылками"}. Ссылки ${channel.profile.kept} из ${channel.profile.claims}, свежесть ${channel.profile.freshnessDays} дн.${channel.profile.changed ? " Взгляд сменился относительно прошлой недели." : ""}`
                : "Профиля нет: закрытая неделя ещё без разбора или команда pnpm news:profiles не запускалась."}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function statusClass(status: MetricCard["status"]): string {
  if (status === "ok") return "text-sm text-emerald-300";
  if (status === "warn") return "text-sm text-amber-200";
  if (status === "bad") return "text-sm text-rose-300";
  return "text-sm text-slate-400";
}
