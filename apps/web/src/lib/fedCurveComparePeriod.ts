/** Допустимые смещения для серой линии (дней назад от последней даты). */
export const FED_CURVE_COMPARE_PERIOD_OPTIONS = [
  { days: 7, label: "1 неделя" },
  { days: 30, label: "1 месяц" },
  { days: 90, label: "3 месяца" },
  { days: 180, label: "6 месяцев" },
  { days: 365, label: "1 год" },
] as const;

export type FedCurveCompareDays = (typeof FED_CURVE_COMPARE_PERIOD_OPTIONS)[number]["days"];

export const FED_CURVE_DEFAULT_COMPARE_DAYS: FedCurveCompareDays = 30;

const ALLOWED = new Set<number>(FED_CURVE_COMPARE_PERIOD_OPTIONS.map((o) => o.days));

export function normalizeFedCurveCompareDays(raw: unknown): FedCurveCompareDays {
  if (typeof raw === "number" && Number.isFinite(raw) && ALLOWED.has(raw)) {
    return raw as FedCurveCompareDays;
  }
  return FED_CURVE_DEFAULT_COMPARE_DAYS;
}

export function fedCurveComparePeriodLabel(days: FedCurveCompareDays): string {
  return FED_CURVE_COMPARE_PERIOD_OPTIONS.find((o) => o.days === days)?.label ?? `${days} дн.`;
}
