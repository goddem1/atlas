import { lazy, Suspense, useCallback, useEffect, useMemo, useState, memo } from "react";
import type { TelegramNewsWidgetExplanation } from "@atlas-v1/shared";
import { loadTelegramFilters } from "../../../lib/telegramFilters";
import {
  loadTelegramChannels,
  saveTelegramChannels,
  TELEGRAM_CHANNELS_CHANGED_EVENT,
} from "../../../lib/telegramChannels";
import { TwemojiText } from "../../../lib/twemojiText";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { isTelegramEnabled } from "../../../lib/telegramFeature";
import { fetchTelegramNewsChannels, fetchTelegramNewsWidget } from "../../../services/api";
import {
  GALLERY_NEWS_EXPLANATION,
  GALLERY_NEWS_ITEMS,
  GALLERY_NEWS_SENTIMENT,
} from "../../dashboard/widgetGalleryPreviewData";
import {
  DEV_NEWS_EXPLANATION,
  DEV_NEWS_ITEMS,
  DEV_NEWS_SENTIMENT,
} from "./newsWidgetDevFixtures";
import { sentimentTone, sentimentMeterColor, toNewsWidgetItem, type NewsWidgetItem } from "./newsClassify";
import "../shared/portfolio-menu.css";
import "./news-widget.css";

const TelegramNewsModal = lazy(() =>
  import("../../telegram-news/TelegramNewsModal").then((m) => ({ default: m.TelegramNewsModal })),
);

const POLL_MS = 5 * 60_000;

/** Локальные тестовые новости: только Vite DEV. На проде не применяются. */
const USE_DEV_NEWS_FIXTURES = import.meta.env.DEV;

export type NewsWidgetExplainPayload = {
  sentiment: number;
  explanation: TelegramNewsWidgetExplanation;
  items: NewsWidgetItem[];
  day?: string;
  candidateCount?: number;
};

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  onOpenNews?: () => void;
  onOpenExplain?: (payload: NewsWidgetExplainPayload) => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

const EMPTY_EXPLANATION: TelegramNewsWidgetExplanation = { formula: "", notes: [] };

export const NewsWidget = memo(function NewsWidget({
  dragHandleClassName,
  onDeleteWidget,
  onOpenNews,
  onOpenExplain,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(() => !galleryPreview && !USE_DEV_NEWS_FIXTURES);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<NewsWidgetItem[]>(() =>
    galleryPreview ? GALLERY_NEWS_ITEMS : USE_DEV_NEWS_FIXTURES ? DEV_NEWS_ITEMS : [],
  );
  const [sentiment, setSentiment] = useState(() =>
    galleryPreview ? GALLERY_NEWS_SENTIMENT : USE_DEV_NEWS_FIXTURES ? DEV_NEWS_SENTIMENT : 50,
  );
  const [explanation, setExplanation] = useState<TelegramNewsWidgetExplanation>(() =>
    galleryPreview
      ? GALLERY_NEWS_EXPLANATION
      : USE_DEV_NEWS_FIXTURES
        ? DEV_NEWS_EXPLANATION
        : EMPTY_EXPLANATION,
  );
  const [day, setDay] = useState<string | undefined>(undefined);
  const [candidateCount, setCandidateCount] = useState<number | undefined>(undefined);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);
  const [localNewsOpen, setLocalNewsOpen] = useState(false);

  const openNews = useCallback(() => {
    if (onOpenNews) onOpenNews();
    else setLocalNewsOpen(true);
  }, [onOpenNews]);

  const load = useCallback(() => {
    if (galleryPreview) return;

    const applyDevFixtures = () => {
      if (!USE_DEV_NEWS_FIXTURES) return false;
      setItems(DEV_NEWS_ITEMS);
      setSentiment(DEV_NEWS_SENTIMENT);
      setExplanation(DEV_NEWS_EXPLANATION);
      setDay(undefined);
      setCandidateCount(DEV_NEWS_ITEMS.length);
      setEmptyHint(null);
      setErr(null);
      setLoading(false);
      return true;
    };

    if (!isTelegramEnabled()) {
      if (applyDevFixtures()) return;
      setItems([]);
      setSentiment(50);
      setExplanation({
        formula: "Telegram отключён локально.",
        notes: [],
      });
      setDay(undefined);
      setCandidateCount(undefined);
      setEmptyHint("Telegram отключён локально");
      setErr(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    const resolveUsernames = async (): Promise<string[]> => {
      const stored = loadTelegramChannels();
      if (stored && stored.length > 0) return stored;
      // Первый запуск: как в модалке ленты — подтянуть дефолтные каналы с API
      if (stored == null) {
        const rows = await fetchTelegramNewsChannels();
        const defaults = rows.map((r) => r.username).filter(Boolean);
        if (defaults.length > 0) {
          saveTelegramChannels(defaults);
          return defaults;
        }
      }
      return [];
    };

    void resolveUsernames()
      .then(async (usernames) => {
        if (usernames.length === 0) {
          if (applyDevFixtures()) return;
          setItems([]);
          setSentiment(50);
          setExplanation({
            formula: "Нет каналов — сентимент не считается.",
            notes: [],
          });
          setDay(undefined);
          setCandidateCount(undefined);
          setEmptyHint("Добавьте каналы в ленте");
          return;
        }
        const filters = loadTelegramFilters();
        const data = await fetchTelegramNewsWidget(usernames, filters);
        const notes = data.explanation?.notes ?? [];
        const noteById = new Map(notes.map((n) => [n.id, n]));
        const mapped = data.items.map((msg) => {
          const key = `${msg.channelUsername}:${msg.id}`;
          return toNewsWidgetItem(msg, noteById.get(key)?.category);
        });
        if (mapped.length === 0 && applyDevFixtures()) return;
        setItems(mapped);
        setSentiment(Math.round(Math.min(100, Math.max(0, data.sentiment))));
        setExplanation(
          data.explanation ?? {
            formula: data.why?.trim() || "",
            notes: mapped.map((item) => ({
              id: item.key,
              why: "Без детального пояснения.",
              impact: "Влияние не указано.",
            })),
          },
        );
        setDay(data.day);
        setCandidateCount(data.candidateCount);
        setEmptyHint(
          mapped.length === 0
            ? data.why?.trim() || data.explanation?.formula?.trim() || "Нет новостей"
            : null,
        );
      })
      .catch((e: unknown) => {
        if (applyDevFixtures()) return;
        setErr(e instanceof Error ? e.message : "Не удалось загрузить новости");
        setItems([]);
        setExplanation(EMPTY_EXPLANATION);
        setDay(undefined);
        setCandidateCount(undefined);
        setEmptyHint(null);
      })
      .finally(() => setLoading(false));
  }, [galleryPreview]);

  useEffect(() => {
    if (galleryPreview || overlayOpen) return;
    load();
    const id = window.setInterval(load, POLL_MS);
    const onChannelsChanged = () => load();
    window.addEventListener(TELEGRAM_CHANNELS_CHANGED_EVENT, onChannelsChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(TELEGRAM_CHANNELS_CHANGED_EVENT, onChannelsChanged);
    };
  }, [load, galleryPreview, overlayOpen]);

  const tone = useMemo(() => sentimentTone(sentiment), [sentiment]);
  const meterValueColor = useMemo(
    () => (tone === "mid" ? sentimentMeterColor(sentiment) : undefined),
    [sentiment, tone],
  );
  const dragCn = cn("news-widget-head", dragHandleClassName);
  const hasExplanation = Boolean(explanation.formula) || explanation.notes.length > 0;
  const telegramEnabled = isTelegramEnabled();

  return (
    <div className="news-widget-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen ? "is-open" : undefined)}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => {
              setMenuOpen(false);
              onOpenExplain?.({ sentiment, explanation, items, day, candidateCount });
            }}
            aria-label="Объяснение сентимента и новостей"
            title="Объяснение"
            disabled={!hasExplanation || !onOpenExplain}
          >
            <img src="/assets/portfolio-ui/info.svg" alt="" className="portfolio-menu-circle-icon" />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => {
              setMenuOpen(false);
              openNews();
            }}
            aria-label="Открыть ленту новостей"
            disabled={!telegramEnabled}
            title={telegramEnabled ? undefined : "Telegram отключён локально"}
          >
            <img src="/assets/portfolio-ui/messages.svg" alt="" className="portfolio-menu-circle-icon" />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img
              src="/assets/portfolio-ui/close.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close"
            />
          </button>
        </div>
      </div>

      <div className="atlas-glass news-widget-card">
        <div className={dragCn}>
          <div className="news-widget-meter" aria-label={`Настроение ленты ${sentiment}%`}>
            <div className="news-widget-meter-track">
              <div
                className={cn("news-widget-meter-value", `is-${tone}`)}
                style={{ left: `${sentiment}%`, ...(meterValueColor ? { color: meterValueColor } : {}) }}
              >
                {sentiment}%
              </div>
              <span
                className={cn("news-widget-meter-thumb", `is-${tone}`)}
                style={{ left: `${sentiment}%` }}
              />
            </div>
          </div>
        </div>

        {loading ? <p className="news-widget-msg">Загрузка…</p> : null}
        {!loading && err ? <p className="news-widget-msg news-widget-msg--err">{err}</p> : null}
        {!loading && !err && items.length === 0 ? (
          <p className="news-widget-msg">
            {telegramEnabled ? emptyHint || "Нет новостей" : "Telegram отключён локально"}
            {telegramEnabled ? (
              <button type="button" className="news-widget-inline-link" onClick={openNews}>
                открыть ленту
              </button>
            ) : null}
          </p>
        ) : null}

        {!loading && !err && items.length > 0 ? (
          <ul className="news-widget-list">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="news-widget-row"
                  onClick={openNews}
                  title={item.text}
                >
                  <span
                    className="news-widget-tag"
                    style={{ backgroundColor: item.tag.color }}
                    aria-label={item.tag.label}
                  >
                    <span className="news-widget-tag-label">{item.tag.label}</span>
                  </span>
                  <TwemojiText className="news-widget-text" text={item.text} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!galleryPreview && localNewsOpen && !onOpenNews && telegramEnabled ? (
        <Suspense fallback={null}>
          <TelegramNewsModal open onClose={() => setLocalNewsOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
});
