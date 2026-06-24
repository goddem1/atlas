export interface WatchlistListData {
  id: string;
  title: string;
  symbols: string[];
}

export type WatchlistChangeDisplay = "both" | "points" | "percent" | "none";
export type WatchlistChangePeriod = "day" | "week" | "month";

export const DEFAULT_WATCHLIST_LIST_ID = "list-1";
export const WATCHLIST_MAX_SYMBOLS = 10;
export const DEFAULT_WATCHLIST_CHANGE_DISPLAY: WatchlistChangeDisplay = "both";
export const DEFAULT_WATCHLIST_CHANGE_PERIOD: WatchlistChangePeriod = "day";

const WATCHLIST_CHANGE_DISPLAY_VALUES = new Set<WatchlistChangeDisplay>([
  "both",
  "points",
  "percent",
  "none",
]);
const WATCHLIST_CHANGE_PERIOD_VALUES = new Set<WatchlistChangePeriod>(["day", "week", "month"]);

export function normalizeWatchlistChangeDisplay(raw: unknown): WatchlistChangeDisplay {
  return typeof raw === "string" && WATCHLIST_CHANGE_DISPLAY_VALUES.has(raw as WatchlistChangeDisplay)
    ? (raw as WatchlistChangeDisplay)
    : DEFAULT_WATCHLIST_CHANGE_DISPLAY;
}

export function normalizeWatchlistChangePeriod(raw: unknown): WatchlistChangePeriod {
  return typeof raw === "string" && WATCHLIST_CHANGE_PERIOD_VALUES.has(raw as WatchlistChangePeriod)
    ? (raw as WatchlistChangePeriod)
    : DEFAULT_WATCHLIST_CHANGE_PERIOD;
}

export function normalizeSymbolList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return capWatchlistSymbolList([
    ...new Set(
      raw
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]);
}

export function capWatchlistSymbolList(symbols: string[]): string[] {
  return symbols.slice(0, WATCHLIST_MAX_SYMBOLS);
}

export function normalizeWatchlistLists(raw: unknown): WatchlistListData[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WatchlistListData[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    const title = typeof o.title === "string" && o.title.trim().length > 0 ? o.title.trim() : null;
    if (!id || !title) continue;
    out.push({ id, title, symbols: normalizeSymbolList(o.symbols) });
  }
  return out.length > 0 ? out : undefined;
}

export function resolveWatchlistWidgetState(
  lists?: WatchlistListData[] | null,
  activeId?: string | null,
  legacySymbols?: string[] | null | undefined,
): { watchlistLists: WatchlistListData[]; activeWatchlistListId: string } {
  if (lists && lists.length > 0) {
    const watchlistLists = lists.map((list) => ({
      id: list.id,
      title: list.title,
      symbols: normalizeSymbolList(list.symbols),
    }));
    const firstList = watchlistLists[0];
    const activeWatchlistListId =
      activeId && watchlistLists.some((list) => list.id === activeId)
        ? activeId
        : (firstList?.id ?? DEFAULT_WATCHLIST_LIST_ID);
    return { watchlistLists, activeWatchlistListId };
  }

  const symbols = legacySymbols !== undefined && legacySymbols !== null ? normalizeSymbolList(legacySymbols) : [];
  return {
    watchlistLists: [{ id: DEFAULT_WATCHLIST_LIST_ID, title: "Список 1", symbols }],
    activeWatchlistListId: DEFAULT_WATCHLIST_LIST_ID,
  };
}
