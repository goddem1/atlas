import type { WatchlistChangeDisplay, WatchlistChangePeriod } from "@atlas-v1/shared";
export type { WatchlistChangeDisplay, WatchlistChangePeriod };
export {
  DEFAULT_WATCHLIST_CHANGE_DISPLAY,
  DEFAULT_WATCHLIST_CHANGE_PERIOD,
} from "@atlas-v1/shared";

export const WATCHLIST_SETTINGS_DIALOG_READY_EVENT = "watchlist-settings-dialog-ready";

export const WATCHLIST_CHANGE_DISPLAY_OPTIONS: {
  value: WatchlistChangeDisplay;
  label: string;
}[] = [
  { value: "both", label: "Пункты и проценты" },
  { value: "points", label: "Пункты" },
  { value: "percent", label: "Проценты" },
  { value: "none", label: "Ничего" },
];

export const WATCHLIST_CHANGE_PERIOD_OPTIONS: {
  value: WatchlistChangePeriod;
  label: string;
}[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
];

export function candleDaysForWatchlistPeriod(period: WatchlistChangePeriod): number {
  if (period === "week") return 8;
  if (period === "month") return 31;
  return 2;
}
