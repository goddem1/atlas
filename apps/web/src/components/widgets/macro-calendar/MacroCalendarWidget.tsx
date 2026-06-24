import { lazy, Suspense, useCallback, useEffect, useMemo, useState, memo } from "react";
import type { MacroEventRow } from "@atlas-v1/shared";
import {
  eventYmdMsk,
  fmtMacroEventTime,
  formatMacroRussianDayTitle,
  isActualOnlyIndicator,
  isNoValuesIndicator,
  withMacroUnit,
} from "../../../lib/macroEventUi";
import {
  mskMinuteKey,
  mskSecond,
  pickMacroReleaseStatusPollDelay,
} from "../../../lib/macroEventMskTime";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { fetchMacroEvents, fetchMacroReleaseStatus } from "../../../services/api";
import { GALLERY_MACRO_EVENTS } from "../../dashboard/widgetGalleryPreviewData";
import "../price-sparkline/price-sparkline-widget.css";
import "./macro-calendar-widget.css";

const MacroSeriesDetailModal = lazy(() =>
  import("../../dashboard/MacroSeriesDetailModal").then((m) => ({ default: m.MacroSeriesDetailModal })),
);

const POLL_MS = 5 * 60 * 1000;
const VISIBLE_ROWS = 5;
function pluralEventsRu(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} событие`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} события`;
  return `${n} событий`;
}

function cn(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function todayBoundsMoscow(): { from: Date; to: Date } {
  const now = new Date();
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const from = new Date(`${ymd}T00:00:00+03:00`);
  const to = new Date(`${ymd}T23:59:59.999+03:00`);
  return { from, to };
}

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  /** Открыть полный календарь (модалка на дашборде). */
  onOpenFullCalendar?: () => void;
  /** Статичное превью для галереи виджетов — без API. */
  galleryPreview?: boolean;
};

export const MacroCalendarWidget = memo(function MacroCalendarWidget({
  dragHandleClassName,
  onDeleteWidget,
  onOpenFullCalendar,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(() => !galleryPreview);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<MacroEventRow[]>(() =>
    galleryPreview ? GALLERY_MACRO_EVENTS : [],
  );
  const [seriesIndicatorId, setSeriesIndicatorId] = useState<string | null>(null);
  const [releaseLoadingIds, setReleaseLoadingIds] = useState<Set<string>>(() => new Set());
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(() => {
    if (galleryPreview) return;
    const { from, to } = todayBoundsMoscow();
    const todayYmd = from.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    setLoading(true);
    setErr(null);
    fetchMacroEvents({ from, to, locale: "ru" })
      .then((r) => {
        const list = (r.events ?? [])
          .filter((e) => eventYmdMsk(e.date) === todayYmd)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setRows(list);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Ошибка загрузки");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [galleryPreview]);

  useEffect(() => {
    if (galleryPreview || overlayOpen) return;
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, galleryPreview, overlayOpen]);

  const needsLiveClock = useMemo(() => {
    if (galleryPreview || overlayOpen) return false;
    if (releaseLoadingIds.size > 0) return true;
    return rows.some((e) => !e.actual);
  }, [galleryPreview, overlayOpen, releaseLoadingIds, rows]);

  useEffect(() => {
    if (!needsLiveClock) return;
    const tick = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [needsLiveClock]);

  useEffect(() => {
    if (galleryPreview || overlayOpen) return;
    let cancelled = false;
    let previousActiveCount = 0;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const r = await fetchMacroReleaseStatus();
        if (cancelled) return;
        const next = new Set(r.inProgressEventIds ?? []);
        const nextCount = next.size;
        setReleaseLoadingIds(next);
        if (previousActiveCount > 0 && nextCount === 0) {
          load();
        }
        previousActiveCount = nextCount;
      } catch {
        if (!cancelled) setReleaseLoadingIds(new Set());
      } finally {
        if (!cancelled) {
          const delay = pickMacroReleaseStatusPollDelay(rows, previousActiveCount, new Date());
          timer = window.setTimeout(() => void poll(), delay);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [load, rows, galleryPreview, overlayOpen]);

  const visible = rows.slice(0, VISIBLE_ROWS);
  const moreCount = Math.max(0, rows.length - VISIBLE_ROWS);
  const dragCn = cn("macro-cal-head", dragHandleClassName);
  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const nowMinute = useMemo(() => mskMinuteKey(now), [now]);
  const nowSecond = useMemo(() => mskSecond(now), [now]);
  const eventMinuteById = useMemo(
    () => new Map(visible.map((e) => [e.id, mskMinuteKey(new Date(e.date))])),
    [visible],
  );

  return (
    <div className="macro-cal-shell">
      <div
        className={`portfolio-menu-wrap${menuOpen ? " is-open" : ""}`}
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
              onOpenFullCalendar?.();
            }}
            aria-label="Полный календарь макро-событий"
          >
            <img
              src="/assets/portfolio-ui/chart_bar.svg"
              alt=""
              className="portfolio-menu-circle-icon"
            />
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

      <div className="atlas-glass macro-cal-card">
      <div className={dragCn}>
        <div className="macro-cal-head-row">
          <p className="macro-cal-date">{formatMacroRussianDayTitle(new Date())}</p>
          <div className="macro-cal-col-labels" aria-hidden>
            <span>Акт.</span>
            <span>Пред.</span>
          </div>
        </div>
      </div>

      <div className="macro-cal-divider macro-cal-divider--rotated" />

      {loading ? <p className="macro-cal-msg">Загрузка…</p> : null}
      {!loading && err ? <p className="macro-cal-msg macro-cal-msg--err">{err}</p> : null}
      {!loading && !err && rows.length === 0 ? (
        <p className="macro-cal-msg">Событий на сегодня нет</p>
      ) : null}

      {!loading && !err && visible.length > 0 ? (
        <ul className="macro-cal-list">
          {visible.map((e) => (
            (() => {
              const inServerProgress = releaseLoadingIds.has(e.id);
              const inPreFetchWindow = !e.actual && nowSecond < 5 && eventMinuteById.get(e.id) === nowMinute;
              const isActualLoading = inServerProgress || inPreFetchWindow;
              return (
                <li
                  key={e.id}
                  className={cn("macro-cal-row macro-cal-row--clickable", e.importance !== "high" ? "macro-cal-row--no-alert" : undefined)}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSeriesIndicatorId(e.indicatorId)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSeriesIndicatorId(e.indicatorId);
                    }
                  }}
                >
              {e.importance === "high" ? (
                <span className="macro-cal-alert-slot">
                  <span className="macro-cal-alert">!</span>
                </span>
              ) : null}
              <span className="macro-cal-time">{fmtMacroEventTime(e.date)}</span>
              <p className="macro-cal-name" title={e.name}>
                <span>{e.name}</span>
                {e.reference ? <span>{e.reference}</span> : null}
              </p>
              <span className={cn("macro-cal-val", isActualLoading ? "is-loading" : undefined)}>
                {isActualOnlyIndicator(e.name)
                  ? isActualLoading
                    ? "…"
                    : e.actual
                    ? withMacroUnit(e.actual, e.unit)
                    : ""
                  : isNoValuesIndicator(e.name)
                    ? ""
                    : isActualLoading
                      ? "…"
                      : e.actual
                      ? withMacroUnit(e.actual, e.unit)
                      : "—"}
              </span>
              <span
                className={cn(
                  "macro-cal-val macro-cal-val--second",
                  isNoValuesIndicator(e.name) ? "macro-cal-val--muted" : "",
                )}
              >
                {isActualOnlyIndicator(e.name) || isNoValuesIndicator(e.name)
                  ? ""
                  : e.previous
                    ? withMacroUnit(e.previous, e.unit)
                    : "—"}
              </span>
                </li>
              );
            })()
          ))}
        </ul>
      ) : null}

      {!loading && !err && moreCount > 0 ? (
        <div className="macro-cal-footer">
          <button type="button" className="macro-cal-expand" onClick={() => onOpenFullCalendar?.()}>
            ещё {pluralEventsRu(moreCount)}
            <span aria-hidden> →</span>
          </button>
        </div>
      ) : null}
      </div>
      {!galleryPreview && seriesIndicatorId != null ? (
        <Suspense fallback={null}>
          <MacroSeriesDetailModal
            open
            indicatorId={seriesIndicatorId}
            onClose={() => setSeriesIndicatorId(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
