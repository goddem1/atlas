import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MacroEventRow } from "@atlas-v1/shared";
import {
  fmtMacroEventTime,
  formatMacroRussianDayTitle,
  isActualOnlyIndicator,
  isNoValuesIndicator,
  isSpeechIndicator,
  withMacroUnit,
  ymdMskFromDate,
} from "../../lib/macroEventUi";
import { buildMacroSlotImageUrl, fetchMacroEvents, fetchMacroReleaseStatus } from "../../services/api";
import { MacroSeriesDetailModal } from "./MacroSeriesDetailModal";
import "../widgets/shared/asset-picker.css";
import "../widgets/portfolio/portfolio-widget.css";
import "./macro-events-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

type MacroPeriodPreset =
  | "currentMonth"
  | "today"
  | "lastMonth"
  | "lastWeek"
  | "yesterday"
  | "currentWeek"
  | "tomorrow"
  | "nextWeek"
  | "nextMonth"
  | "custom";

const MACRO_PERIOD_PRESETS: Array<{ value: MacroPeriodPreset; label: string }> = [
  { value: "currentMonth", label: "Текущий месяц" },
  { value: "today", label: "Сегодня" },
  { value: "lastMonth", label: "Прошлый месяц" },
  { value: "lastWeek", label: "Прошлая неделя" },
  { value: "yesterday", label: "Вчера" },
  { value: "currentWeek", label: "Текущая неделя" },
  { value: "tomorrow", label: "Завтра" },
  { value: "nextWeek", label: "Следующая неделя" },
  { value: "nextMonth", label: "Следующий месяц" },
  { value: "custom", label: "Своя дата" },
];

const MACRO_IMPORTANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Все" },
  { value: "high", label: "Высокая" },
  { value: "medium", label: "Средняя" },
  { value: "low", label: "Низкая" },
];

function ymdMsk(d: Date): string {
  return ymdMskFromDate(d);
}

function countryShort(country: string): string {
  const raw = country.trim().toLowerCase();
  if (raw === "united states" || raw === "usa" || raw === "us") return "🇺🇸 США";
  return country;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultMacroPeriod(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}

function fmtRuShortYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  if (!Number.isFinite(dt.getTime())) return ymd;
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfWeekMonday(d: Date): Date {
  const out = startOfWeekMonday(d);
  out.setDate(out.getDate() + 6);
  out.setHours(23, 59, 59, 999);
  return out;
}

function toDayBounds(d: Date): { from: Date; to: Date } {
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  const to = new Date(d);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function tryShowDatePicker(el: HTMLInputElement | null): void {
  if (!el) return;
  const anyEl = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof anyEl.showPicker === "function") {
    try {
      anyEl.showPicker();
      return;
    } catch {
      /* ignore */
    }
  }
  el.focus();
}

function getMacroPresetRange(preset: MacroPeriodPreset, base = new Date()): { from: string; to: string } | null {
  const now = new Date(base);

  if (preset === "custom") return null;
  if (preset === "currentMonth") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  if (preset === "today") {
    const r = toDayBounds(now);
    return { from: isoDateLocal(r.from), to: isoDateLocal(r.to) };
  }
  if (preset === "yesterday") {
    now.setDate(now.getDate() - 1);
    const r = toDayBounds(now);
    return { from: isoDateLocal(r.from), to: isoDateLocal(r.to) };
  }
  if (preset === "tomorrow") {
    now.setDate(now.getDate() + 1);
    const r = toDayBounds(now);
    return { from: isoDateLocal(r.from), to: isoDateLocal(r.to) };
  }
  if (preset === "currentWeek") {
    const from = startOfWeekMonday(now);
    const to = endOfWeekMonday(now);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  if (preset === "lastWeek") {
    const from = startOfWeekMonday(now);
    from.setDate(from.getDate() - 7);
    const to = endOfWeekMonday(from);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  if (preset === "nextWeek") {
    const from = startOfWeekMonday(now);
    from.setDate(from.getDate() + 7);
    const to = endOfWeekMonday(from);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  if (preset === "lastMonth") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  if (preset === "nextMonth") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const from = new Date(y, m + 1, 1);
    const to = new Date(y, m + 2, 0, 23, 59, 59, 999);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }
  return null;
}

const MACRO_STICKY_HEADER_OFFSET = -85;
const MACRO_INITIAL_SCROLL_OFFSET = -85;
/** Интервал между появлением мини-графиков (видимые сначала, затем при скролле). */
const MACRO_CHART_REVEAL_MS = 72;
const MACRO_RELEASE_STATUS_HOT_POLL_MS = 1000;
const MACRO_RELEASE_STATUS_NEAR_POLL_MS = 5000;
const MACRO_RELEASE_STATUS_IDLE_POLL_MS = 30000;

function mskMinuteKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function mskEpochParts(value: Date): { epochMinute: number; second: number } {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const y = Number.parseInt(get("year"), 10) || 1970;
  const m = Number.parseInt(get("month"), 10) || 1;
  const d = Number.parseInt(get("day"), 10) || 1;
  const hh = Number.parseInt(get("hour"), 10) || 0;
  const mm = Number.parseInt(get("minute"), 10) || 0;
  const ss = Number.parseInt(get("second"), 10) || 0;
  const epochMinute = Date.UTC(y, m - 1, d, hh, mm, 0) / 60000;
  return { epochMinute, second: ss };
}

function pickReleaseStatusPollDelay(
  events: MacroEventRow[],
  inProgressSize: number,
  now = new Date(),
): number {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return Math.max(MACRO_RELEASE_STATUS_IDLE_POLL_MS, 60000);
  }
  if (inProgressSize > 0) return MACRO_RELEASE_STATUS_HOT_POLL_MS;

  const nowParts = mskEpochParts(now);
  const nowMinute = nowParts.epochMinute;
  const hotSecondWindow = nowParts.second < 8;
  let hasNearRelease = false;
  for (const e of events) {
    const eventMinute = mskEpochParts(new Date(e.date)).epochMinute;
    const delta = eventMinute - nowMinute;
    if (delta < 0 || delta > 15) continue;
    hasNearRelease = true;
    if (delta === 0 && hotSecondWindow) return MACRO_RELEASE_STATUS_HOT_POLL_MS;
  }
  return hasNearRelease ? MACRO_RELEASE_STATUS_NEAR_POLL_MS : MACRO_RELEASE_STATUS_IDLE_POLL_MS;
}

export function MacroEventsModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [events, setEvents] = useState<MacroEventRow[]>([]);
  const [activeDay, setActiveDay] = useState<string>(ymdMsk(new Date()));
  const [periodPreset, setPeriodPreset] = useState<MacroPeriodPreset>("currentMonth");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [periodMenuRect, setPeriodMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const initialPeriod = useMemo(() => getMacroPresetRange("currentMonth") ?? defaultMacroPeriod(), []);
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from);
  const [periodTo, setPeriodTo] = useState(initialPeriod.to);
  const [importanceFilter, setImportanceFilter] = useState("all");
  const [importanceMenuOpen, setImportanceMenuOpen] = useState(false);
  const [importanceMenuRect, setImportanceMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categoryMenuRect, setCategoryMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [seriesIndicatorId, setSeriesIndicatorId] = useState<string | null>(null);
  const [tinyLoadedByRowId, setTinyLoadedByRowId] = useState<Record<string, boolean>>({});
  const [previewLoadedByRowId, setPreviewLoadedByRowId] = useState<Record<string, boolean>>({});
  const [tinyFailedByRowId, setTinyFailedByRowId] = useState<Record<string, boolean>>({});
  const [previewFailedByRowId, setPreviewFailedByRowId] = useState<Record<string, boolean>>({});
  const [visibleChartSlotIds, setVisibleChartSlotIds] = useState<Set<string>>(() => new Set());
  const [tinyRevealedByRowId, setTinyRevealedByRowId] = useState<Record<string, boolean>>({});
  const [releaseLoadingIds, setReleaseLoadingIds] = useState<Set<string>>(() => new Set());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const periodMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const importanceMenuRef = useRef<HTMLDivElement | null>(null);
  const importanceMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const periodStartRef = useRef<HTMLInputElement | null>(null);
  const periodEndRef = useRef<HTMLInputElement | null>(null);

  const categoryOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const e of events) {
      const category = e.category?.trim();
      if (category) uniq.add(category);
    }
    return [
      { value: "all", label: "Все категории" },
      ...[...uniq].sort((a, b) => a.localeCompare(b, "ru")).map((cat) => ({ value: cat, label: cat })),
    ];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const importanceOk =
        importanceFilter === "all" || (e.importance ?? "").trim().toLowerCase() === importanceFilter;
      const categoryOk = categoryFilter === "all" || (e.category ?? "").trim() === categoryFilter;
      return importanceOk && categoryOk;
    });
  }, [events, importanceFilter, categoryFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, MacroEventRow[]>();
    for (const e of filteredEvents) {
      const key = ymdMsk(new Date(e.date));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()].map(([day, list]) => ({ day, list }));
  }, [filteredEvents]);

  const chartSlotEventOrder = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      for (const e of g.list) {
        if (!isActualOnlyIndicator(e.name)) ids.push(e.id);
      }
    }
    return ids;
  }, [groups]);

  const chartSlotOrderRef = useRef<string[]>([]);
  const tinyLoadedRef = useRef<Record<string, boolean>>({});
  const tinyFailedRef = useRef<Record<string, boolean>>({});
  const tinyVisibleRef = useRef<Set<string>>(new Set());
  const tinyRevealedRef = useRef<Set<string>>(new Set());
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    chartSlotOrderRef.current = chartSlotEventOrder;
  }, [chartSlotEventOrder]);

  useLayoutEffect(() => {
    tinyLoadedRef.current = tinyLoadedByRowId;
  }, [tinyLoadedByRowId]);

  useLayoutEffect(() => {
    tinyFailedRef.current = tinyFailedByRowId;
  }, [tinyFailedByRowId]);

  useLayoutEffect(() => {
    tinyVisibleRef.current = visibleChartSlotIds;
  }, [visibleChartSlotIds]);

  useLayoutEffect(() => {
    tinyRevealedRef.current = new Set(
      Object.entries(tinyRevealedByRowId)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
  }, [tinyRevealedByRowId]);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current != null) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const kickRevealChain = useCallback(() => {
    if (revealTimerRef.current != null) return;

    const step = () => {
      const order = chartSlotOrderRef.current;
      const next = order.find(
        (id) =>
          !!tinyLoadedRef.current[id] &&
          tinyVisibleRef.current.has(id) &&
          !tinyRevealedRef.current.has(id) &&
          !tinyFailedRef.current[id],
      );
      if (!next) {
        revealTimerRef.current = null;
        return;
      }
      tinyRevealedRef.current.add(next);
      setTinyRevealedByRowId((prev) => ({ ...prev, [next]: true }));
      revealTimerRef.current = window.setTimeout(step, MACRO_CHART_REVEAL_MS);
    };

    revealTimerRef.current = window.setTimeout(step, 0);
  }, []);

  const onMacroPeriodStartChange = (value: string) => {
    if (!value) return;
    setPeriodFrom(value);
    setPeriodTo((prev) => {
      if (!prev) return value;
      return prev >= value ? prev : value;
    });
  };

  const onMacroPeriodEndChange = (value: string) => {
    if (!value) return;
    setPeriodTo(value);
    setPeriodFrom((prev) => {
      if (!prev) return value;
      return prev <= value ? prev : value;
    });
  };

  const onMacroPeriodPresetChange = (value: string) => {
    const preset = value as MacroPeriodPreset;
    setPeriodPreset(preset);
    setPeriodMenuOpen(false);
    const range = getMacroPresetRange(preset);
    if (range) {
      setPeriodFrom(range.from);
      setPeriodTo(range.to);
    }
  };

  const onMacroImportanceChange = (value: string) => {
    setImportanceFilter(value);
    setImportanceMenuOpen(false);
  };

  const onMacroCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setCategoryMenuOpen(false);
  };

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const from = new Date(`${periodFrom}T00:00:00`);
    const to = new Date(`${periodTo}T23:59:59`);
    try {
      const r = await fetchMacroEvents({ from, to, locale: "ru" });
      setEvents(r.events ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [periodFrom, periodTo]);

  const openCustomRangePicker = () => {
    tryShowDatePicker(periodStartRef.current);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    void loadEvents();
  }, [open, loadEvents]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
          void loadEvents();
        }
        previousActiveCount = nextCount;
      } catch {
        if (!cancelled) setReleaseLoadingIds(new Set());
      } finally {
        if (!cancelled) {
          const delay = pickReleaseStatusPollDelay(events, previousActiveCount, new Date());
          timer = window.setTimeout(() => void poll(), delay);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [open, loadEvents, events]);

  useEffect(() => {
    if (open) return;
    clearRevealTimer();
    tinyRevealedRef.current.clear();
    setTinyLoadedByRowId({});
    setPreviewLoadedByRowId({});
    setTinyFailedByRowId({});
    setPreviewFailedByRowId({});
    setTinyRevealedByRowId({});
    setVisibleChartSlotIds(new Set());
  }, [open, clearRevealTimer]);

  useLayoutEffect(() => {
    clearRevealTimer();
    tinyRevealedRef.current.clear();
    setTinyRevealedByRowId({});
    setTinyLoadedByRowId({});
    setTinyFailedByRowId({});
    setPreviewLoadedByRowId({});
    setPreviewFailedByRowId({});
    setVisibleChartSlotIds(new Set());
  }, [events, clearRevealTimer]);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveDay(ymdMsk(new Date()));
      return;
    }
    const today = ymdMsk(new Date());
    const hasToday = groups.some((g) => g.day === today);
    setActiveDay(hasToday ? today : groups[0]!.day);
  }, [groups]);

  const syncActiveDayWithScroll = () => {
    const container = bodyRef.current;
    if (!container || groups.length === 0) return;

    const anchor = container.scrollTop + MACRO_STICKY_HEADER_OFFSET;
    const dayNodes = Array.from(container.querySelectorAll<HTMLElement>(".macro-events-day[data-day]"));
    if (dayNodes.length === 0) return;

    let current = dayNodes[0]!.dataset.day ?? groups[0]!.day;
    for (const node of dayNodes) {
      if (node.offsetTop <= anchor) {
        current = node.dataset.day ?? current;
      } else {
        break;
      }
    }
    setActiveDay((prev) => (prev === current ? prev : current));
  };

  useEffect(() => {
    if (!open || groups.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      syncActiveDayWithScroll();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, groups]);

  useEffect(() => {
    if (!open || groups.length === 0) return;
    const container = bodyRef.current;
    if (!container) return;

    const today = ymdMsk(new Date());
    const todayNode = container.querySelector<HTMLElement>(`.macro-events-day[data-day="${today}"]`);
    if (!todayNode) return;

    const nextTop = Math.max(0, todayNode.offsetTop - MACRO_INITIAL_SCROLL_OFFSET);
    container.scrollTo({ top: nextTop, behavior: "auto" });
    setActiveDay(today);
  }, [open, groups]);

  useEffect(() => {
    if (!periodMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const node = periodMenuRef.current;
      const portal = periodMenuPortalRef.current;
      const target = e.target as Node;
      const clickedAnchor = !!node && node.contains(target);
      const clickedMenu = !!portal && portal.contains(target);
      if (!clickedAnchor && !clickedMenu) {
        setPeriodMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [periodMenuOpen]);

  useEffect(() => {
    if (!importanceMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const node = importanceMenuRef.current;
      const portal = importanceMenuPortalRef.current;
      const target = e.target as Node;
      const clickedAnchor = !!node && node.contains(target);
      const clickedMenu = !!portal && portal.contains(target);
      if (!clickedAnchor && !clickedMenu) {
        setImportanceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [importanceMenuOpen]);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const node = categoryMenuRef.current;
      const portal = categoryMenuPortalRef.current;
      const target = e.target as Node;
      const clickedAnchor = !!node && node.contains(target);
      const clickedMenu = !!portal && portal.contains(target);
      if (!clickedAnchor && !clickedMenu) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!open) return;
    if (!periodMenuOpen) {
      setPeriodMenuRect(null);
      return;
    }
    const el = periodMenuRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPeriodMenuRect({ left: r.left, top: r.bottom + 5, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, periodMenuOpen]);

  useEffect(() => {
    if (!open) return;
    if (!importanceMenuOpen) {
      setImportanceMenuRect(null);
      return;
    }
    const el = importanceMenuRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setImportanceMenuRect({ left: r.left, top: r.bottom + 5, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, importanceMenuOpen]);

  useEffect(() => {
    if (!open) return;
    if (!categoryMenuOpen) {
      setCategoryMenuRect(null);
      return;
    }
    const el = categoryMenuRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCategoryMenuRect({ left: r.left, top: r.bottom + 5, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, categoryMenuOpen]);

  useEffect(() => {
    if (categoryFilter === "all") return;
    if (!categoryOptions.some((opt) => opt.value === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (!open) return;
    const container = bodyRef.current;
    if (!container) return;

    const onScroll = () => syncActiveDayWithScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [open, groups]);

  useEffect(() => {
    return () => clearRevealTimer();
  }, [clearRevealTimer]);

  useEffect(() => {
    if (!open || loading) return;
    const root = bodyRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        setVisibleChartSlotIds((prev) => {
          const next = new Set(prev);
          for (const ent of entries) {
            const id = ent.target.getAttribute("data-macro-chart-slot");
            if (!id) continue;
            if (ent.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { root, rootMargin: "0px 0px 140px 0px", threshold: [0, 0.02] },
    );

    const observeAll = () => {
      root.querySelectorAll<HTMLElement>("[data-macro-chart-slot]").forEach((el) => io.observe(el));
    };

    observeAll();
    const raf = window.requestAnimationFrame(observeAll);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [open, loading, groups]);

  useLayoutEffect(() => {
    kickRevealChain();
  }, [kickRevealChain, visibleChartSlotIds, tinyLoadedByRowId, tinyFailedByRowId, chartSlotEventOrder]);

  if (!open) return null;
  if (typeof document === "undefined") return null;
  const now = new Date(nowTick);
  const nowMinute = mskMinuteKey(now);
  const nowSecond = Number(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Moscow",
      second: "2-digit",
      hour12: false,
    }).format(now),
  );

  return createPortal(
    <>
    {periodMenuOpen && periodMenuRect
      ? createPortal(
          <div
            ref={periodMenuPortalRef}
            className="portfolio-asset-select-menu portfolio-asset-select-menu-portal macro-events-period-menu"
            style={{ left: periodMenuRect.left, top: periodMenuRect.top, width: periodMenuRect.width }}
            role="listbox"
            aria-label="Период"
          >
            {MACRO_PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`portfolio-asset-option list-on-glass${periodPreset === preset.value ? " active portfolio-asset-option--active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onMacroPeriodPresetChange(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null}
    {importanceMenuOpen && importanceMenuRect
      ? createPortal(
          <div
            ref={importanceMenuPortalRef}
            className="portfolio-asset-select-menu portfolio-asset-select-menu-portal macro-events-period-menu macro-events-importance-menu"
            style={{ left: importanceMenuRect.left, top: importanceMenuRect.top, width: importanceMenuRect.width }}
            role="listbox"
            aria-label="Важность"
          >
            {MACRO_IMPORTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`portfolio-asset-option list-on-glass${importanceFilter === opt.value ? " active portfolio-asset-option--active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onMacroImportanceChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null}
    {categoryMenuOpen && categoryMenuRect
      ? createPortal(
          <div
            ref={categoryMenuPortalRef}
            className="portfolio-asset-select-menu portfolio-asset-select-menu-portal macro-events-period-menu macro-events-category-menu"
            style={{ left: categoryMenuRect.left, top: categoryMenuRect.top, width: categoryMenuRect.width }}
            role="listbox"
            aria-label="Категория"
          >
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`portfolio-asset-option list-on-glass${categoryFilter === opt.value ? " active portfolio-asset-option--active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onMacroCategoryChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null}
    <div
      className="asset-picker-overlay macro-events-overlay macro-events-overlay-with-filters"
      role="presentation"
    >
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="macro-events-title"
        className="asset-picker-dialog macro-events-dialog macro-events-dialog-with-filters"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="macro-events-main-panel">
          <div className="asset-picker-header macro-events-header">
            <div className="macro-events-header-grid">
              <div id="macro-events-title" className="macro-events-title">
                {formatMacroRussianDayTitle(new Date(`${activeDay}T00:00:00.000Z`))}
              </div>
              <span className="macro-events-table-num macro-events-table-num-1" aria-hidden>Актуальное</span>
              <span className="macro-events-table-num macro-events-table-num-2" aria-hidden>Предыдущее</span>
              <span className="macro-events-table-num macro-events-table-num-3" aria-hidden>Консенсус</span>
              <span className="macro-events-table-num macro-events-table-num-4" aria-hidden>Прогноз</span>
            </div>
            <div className="macro-events-header-actions">
              <button type="button" onClick={onClose} className="portfolio-icon-circle-btn" aria-label="Закрыть">
                <img src="/assets/portfolio-ui/close.svg" alt="" className="portfolio-ui-icon" />
              </button>
            </div>
          </div>

          <div className="macro-events-body" ref={bodyRef}>

          {loading ? <p className="macro-events-message">Загрузка…</p> : null}
          {!loading && err ? <p className="macro-events-message macro-events-message-error">{err}</p> : null}

          {!loading && !err && groups.length === 0 ? (
            <p className="macro-events-message">
              Событий за данный период нет. Попробуйте выбрать другие даты.
            </p>
          ) : null}

          {!loading && !err
            ? groups.map((g, idx) => (
                <div
                  key={g.day}
                  className="macro-events-day"
                  data-day={g.day}
                >
                  {idx > 0 ? (
                    <div className="macro-events-day-title">
                      {formatMacroRussianDayTitle(new Date(`${g.day}T00:00:00.000Z`))}
                    </div>
                  ) : null}
                  <ul className="macro-events-list">
                    {g.list.map((e) =>
                      (() => {
                        const inServerProgress = releaseLoadingIds.has(e.id);
                        const inPreFetchWindow =
                          !e.actual &&
                          nowSecond < 5 &&
                          mskMinuteKey(new Date(e.date)) === nowMinute;
                        const isActualLoading = inServerProgress || inPreFetchWindow;
                        return isActualOnlyIndicator(e.name) ? (
                        <li key={e.id} className="macro-events-row macro-events-row--actual-only">
                          <span className="macro-events-time">{fmtMacroEventTime(e.date)}</span>
                          <span className="macro-events-country">{countryShort(e.country)}</span>
                          <button
                            type="button"
                            className={`macro-events-name${isSpeechIndicator(e.name) ? " macro-events-name--disabled" : ""}`}
                            aria-label={`Индикатор: ${e.name}`}
                            title={e.name}
                            onClick={() => {
                              if (isSpeechIndicator(e.name)) return;
                              setSeriesIndicatorId(e.indicatorId);
                            }}
                          >
                            <span className="macro-events-name-main">{e.name}</span>
                            {e.reference ? <span className="macro-events-name-ref">{e.reference}</span> : null}
                          </button>
                          <div className="macro-events-cell macro-events-cell--actual-only">
                            {isActualLoading ? (
                              <span className="macro-events-cell-loading" aria-label="Загрузка значения">
                                …
                              </span>
                            ) : e.actual ? (
                              withMacroUnit(e.actual, e.unit)
                            ) : (
                              ""
                            )}
                          </div>
                        </li>
                      ) : (
                        <li key={e.id} className="macro-events-row">
                          <span className="macro-events-time">{fmtMacroEventTime(e.date)}</span>
                          <span className="macro-events-country">{countryShort(e.country)}</span>
                          <button
                            type="button"
                            className={`macro-events-name${isSpeechIndicator(e.name) ? " macro-events-name--disabled" : ""}`}
                            aria-label={`Индикатор: ${e.name}`}
                            title={e.name}
                            onClick={() => {
                              if (isSpeechIndicator(e.name)) return;
                              setSeriesIndicatorId(e.indicatorId);
                            }}
                          >
                            <span className="macro-events-name-main">{e.name}</span>
                            {e.reference ? <span className="macro-events-name-ref">{e.reference}</span> : null}
                          </button>
                          <div className="macro-events-cell">
                            {isNoValuesIndicator(e.name) ? (
                              ""
                            ) : isActualLoading ? (
                              <span className="macro-events-cell-loading" aria-label="Загрузка значения">
                                …
                              </span>
                            ) : (
                              withMacroUnit(e.actual, e.unit)
                            )}
                          </div>
                          <div className="macro-events-cell">
                            {isNoValuesIndicator(e.name) ? "" : withMacroUnit(e.previous, e.unit)}
                          </div>
                          <div className="macro-events-cell">{isNoValuesIndicator(e.name) ? "" : "—"}</div>
                          <div className="macro-events-cell">
                            {isNoValuesIndicator(e.name) ? "" : withMacroUnit(e.forecast, e.unit)}
                          </div>
                          {isNoValuesIndicator(e.name) ? (
                            <span className="macro-events-chart-slot-placeholder" aria-hidden="true" />
                          ) : (
                            <button
                              type="button"
                              className="macro-events-chart-slot"
                              data-macro-chart-slot={e.id}
                              aria-label={`График: ${e.name}`}
                              onClick={() => setSeriesIndicatorId(e.indicatorId)}
                            >
                              {!tinyLoadedByRowId[e.id] && !tinyFailedByRowId[e.id] ? (
                                <span className="macro-events-chart-slot-loading">…</span>
                              ) : null}
                              {tinyFailedByRowId[e.id] ? (
                                <span className="macro-events-chart-slot-loading">—</span>
                              ) : null}
                              <img
                                src={buildMacroSlotImageUrl({ indicatorId: e.indicatorId, mode: "tiny", width: 56, height: 24 })}
                                alt=""
                                aria-hidden="true"
                                className={`macro-events-slot-image${tinyRevealedByRowId[e.id] ? " is-revealed" : ""}`}
                                loading="eager"
                                decoding="async"
                                onLoad={() => setTinyLoadedByRowId((prev) => ({ ...prev, [e.id]: true }))}
                                onError={() => setTinyFailedByRowId((prev) => ({ ...prev, [e.id]: true }))}
                              />

                              {!previewFailedByRowId[e.id] ? (
                                <div className="macro-events-chart-hover" role="tooltip">
                                  <div className="macro-events-chart-hover-title">Последний год</div>
                                  <div className="macro-events-chart-hover-plot">
                                    {!previewLoadedByRowId[e.id] ? (
                                      <span className="macro-events-chart-slot-loading">…</span>
                                    ) : null}
                                    <img
                                      src={buildMacroSlotImageUrl({ indicatorId: e.indicatorId, mode: "preview", width: 204, height: 96 })}
                                      alt=""
                                      aria-hidden="true"
                                      className={`macro-events-preview-image${previewLoadedByRowId[e.id] ? " is-loaded" : ""}`}
                                      loading="lazy"
                                      decoding="async"
                                      onLoad={() => setPreviewLoadedByRowId((prev) => ({ ...prev, [e.id]: true }))}
                                      onError={() => setPreviewFailedByRowId((prev) => ({ ...prev, [e.id]: true }))}
                                    />
                                  </div>
                                  <div className="macro-events-chart-hover-note">
                                    К сожалению по этому индикатору исторические данные пока недоступны - но мы уже
                                    работаем над этим!
                                  </div>
                                </div>
                              ) : null}
                            </button>
                          )}
                        </li>
                      );
                      })(),
                    )}
                  </ul>
                </div>
              ))
            : null}
          </div>
        </div>

        <div className="macro-events-filters-popup" role="region" aria-label="Фильтры календаря">
            <div className="macro-events-filters-head">
              <span className="macro-events-filters-title">Фильтры</span>
            </div>

            <div className="macro-events-filters-form">
              <label className="portfolio-field portfolio-ghost-field is-floated macro-events-period-ghost">
                <span className="portfolio-ghost-label">Период</span>
                <div ref={periodMenuRef} className="portfolio-asset-combobox macro-events-period-combobox">
                  <input
                    type="text"
                    readOnly
                    value={MACRO_PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? "Текущий месяц"}
                    onClick={() => setPeriodMenuOpen((v) => !v)}
                    className="portfolio-input portfolio-input-ghost portfolio-asset-combobox-input macro-events-period-single"
                    aria-label="Выбор периода"
                  />
                  <img
                    src="/assets/portfolio-ui/arrow_down.svg"
                    alt=""
                    aria-hidden="true"
                    className="portfolio-asset-combobox-arrow"
                  />
                </div>
                {periodPreset === "custom" ? (
                  <div className="macro-events-custom-range">
                    <input
                      type="text"
                      readOnly
                      value={`${fmtRuShortYmd(periodFrom)} - ${fmtRuShortYmd(periodTo)}`}
                      onClick={() => openCustomRangePicker()}
                      className="portfolio-input portfolio-input-ghost macro-events-custom-date"
                      aria-label="Своя дата: выбрать диапазон"
                    />
                    <input
                      ref={periodStartRef}
                      type="date"
                      value={periodFrom}
                      max={periodTo || undefined}
                      onChange={(e) => {
                        onMacroPeriodStartChange(e.target.value);
                        window.setTimeout(() => tryShowDatePicker(periodEndRef.current), 0);
                      }}
                      className="macro-events-period-native"
                      tabIndex={-1}
                      title="Дата начала периода"
                    />
                    <input
                      ref={periodEndRef}
                      type="date"
                      value={periodTo}
                      min={periodFrom || undefined}
                      onChange={(e) => onMacroPeriodEndChange(e.target.value)}
                      className="macro-events-period-native"
                      tabIndex={-1}
                      title="Дата окончания периода"
                    />
                  </div>
                ) : null}
              </label>

              <label className="portfolio-field portfolio-ghost-field is-floated">
                <span className="portfolio-ghost-label">Важность</span>
                <div ref={importanceMenuRef} className="portfolio-asset-combobox macro-events-importance-combobox">
                  <input
                    type="text"
                    readOnly
                    value={MACRO_IMPORTANCE_OPTIONS.find((o) => o.value === importanceFilter)?.label ?? "Все"}
                    onClick={() => setImportanceMenuOpen((v) => !v)}
                    className="portfolio-input portfolio-input-ghost portfolio-asset-combobox-input macro-events-importance-select"
                    aria-label="Важность событий"
                  />
                  <img
                    src="/assets/portfolio-ui/arrow_down.svg"
                    alt=""
                    aria-hidden="true"
                    className="portfolio-asset-combobox-arrow"
                  />
                </div>
              </label>

              <label className="portfolio-field portfolio-ghost-field is-floated">
                <span className="portfolio-ghost-label">Категория</span>
                <div ref={categoryMenuRef} className="portfolio-asset-combobox macro-events-category-combobox">
                  <input
                    type="text"
                    readOnly
                    value={categoryOptions.find((o) => o.value === categoryFilter)?.label ?? "Все категории"}
                    onClick={() => setCategoryMenuOpen((v) => !v)}
                    className="portfolio-input portfolio-input-ghost portfolio-asset-combobox-input macro-events-category-select"
                    aria-label="Категория событий"
                  />
                  <img
                    src="/assets/portfolio-ui/arrow_down.svg"
                    alt=""
                    aria-hidden="true"
                    className="portfolio-asset-combobox-arrow"
                  />
                </div>
              </label>
            </div>
          </div>
      </div>
    </div>
    <MacroSeriesDetailModal
      open={seriesIndicatorId !== null}
      onClose={() => setSeriesIndicatorId(null)}
      indicatorId={seriesIndicatorId}
    />
    </>,
    document.body,
  );
}

