import { useEffect, useMemo, useRef, useState } from "react";
import type { CandleApiRow, CryptocurrencyListItem, WatchlistListData } from "@atlas-v1/shared";
import { formatPriceTicker, percentChangeLast } from "../../../lib/formatChart";
import { fetchCandles } from "../../../services/api";
import { pairForCryptocurrency } from "./atlasCryptoDatafeed";
import { generateBtcTestCandleRows, isBtcTestKlinePair } from "./btcKlineTestSeries";

const POLL_MS = 30 * 1000;
const SELECTED_LISTS_STORAGE_KEY = "atlas.price-kline-coin-list-ids.v1";

export type PriceKlineCoinRow = {
  crypto: CryptocurrencyListItem;
  price: number | null;
  changePercent: number;
  changeAbs: number;
};

export type PriceKlineWatchlistOption = Pick<WatchlistListData, "id" | "title" | "symbols">;

type Props = {
  lists: PriceKlineWatchlistOption[];
  catalog: CryptocurrencyListItem[];
  activeSymbol: string;
  onSelect: (item: CryptocurrencyListItem) => void;
};

function formatChangePercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return `${abs.toFixed(digits)}%`;
}

function formatChangeAbs(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatPriceTicker(Math.abs(value));
}

function formatListsTitle(selected: PriceKlineWatchlistOption[], total: number): string {
  if (selected.length === 0) return "Списки";
  if (selected.length === 1) return selected[0]!.title;
  if (selected.length === total) return "Все списки";
  const n = selected.length;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} список`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} списка`;
  return `${n} списков`;
}

function loadStoredListIds(availableIds: string[]): string[] | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_LISTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const available = new Set(availableIds);
    return parsed.filter((id): id is string => typeof id === "string" && available.has(id));
  } catch {
    return null;
  }
}

function saveStoredListIds(ids: string[]): void {
  try {
    window.localStorage.setItem(SELECTED_LISTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

async function loadCoinCandles(item: CryptocurrencyListItem): Promise<CandleApiRow[]> {
  const pair = pairForCryptocurrency(item);
  if (isBtcTestKlinePair(pair)) {
    return generateBtcTestCandleRows(3).slice(-3);
  }
  return fetchCandles(pair, 2);
}

function rowFromCandles(item: CryptocurrencyListItem, candles: CandleApiRow[]): PriceKlineCoinRow {
  const closes = candles.map((row) => Number.parseFloat(row.close)).filter(Number.isFinite);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const price = last ?? null;
  const changeAbs = last !== undefined && prev !== undefined ? last - prev : 0;
  const changePercent =
    last !== undefined && prev !== undefined ? percentChangeLast(prev, last) : 0;

  return {
    crypto: item,
    price,
    changePercent,
    changeAbs,
  };
}

function resolveItems(
  lists: PriceKlineWatchlistOption[],
  selectedIds: string[],
  catalog: CryptocurrencyListItem[],
): CryptocurrencyListItem[] {
  const selected = new Set(selectedIds);
  const bySymbol = new Map(
    catalog.map((crypto) => [crypto.symbol.toUpperCase(), crypto] as const),
  );
  const seen = new Set<string>();
  const out: CryptocurrencyListItem[] = [];
  for (const list of lists) {
    if (!selected.has(list.id)) continue;
    for (const symbol of list.symbols) {
      const key = symbol.toUpperCase();
      if (seen.has(key)) continue;
      const crypto = bySymbol.get(key);
      if (!crypto) continue;
      seen.add(key);
      out.push(crypto);
    }
  }
  return out;
}

export function PriceKlineCoinList({
  lists,
  catalog,
  activeSymbol,
  onSelect,
}: Props) {
  const [rows, setRows] = useState<PriceKlineCoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const listIdsKey = useMemo(() => lists.map((list) => list.id).join("\0"), [lists]);

  const [selectedListIds, setSelectedListIds] = useState<string[]>(() =>
    lists.map((list) => list.id),
  );

  useEffect(() => {
    const availableIds = lists.map((list) => list.id);
    const stored = loadStoredListIds(availableIds);
    if (stored && stored.length > 0) {
      setSelectedListIds(stored);
      return;
    }
    setSelectedListIds(availableIds);
  }, [listIdsKey, lists]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  const selectedLists = useMemo(
    () => lists.filter((list) => selectedListIds.includes(list.id)),
    [lists, selectedListIds],
  );

  const items = useMemo(
    () => resolveItems(lists, selectedListIds, catalog),
    [lists, selectedListIds, catalog],
  );

  const headerTitle = formatListsTitle(selectedLists, lists.length);
  const canPickLists = lists.length > 1;

  const itemsKey = useMemo(
    () => items.map((item) => item.symbol).join("\0"),
    [items],
  );

  useEffect(() => {
    if (items.length === 0) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      setError(null);

      try {
        const nextRows = await Promise.all(
          items.map(async (item) => {
            const candles = await loadCoinCandles(item);
            return rowFromCandles(item, candles);
          }),
        );
        if (!cancelled) {
          setRows(nextRows);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить цены");
          setLoading(false);
        }
      }
    };

    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [itemsKey, items]);

  const toggleList = (id: string) => {
    setSelectedListIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      const ordered = lists.map((list) => list.id).filter((listId) => next.includes(listId));
      saveStoredListIds(ordered);
      return ordered;
    });
  };

  const active = activeSymbol.trim().toUpperCase();

  return (
    <aside className="atlas-glass price-kline-coin-list" aria-label="Список монет">
      <div className="price-kline-coin-list-head">
        <div className="price-kline-coin-list-title-wrap">
          {canPickLists ? (
            <button
              ref={triggerRef}
              type="button"
              className="price-kline-coin-list-title-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className="price-kline-coin-list-title">{headerTitle}</span>
              <img
                src="/assets/portfolio-ui/arrow_down.svg"
                alt=""
                className={`price-kline-coin-list-title-chevron${menuOpen ? " is-open" : ""}`}
              />
            </button>
          ) : (
            <span className="price-kline-coin-list-title">
              {lists[0]?.title ?? "Список"}
            </span>
          )}

          {canPickLists && menuOpen ? (
            <div
              ref={menuRef}
              className="price-kline-coin-list-menu atlas-glass"
              role="menu"
              aria-label="Выбор списков"
            >
              {lists.map((list) => {
                const checked = selectedListIds.includes(list.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className={`price-kline-coin-list-menu-item${checked ? " is-checked" : ""}`}
                    onClick={() => toggleList(list.id)}
                  >
                    <span
                      className={`price-kline-coin-list-menu-check${checked ? " is-checked" : ""}`}
                      aria-hidden
                    />
                    <span className="price-kline-coin-list-menu-label">{list.title}</span>
                    <span className="price-kline-coin-list-menu-count">{list.symbols.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="price-kline-coin-list-divider" />

      {loading && rows.length === 0 ? (
        <p className="price-kline-coin-list-msg">Загрузка…</p>
      ) : null}
      {error ? <p className="price-kline-coin-list-msg price-kline-coin-list-msg--err">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="price-kline-coin-list-msg">
          {selectedListIds.length === 0
            ? "Выберите хотя бы один список"
            : "Добавьте монеты в виджет «Список»"}
        </p>
      ) : null}

      <ul className="price-kline-coin-list-rows">
        {rows.map((row) => {
          const isActive = row.crypto.symbol.toUpperCase() === active;
          const up = row.changePercent > 0;
          const down = row.changePercent < 0;
          const changeClass = up
            ? "price-kline-coin-change--up"
            : down
              ? "price-kline-coin-change--down"
              : "price-kline-coin-change--flat";

          return (
            <li key={row.crypto.symbol}>
              <button
                type="button"
                className={`price-kline-coin-row${isActive ? " is-active" : ""}`}
                onClick={() => onSelect(row.crypto)}
                aria-current={isActive ? "true" : undefined}
              >
                <span className="price-kline-coin-asset">
                  {row.crypto.iconUrl ? (
                    <img src={row.crypto.iconUrl} alt="" className="price-kline-coin-icon" />
                  ) : (
                    <span className="price-kline-coin-icon price-kline-coin-icon--fallback">
                      {row.crypto.symbol.slice(0, 1)}
                    </span>
                  )}
                  <span className="price-kline-coin-symbol">{row.crypto.symbol}</span>
                </span>
                <span className="price-kline-coin-price">
                  {row.price != null && Number.isFinite(row.price)
                    ? formatPriceTicker(row.price)
                    : "—"}
                </span>
                <span className={`price-kline-coin-change ${changeClass}`}>
                  <span>{formatChangePercent(row.changePercent)}</span>
                  <span>{formatChangeAbs(row.changeAbs)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
