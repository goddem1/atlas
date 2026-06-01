import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBondsYieldCurveDatesForMonth, type BondsYieldDateBounds } from "../../../services/api";
import "./fed-curve-date-calendar.css";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function utcDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthCacheKey(year: number, month: number): string {
  return `${year}-${month}`;
}

type Props = {
  open: boolean;
  bounds: BondsYieldDateBounds | null;
  selectedDate: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

export function FedCurveDateCalendar({ open, bounds, selectedDate, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const monthCacheRef = useRef<Map<string, Map<string, string>>>(new Map());
  const [monthCache, setMonthCache] = useState<Map<string, Map<string, string>>>(new Map());
  const [monthLoading, setMonthLoading] = useState(false);

  const minBound = bounds?.min ? new Date(bounds.min) : null;
  const maxBound = bounds?.max ? new Date(bounds.max) : null;

  const initialView = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate) : maxBound ?? new Date();
    if (Number.isNaN(base.getTime())) {
      const now = new Date();
      return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
    }
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() };
  }, [selectedDate, bounds?.min, bounds?.max]);

  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  useEffect(() => {
    if (!open) return;
    setViewYear(initialView.year);
    setViewMonth(initialView.month);
    monthCacheRef.current = new Map();
    setMonthCache(new Map());
  }, [open, initialView.year, initialView.month]);

  const loadMonth = useCallback(async (year: number, month: number) => {
    const key = monthCacheKey(year, month);
    if (monthCacheRef.current.has(key)) return;

    setMonthLoading(true);
    try {
      const dates = await fetchBondsYieldCurveDatesForMonth(year, month + 1);
      const map = new Map<string, string>();
      for (const iso of dates) {
        const k = utcDateKey(iso);
        if (k) map.set(k, iso);
      }
      monthCacheRef.current.set(key, map);
      setMonthCache(new Map(monthCacheRef.current));
    } finally {
      setMonthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadMonth(viewYear, viewMonth);
  }, [open, viewYear, viewMonth, loadMonth]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const dateByKey = monthCache.get(monthCacheKey(viewYear, viewMonth)) ?? new Map<string, string>();
  const selectedKey = selectedDate ? utcDateKey(selectedDate) : null;

  const canGoPrevMonth =
    !minBound ||
    viewYear > minBound.getUTCFullYear() ||
    (viewYear === minBound.getUTCFullYear() && viewMonth > minBound.getUTCMonth());

  const canGoNextMonth =
    !maxBound ||
    viewYear < maxBound.getUTCFullYear() ||
    (viewYear === maxBound.getUTCFullYear() && viewMonth < maxBound.getUTCMonth());

  const canGoPrevYear = !minBound || viewYear > minBound.getUTCFullYear();
  const canGoNextYear = !maxBound || viewYear < maxBound.getUTCFullYear();

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(viewYear, viewMonth, 1));
    const startPad = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();

    const cells: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const m = String(viewMonth + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      cells.push({ key: `${viewYear}-${m}-${d}`, day });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: Array<Array<{ key: string; day: number } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  };

  const shiftYear = (delta: number) => {
    const nextYear = viewYear + delta;
    if (minBound && nextYear < minBound.getUTCFullYear()) return;
    if (maxBound && nextYear > maxBound.getUTCFullYear()) return;
    setViewYear(nextYear);
    if (minBound && nextYear === minBound.getUTCFullYear() && viewMonth < minBound.getUTCMonth()) {
      setViewMonth(minBound.getUTCMonth());
    }
    if (maxBound && nextYear === maxBound.getUTCFullYear() && viewMonth > maxBound.getUTCMonth()) {
      setViewMonth(maxBound.getUTCMonth());
    }
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={`fed-curve-date-calendar atlas-glass${monthLoading ? " is-loading" : ""}`}
      role="dialog"
      aria-label="Выбор даты"
    >
      <div className="fed-curve-date-calendar-head">
        <button
          type="button"
          className="fed-curve-date-calendar-nav fed-curve-date-calendar-nav--year"
          disabled={!canGoPrevYear}
          aria-label="Предыдущий год"
          onClick={() => shiftYear(-1)}
        >
          «
        </button>
        <button
          type="button"
          className="fed-curve-date-calendar-nav"
          disabled={!canGoPrevMonth}
          aria-label="Предыдущий месяц"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <span className="fed-curve-date-calendar-month">{monthLabel(viewYear, viewMonth)}</span>
        <button
          type="button"
          className="fed-curve-date-calendar-nav"
          disabled={!canGoNextMonth}
          aria-label="Следующий месяц"
          onClick={() => shiftMonth(+1)}
        >
          ›
        </button>
        <button
          type="button"
          className="fed-curve-date-calendar-nav fed-curve-date-calendar-nav--year"
          disabled={!canGoNextYear}
          aria-label="Следующий год"
          onClick={() => shiftYear(1)}
        >
          »
        </button>
      </div>
      <div className="fed-curve-date-calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w} className="fed-curve-date-calendar-weekday">
            {w}
          </span>
        ))}
      </div>
      <div className="fed-curve-date-calendar-grid">
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            if (!cell) {
              return <span key={`${wi}-${di}-empty`} className="fed-curve-date-calendar-day is-empty" aria-hidden />;
            }
            const iso = dateByKey.get(cell.key);
            const available = iso !== undefined;
            const isSelected = available && cell.key === selectedKey;
            return (
              <button
                key={cell.key}
                type="button"
                className={`fed-curve-date-calendar-day${available ? "" : " is-disabled"}${isSelected ? " is-selected" : ""}`}
                disabled={!available || monthLoading}
                onClick={() => {
                  if (!iso) return;
                  onSelect(iso);
                  onClose();
                }}
              >
                {cell.day}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
