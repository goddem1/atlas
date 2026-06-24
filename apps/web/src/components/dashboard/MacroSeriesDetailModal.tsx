import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MacroSeriesPointDto } from "@atlas-v1/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchMacroSeries } from "../../services/api";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import { hasTempAlertMark } from "../../lib/macroEventUi";
import "./macro-series-detail-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  indicatorId: string | null;
};

type SeriesRange = "1y" | "3y" | "5y" | "max";

const RANGE_PRESETS: Array<{ value: SeriesRange; label: string }> = [
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
  { value: "max", label: "Max" },
];

const EN_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX = new Map(EN_MONTH_SHORT.map((m, i) => [m.toLowerCase(), i]));
const POSITIVE_BAR_COLOR = "#60a5fa";
const NEGATIVE_BAR_COLOR = "#FF7977";
const SERIES_TABLE_COL_WIDTHS = ["22%", "20%", "18%", "20%", "20%"] as const;

function fmtRuDmy(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
}

function xLabelForPoint(p: MacroSeriesPointDto): string {
  if (p.reference) {
    const ref = p.reference.trim();
    // Если в БД уже есть год (например, Jan 2026), сохраняем его.
    if (/^[A-Za-z]{3}\s+\d{4}$/.test(ref)) return ref;
    const idx = EN_MONTH_SHORT.findIndex((x) => x.toLowerCase() === ref.slice(0, 3).toLowerCase());
    if (idx >= 0) return EN_MONTH_SHORT[idx]!;
    return ref;
  }
  const d = new Date(p.date);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Ключ оси X по периоду данных (reference), а не по дате публикации.
 * Если в reference нет года, вычисляем его относительно даты публикации:
 * например, release Jan 2026 + reference Dec => period Dec 2025.
 */
function axisKeyFromPeriod(reference: string | null, releaseIso: string): string {
  const release = new Date(releaseIso);
  if (!Number.isFinite(release.getTime())) {
    return (reference ?? "").trim() || releaseIso;
  }

  const releaseMonth = release.getUTCMonth();
  const releaseYear = release.getUTCFullYear();
  const refRaw = (reference ?? "").trim();

  if (/^[A-Za-z]{3}\s+\d{4}$/.test(refRaw)) return refRaw;

  if (/^[A-Za-z]{3}$/.test(refRaw)) {
    const refMonth = MONTH_INDEX.get(refRaw.toLowerCase());
    if (refMonth == null) return refRaw;
    const periodYear = refMonth > releaseMonth ? releaseYear - 1 : releaseYear;
    return `${EN_MONTH_SHORT[refMonth]} ${periodYear}`;
  }

  return refRaw || release.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function axisTickLabel(value: string | number): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Во всех диапазонах январь показываем с годом: Jan 2026.
  if (/^Jan\s+\d{4}$/i.test(raw)) return raw;
  const [month] = raw.split(/\s+/);
  return month ?? raw;
}

function cutoffDate(range: SeriesRange): Date | null {
  if (range === "max") return null;
  const c = new Date();
  const years = range === "1y" ? 1 : range === "3y" ? 3 : 5;
  c.setFullYear(c.getFullYear() - years);
  return c;
}

function parseActual(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number.parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatYAxisTick(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

function withUnit(value: string | null, unit: string): string {
  if (!value) return "—";
  const raw = value.trim();
  const suffix = unit?.trim() ?? "";
  if (suffix === "$B") {
    const sign = raw.startsWith("-") ? "-" : raw.startsWith("+") ? "+" : "";
    const abs = sign ? raw.slice(1) : raw;
    return `${sign}$${abs}B`;
  }
  return suffix ? `${value}${suffix}` : value;
}

function isWeeklyFrequency(frequency: string): boolean {
  const f = frequency.trim().toLowerCase();
  return f === "weekly" || f === "week" || f.includes("week");
}

export function MacroSeriesDetailModal({ open, onClose, indicatorId }: Props) {
  useBackdropBlurPause(open);
  const [range, setRange] = useState<SeriesRange>("1y");
  const [showAllTableRows, setShowAllTableRows] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [frequency, setFrequency] = useState("");
  const [points, setPoints] = useState<MacroSeriesPointDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const maxScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRange("1y");
      setShowAllTableRows(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !indicatorId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchMacroSeries({ indicatorId, locale: "ru" })
      .then((r) => {
        if (cancelled) return;
        setTitle(r.indicator.name);
        setUnit(r.indicator.unit);
        setFrequency(r.indicator.frequency ?? "");
        setPoints(r.points ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Ошибка загрузки");
        setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, indicatorId]);

  const filtered = useMemo(() => {
    const cut = cutoffDate(range);
    if (!cut) return points;
    return points.filter((p) => new Date(p.date) >= cut);
  }, [points, range]);

  const chartPoints = useMemo(() => {
    return filtered.filter((p) => parseActual(p.actual) != null);
  }, [filtered]);

  const weekly = useMemo(() => isWeeklyFrequency(frequency), [frequency]);

  const chartData = useMemo(() => {
    return chartPoints.map((p) => {
      const label = xLabelForPoint(p);
      const axisKey = axisKeyFromPeriod(p.reference, p.date);
      return {
        id: p.id,
        label,
        /** В подсказке только ref периода (без даты публикации точки). */
        tooltipLabel: axisKey,
        axisKey,
        dateIso: p.date,
        value: parseActual(p.actual) ?? 0,
      };
    });
  }, [chartPoints]);

  const axisTicks = useMemo(() => {
    if (chartData.length === 0) return [] as string[];

    if (range === "max") {
      const ticks: string[] = [];
      let prevYear: number | null = null;
      for (const row of chartData) {
        const y = new Date(row.dateIso).getUTCFullYear();
        if (prevYear !== y) {
          prevYear = y;
          ticks.push(row.dateIso);
        }
      }
      const lastDateIso = chartData[chartData.length - 1]?.dateIso;
      if (lastDateIso && ticks[ticks.length - 1] !== lastDateIso) {
        ticks.push(lastDateIso);
      }
      return ticks;
    }

    if (weekly) {
      if (range === "1y") {
        const keys: string[] = [];
        chartData.forEach((row, i) => {
          if ((i + 1) % 10 === 0) keys.push(row.axisKey);
        });
        const uniq = [...new Set(keys)];
        if (uniq.length > 0) return uniq;
        return chartData.length <= 2
          ? chartData.map((r) => r.axisKey)
          : [chartData[0]!.axisKey, chartData[chartData.length - 1]!.axisKey].filter(
              (v, i, a) => a.indexOf(v) === i,
            );
      }
      if (range === "3y" || range === "5y") {
        const ticks: string[] = [];
        let prevYear: number | null = null;
        for (const row of chartData) {
          const y = new Date(row.dateIso).getUTCFullYear();
          if (prevYear !== y) {
            prevYear = y;
            ticks.push(row.axisKey);
          }
        }
        return ticks;
      }
    }

    const byRange: Record<SeriesRange, Set<string>> = {
      "1y": new Set(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
      "3y": new Set(["Jan", "Apr", "Jul", "Oct"]),
      "5y": new Set(["Jan", "Jul"]),
      "max": new Set(["Jan", "Jun"]),
    };
    const allowedMonths = byRange[range];

    const ticks = chartData
      .map((row) => row.axisKey)
      .filter((axisKey) => {
        const month = axisKey.split(/\s+/)[0] ?? "";
        return allowedMonths.has(month);
      });

    if (ticks.length > 0) return ticks;
    return chartData.map((row) => row.axisKey);
  }, [chartData, range, weekly]);

  const xTickFormatter = useMemo(() => {
    return (value: string | number) => {
      const raw = String(value ?? "").trim();
      if (range === "max") {
        const dt = new Date(raw);
        if (Number.isFinite(dt.getTime())) return String(dt.getUTCFullYear());
        const maybeYear = raw.match(/\b(19|20)\d{2}\b/);
        return maybeYear?.[0] ?? "";
      }
      if (weekly && (range === "3y" || range === "5y")) {
        const row = chartData.find((r) => r.axisKey === raw);
        if (row?.dateIso) return String(new Date(row.dateIso).getUTCFullYear());
      }
      return axisTickLabel(raw);
    };
  }, [weekly, range, chartData]);

  /** Число точек за последние 5 лет (как у пресета 5Y) — для ширины столбцов в режиме Max. */
  const barsCount5y = useMemo(() => {
    const cut = cutoffDate("5y");
    if (!cut) return 0;
    return points.filter((p) => new Date(p.date) >= cut && parseActual(p.actual) != null).length;
  }, [points]);

  const { yDomainMin, yDomainMax, yTickMin, yTickMax } = useMemo(() => {
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of chartPoints) {
      const v = parseActual(p.actual);
      if (v == null) continue;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
      return { yDomainMin: -1, yDomainMax: 1, yTickMin: 0, yTickMax: 1 };
    }
    if (minV === maxV) {
      const pad = Math.max(Math.abs(minV) * 0.05, 0.02);
      return { yDomainMin: minV - pad, yDomainMax: maxV + pad, yTickMin: minV, yTickMax: maxV };
    }
    const span = maxV - minV;
    const pad = Math.max(span * 0.08, 0.02);
    const lo = minV - pad;
    const hi = maxV + pad;
    return { yDomainMin: lo, yDomainMax: hi, yTickMin: minV, yTickMax: maxV };
  }, [chartPoints]);

  const yAxisTicks = useMemo(() => {
    if (!Number.isFinite(yTickMin) || !Number.isFinite(yTickMax)) return [0, 1];
    if (yTickMin === yTickMax) return [yTickMin];
    const span = yTickMax - yTickMin;
    const step = span / 4;
    return [yTickMin, yTickMin + step, yTickMin + step * 2, yTickMin + step * 3, yTickMax];
  }, [yTickMin, yTickMax]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId(filtered[filtered.length - 1]!.id);
  }, [filtered]);

  const selectedIndex = useMemo(() => {
    if (filtered.length === 0) return -1;
    const idx = selectedId ? filtered.findIndex((row) => row.id === selectedId) : -1;
    return idx >= 0 ? idx : filtered.length - 1;
  }, [filtered, selectedId]);

  const compactTableRows = useMemo(() => {
    if (selectedIndex < 0) return [] as Array<{ key: string; row: MacroSeriesPointDto | null; kind: "future" | "current" | "past" }>;
    return [
      { key: "future", row: filtered[selectedIndex + 1] ?? null, kind: "future" as const },
      { key: "current", row: filtered[selectedIndex] ?? null, kind: "current" as const },
      { key: "past", row: filtered[selectedIndex - 1] ?? null, kind: "past" as const },
    ];
  }, [filtered, selectedIndex]);

  const tableRows = useMemo(() => {
    if (showAllTableRows) {
      return [...filtered]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((row) => ({ key: row.id, row, kind: "current" as const }));
    }
    return compactTableRows;
  }, [showAllTableRows, filtered, compactTableRows]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const nBars = chartData.length;
  const plotWidthPx = 520;

  const sizingNBars = range === "max" ? Math.max(barsCount5y, 1) : Math.max(nBars, 1);
  const barMaxSize = Math.max(2, Math.min(48, Math.floor((plotWidthPx / sizingNBars) * 0.72)));

  // Фиксируем геометрию оси X, чтобы график не "прыгал" между диапазонами.
  const xAxisTickFontSize = 10;
  const xAxisHeight = 20;
  const chartBottomMargin = 2;

  const chartScrollMinWidth =
    range === "max" && nBars > 0 ? Math.max(plotWidthPx, Math.ceil((nBars / sizingNBars) * plotWidthPx)) : undefined;
  const xAxisDataKey = range === "max" ? "dateIso" : "axisKey";
  const shouldShowNoHistoryNote = title.trim().length > 0 && !hasTempAlertMark(title);

  useEffect(() => {
    if (range !== "max") return;
    const el = maxScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [range, chartScrollMinWidth, chartData.length]);

  if (!open || !indicatorId) return null;

  return createPortal(
    <div className="macro-series-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="macro-series-dialog" role="dialog" aria-modal="true" aria-labelledby="macro-series-title">
        <div className="macro-series-head">
          <span className="macro-series-head-icon" aria-hidden>
            <img src="/assets/portfolio-ui/info.svg" alt="" className="macro-series-head-icon-img" />
          </span>
          <h2 id="macro-series-title" className="macro-series-title">
            {title || "…"}
          </h2>
          <button type="button" className="macro-series-close" aria-label="Закрыть" onClick={onClose}>
            <img src="/assets/portfolio-ui/close.svg" alt="" className="macro-series-close-img" />
          </button>
        </div>

        <div className="macro-series-chart-block">
          <div className="macro-series-chart-toolbar">
            <div className="macro-series-range" role="tablist" aria-label="Период графика">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="tab"
                  aria-selected={range === p.value}
                  className={`macro-series-range-btn${range === p.value ? " is-active" : ""}`}
                  onClick={() => setRange(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="macro-series-msg">Загрузка…</p> : null}
          {!loading && err ? <p className="macro-series-msg macro-series-msg-error">{err}</p> : null}

          {!loading && !err && chartPoints.length === 0 ? (
            <p className="macro-series-msg">Нет данных для графика в выбранном диапазоне.</p>
          ) : null}

          {!loading && !err && chartData.length > 0 ? (
            <div className="macro-series-recharts-wrap">
              <div
                ref={maxScrollRef}
                className={`macro-series-recharts-scroll${range === "max" ? " macro-series-recharts-scroll--full" : ""}`}
              >
                <div
                  className="macro-series-recharts-inner"
                  style={
                    range === "max" && chartScrollMinWidth != null
                      ? { minWidth: chartScrollMinWidth, width: chartScrollMinWidth }
                      : undefined
                  }
                >
                  <ResponsiveContainer width="100%" height={238} minWidth={1} minHeight={200}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 2, right: 2, left: 0, bottom: chartBottomMargin }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey={xAxisDataKey}
                        ticks={axisTicks}
                        tickFormatter={xTickFormatter}
                        tick={{ fill: "#64748b", fontSize: xAxisTickFontSize }}
                        stroke="#cbd5e1"
                        interval={range === "max" ? "preserveStartEnd" : 0}
                        minTickGap={range === "max" ? 28 : 2}
                        angle={0}
                        textAnchor="middle"
                        height={xAxisHeight}
                        tickMargin={2}
                      />
                      <YAxis
                        domain={[yDomainMin, yDomainMax]}
                        ticks={yAxisTicks}
                        tickFormatter={formatYAxisTick}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        stroke="#cbd5e1"
                        width={52}
                      />
                      <Tooltip
                        formatter={(value) => {
                          const suffix = (unit ?? "").trim();
                          if (value === undefined || value === null) return ["—", title || "Значение"];
                          const n = typeof value === "number" ? value : Number(value);
                          return [`${Number.isFinite(n) ? n : value}${suffix}`, title || "Значение"];
                        }}
                        labelFormatter={(_label, payload) => {
                          const first = payload?.[0]?.payload as
                            | { tooltipLabel?: string; label?: string }
                            | undefined;
                          return first?.tooltipLabel ?? first?.label ?? String(_label);
                        }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          fontSize: 13,
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={barMaxSize}>
                        {chartData.map((row) => (
                          <Cell
                            key={row.id}
                            fill={row.value < 0 ? NEGATIVE_BAR_COLOR : POSITIVE_BAR_COLOR}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
          {!loading && !err && shouldShowNoHistoryNote ? (
            <p className="macro-series-note">
              К сожалению по этому индикатору исторические данные пока недоступны - скоро мы исправим это!
            </p>
          ) : null}
        </div>

        <div className="macro-series-table-sep" />

        <div className="macro-series-table-wrap">
          <div className="macro-series-table-head-wrap">
            <table className="macro-series-table macro-series-table-head-table">
              <colgroup>
                {SERIES_TABLE_COL_WIDTHS.map((w, i) => (
                  <col key={`macro-series-head-col-${i}`} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="macro-series-table-head">
                <tr className="macro-series-table-head-row">
                  <th scope="col">Дата</th>
                  <th scope="col">Период</th>
                  <th scope="col">Факт</th>
                  <th scope="col">Предыдущее</th>
                  <th scope="col">Прогноз</th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="macro-series-table-scroll">
            <table className="macro-series-table macro-series-table-body-table">
              <colgroup>
                {SERIES_TABLE_COL_WIDTHS.map((w, i) => (
                  <col key={`macro-series-body-col-${i}`} style={{ width: w }} />
                ))}
              </colgroup>
              <tbody className="macro-series-table-body">
                {tableRows.map(({ key, row, kind }) => (
                  <tr
                    key={key}
                    className={`macro-series-table-row${row?.id && selectedId === row.id ? " is-selected" : ""}`}
                    onClick={() => row?.id && setSelectedId(row.id)}
                  >
                    <td>
                      {row ? fmtRuDmy(row.date) : kind === "future" ? "Будущее" : kind === "past" ? "Прошлое" : "Текущее"}
                    </td>
                    <td>{row ? axisKeyFromPeriod(row.reference, row.date) : "—"}</td>
                    <td>{row ? withUnit(row.actual, unit) : "—"}</td>
                    <td>{row ? withUnit(row.previous, unit) : "—"}</td>
                    <td>{row ? withUnit(row.forecast, unit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 3 ? (
            <button
              type="button"
              className="macro-series-table-toggle"
              onClick={() => setShowAllTableRows((v) => !v)}
            >
              {showAllTableRows ? "Скрыть" : "Показать еще"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
