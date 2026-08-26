import { useEffect } from "react";
import { createPortal } from "react-dom";
import type {
  TelegramNewsWidgetExplanation,
  TelegramNewsWidgetItemKind,
} from "@atlas-v1/shared";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import type { NewsWidgetItem } from "./newsClassify";
import "./news-widget-explain-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  sentiment: number;
  explanation: TelegramNewsWidgetExplanation;
  items: NewsWidgetItem[];
  day?: string;
  candidateCount?: number;
};

function formatDayRu(day?: string): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parts = day.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function formatPostedAt(iso: string): string | null {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(dt);
}

const KIND_LABEL: Record<TelegramNewsWidgetItemKind, string> = {
  moved: "Уже двинула рынок",
  will_move: "Двинет рынок",
  narrative: "Нарратив",
};

const KIND_HINT: Record<TelegramNewsWidgetItemKind, string> = {
  moved:
    "Факт уже случился, цена отреагировала — объясняет текущее движение рынка.",
  will_move:
    "Предстоящее событие (ФРС, листинг, экспирация и т.п.) — форвард на часы/дни.",
  narrative:
    "Не двигает цену мгновенно, но меняет sentiment на дни/неделю.",
};

export function NewsWidgetExplainModal({
  open,
  onClose,
  sentiment,
  explanation,
  items,
  day,
  candidateCount,
}: Props) {
  useBackdropBlurPause(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const noteById = new Map(
    explanation.notes.map((n) => [n.id, { why: n.why, impact: n.impact, kind: n.kind }] as const),
  );
  const dayLabel = formatDayRu(day);

  return createPortal(
    <div className="news-explain-overlay" role="presentation">
      <button type="button" className="news-explain-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-explain-title"
        className="news-explain-dialog atlas-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="news-explain-header">
          <div className="news-explain-header-text">
            <h2 id="news-explain-title" className="news-explain-title">
              Объяснение
            </h2>
            {dayLabel ? (
              <p className="news-explain-subtitle">
                День · {dayLabel}
                {typeof candidateCount === "number" ? ` · ${candidateCount} новостей` : ""}
              </p>
            ) : null}
          </div>
          <button type="button" className="news-explain-close" onClick={onClose} aria-label="Закрыть">
            <img src="/assets/portfolio-ui/close.svg" alt="" />
          </button>
        </header>

        <div className="news-explain-body">
          <section className="news-explain-section">
            <h3 className="news-explain-section-title">Сентимент · {sentiment}%</h3>
            <p className="news-explain-text">
              {explanation.formula || "Формула расчёта недоступна."}
            </p>
          </section>

          {items.length > 0 ? (
            <section className="news-explain-section">
              <h3 className="news-explain-section-title">Топ-5 новостей дня</h3>
              <ul className="news-explain-notes">
                {items.map((item, index) => {
                  const note = noteById.get(item.key);
                  const kind = note?.kind;
                  const kindLabel = kind ? KIND_LABEL[kind] : null;
                  const kindHint = kind ? KIND_HINT[kind] : null;
                  const postedAt = formatPostedAt(item.date);
                  return (
                    <li key={item.key} className="news-explain-note">
                      <div className="news-explain-note-title">
                        {index + 1}. {item.text}
                      </div>
                      <p className="news-explain-note-meta">
                        @{item.channelUsername}
                        {postedAt ? ` · ${postedAt} (МСК)` : ""}
                      </p>
                      {kindLabel ? (
                        <p className="news-explain-note-line news-explain-note-kind">
                          <span className="news-explain-label">Тип:</span>{" "}
                          <span className={`news-explain-kind-badge is-${kind}`}>{kindLabel}</span>
                          {kindHint ? (
                            <span className="news-explain-kind-hint"> — {kindHint}</span>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="news-explain-note-line">
                        <span className="news-explain-label">Почему:</span>{" "}
                        {note?.why ?? "Нет пояснения."}
                      </p>
                      <p className="news-explain-note-line">
                        <span className="news-explain-label">Влияние:</span>{" "}
                        {note?.impact ?? "Не указано."}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
