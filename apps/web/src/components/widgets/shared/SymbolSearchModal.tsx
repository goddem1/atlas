import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { createPortal } from "react-dom";
import type { CryptocurrencyListItem, WatchlistListData } from "@atlas-v1/shared";
import { normalizeSymbolList, WATCHLIST_MAX_SYMBOLS } from "@atlas-v1/shared";
import { pairForCryptocurrency } from "../price-sparkline/atlasCryptoDatafeed";
import { isDashboardDarkTheme } from "../price-sparkline/candleKlineUtils";
import { useBackdropBlurPause } from "../../../lib/useBackdropBlurPause";
import "./symbol-search-modal.css";

const EXCHANGE_NAME = "Binance";
const EXCHANGE_LOGO = "https://s3-symbol-logo.tradingview.com/source/BINANCE.svg";
const MARKET_TYPE = "spot crypto";
/** Сколько строк рендерить сразу — полный каталог слишком тяжёлый для первого кадра. */
const LIST_PAGE_SIZE = 48;

type Props = {
  open: boolean;
  items: CryptocurrencyListItem[];
  loadError?: string | null;
  activeSymbol?: string | null;
  /** Внутри попапа графика — без портала в body, по центру родителя. */
  embedded?: boolean;
  watchlistLists?: WatchlistListData[];
  onWatchlistListsChange?: (lists: WatchlistListData[]) => void;
  onClose: () => void;
  onSelect: (c: CryptocurrencyListItem) => void;
};

type SearchRow = {
  crypto: CryptocurrencyListItem;
  pair: string;
  description: string;
};

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <em>{text.slice(index, index + q.length)}</em>
      {text.slice(index + q.length)}
    </>
  );
}

function formatDescription(crypto: CryptocurrencyListItem, pair: string): string {
  const quote = pair.replace(new RegExp(`^${crypto.symbol}`, "i"), "");
  if (quote && quote !== pair) {
    const normalizedQuote = quote === "USDT" ? "TetherUS" : quote;
    return `${crypto.symbol} / ${normalizedQuote}`;
  }
  if (crypto.name && crypto.name !== crypto.symbol) {
    return crypto.name;
  }
  return pair;
}

function symbolInList(list: WatchlistListData, symbol: string): boolean {
  const key = symbol.trim().toUpperCase();
  return list.symbols.some((item) => item.toUpperCase() === key);
}

function toggleSymbolInList(
  lists: WatchlistListData[],
  listId: string,
  symbol: string,
): WatchlistListData[] {
  const key = symbol.trim().toUpperCase();
  return lists.map((list) => {
    if (list.id !== listId) return list;
    if (symbolInList(list, key)) {
      return {
        ...list,
        symbols: list.symbols.filter((item) => item.toUpperCase() !== key),
      };
    }
    if (list.symbols.length >= WATCHLIST_MAX_SYMBOLS) return list;
    return {
      ...list,
      symbols: normalizeSymbolList([...list.symbols, key]),
    };
  });
}

export function SymbolSearchModal({
  open,
  items,
  loadError,
  activeSymbol,
  embedded = false,
  watchlistLists = [],
  onWatchlistListsChange,
  onClose,
  onSelect,
}: Props) {
  useBackdropBlurPause(open);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [bookmarkMenuSymbol, setBookmarkMenuSymbol] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const bookmarkMenuRef = useRef<HTMLDivElement>(null);

  const bookmarksEnabled = watchlistLists.length > 0 && Boolean(onWatchlistListsChange);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setVisibleCount(LIST_PAGE_SIZE);
      setBookmarkMenuSymbol(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (bookmarkMenuSymbol) {
        setBookmarkMenuSymbol(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, bookmarkMenuSymbol]);

  useEffect(() => {
    if (!bookmarkMenuSymbol) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bookmarkMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".symbol-search-bookmark")) return;
      setBookmarkMenuSymbol(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [bookmarkMenuSymbol]);

  const rows = useMemo<SearchRow[]>(() => {
    return items.map((crypto) => {
      const pair = pairForCryptocurrency(crypto);
      return {
        crypto,
        pair,
        description: formatDescription(crypto, pair),
      };
    });
  }, [items]);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      ({ crypto, pair, description }) =>
        crypto.symbol.toLowerCase().includes(s) ||
        crypto.name.toLowerCase().includes(s) ||
        pair.toLowerCase().includes(s) ||
        description.toLowerCase().includes(s),
    );
  }, [rows, query]);

  const membershipBySymbol = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const list of watchlistLists) {
      for (const symbol of list.symbols) {
        const key = symbol.toUpperCase();
        const current = map.get(key);
        if (current) current.push(list.id);
        else map.set(key, [list.id]);
      }
    }
    return map;
  }, [watchlistLists]);

  useEffect(() => {
    setActiveIndex(0);
    setVisibleCount(LIST_PAGE_SIZE);
  }, [query, filtered.length]);

  useEffect(() => {
    if (activeIndex + 8 < visibleCount) return;
    setVisibleCount((prev) => Math.min(filtered.length, Math.max(prev, activeIndex + LIST_PAGE_SIZE)));
  }, [activeIndex, filtered.length, visibleCount]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const visibleRows = filtered.slice(0, visibleCount);

  const handleListScroll = (e: UIEvent<HTMLUListElement>) => {
    if (visibleCount >= filtered.length) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 96) return;
    setVisibleCount((prev) => Math.min(filtered.length, prev + LIST_PAGE_SIZE));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[activeIndex];
      if (row) {
        onSelect(row.crypto);
        onClose();
      }
    }
  };

  const handleBookmarkClick = (event: React.MouseEvent, symbol: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!bookmarksEnabled || !onWatchlistListsChange) return;

    if (watchlistLists.length === 1) {
      const only = watchlistLists[0]!;
      onWatchlistListsChange(toggleSymbolInList(watchlistLists, only.id, symbol));
      setBookmarkMenuSymbol(null);
      return;
    }

    setBookmarkMenuSymbol((prev) => (prev === symbol.toUpperCase() ? null : symbol.toUpperCase()));
  };

  const handleToggleListMembership = (listId: string, symbol: string) => {
    if (!onWatchlistListsChange) return;
    onWatchlistListsChange(toggleSymbolInList(watchlistLists, listId, symbol));
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const activeTicker = activeSymbol?.trim().toUpperCase() ?? "";
  const chartTheme = isDashboardDarkTheme() ? "dark" : "light";

  const modal = (
    <div
      className={`symbol-search-overlay${embedded ? " symbol-search-overlay--embedded" : ""}`}
      role="presentation"
    >
      <button
        type="button"
        className="symbol-search-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-search-title"
        className="symbol-search-dialog"
        data-theme={chartTheme}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="symbol-search-header">
          <h2 id="symbol-search-title" className="symbol-search-title">
            Поиск инструментов
          </h2>
          <button type="button" className="symbol-search-close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                d="m1.5 1.5 11 11m0-11-11 11"
              />
            </svg>
          </button>
        </header>

        <div className="symbol-search-input-wrap">
          <div className="symbol-search-input-box">
            <span className="symbol-search-input-icon" aria-hidden="true">
              <svg viewBox="0 0 28 28" fill="none">
                <path
                  fill="currentColor"
                  d="M12.182 4a8.18 8.18 0 0 1 6.29 13.412l5.526 5.525-1.06 1.06-5.527-5.525A8.182 8.182 0 1 1 12.181 4m0 1.5a6.681 6.681 0 1 0 0 13.363 6.681 6.681 0 0 0 0-13.363"
                />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              role="searchbox"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Введите название или тикера актива"
              className="symbol-search-input"
            />
            <div className="symbol-search-input-actions">
              {query ? (
                <>
                  <button
                    type="button"
                    className="symbol-search-icon-btn"
                    aria-label="Очистить"
                    title="Очистить"
                    onClick={() => setQuery("")}
                  >
                    <svg viewBox="0 0 18 18">
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm0-9.04L6.04 5 5 6.04 7.96 9 5 11.96 6.04 13 9 10.04 11.96 13 13 11.96 10.04 9 13 6.04 11.96 5 9 7.96Z"
                      />
                    </svg>
                  </button>
                  <span className="symbol-search-input-divider" aria-hidden="true" />
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="symbol-search-list-wrap">
          <ul
            ref={listRef}
            className="symbol-search-list"
            role="listbox"
            aria-label="Результаты поиска"
            onScroll={handleListScroll}
          >
            {loadError ? (
              <li className="symbol-search-message symbol-search-message-error">
                Не удалось загрузить активы: {loadError}
              </li>
            ) : items.length === 0 ? (
              <li className="symbol-search-message">
                В справочнике нет записей. Запустите API, БД и <code>pnpm db:seed</code>.
              </li>
            ) : filtered.length === 0 ? (
              <li className="symbol-search-message">Ничего не найдено</li>
            ) : (
              visibleRows.map(({ crypto, pair, description }, index) => {
                const isRowActive = index === activeIndex;
                const isCurrent = crypto.symbol.toUpperCase() === activeTicker;
                const symbolKey = crypto.symbol.toUpperCase();
                const memberListIds = membershipBySymbol.get(symbolKey) ?? [];
                const isBookmarked = memberListIds.length > 0;
                const menuOpen = bookmarkMenuSymbol === symbolKey;

                return (
                  <li key={crypto.id} role="presentation" className="symbol-search-row-wrap">
                    <div
                      className={`symbol-search-row${isRowActive ? " is-focused" : ""}${isCurrent ? " is-current" : ""}${isBookmarked ? " is-bookmarked" : ""}`}
                      data-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <div className="symbol-search-row-main">
                        {bookmarksEnabled ? (
                          <span className="symbol-search-bookmark-slot">
                            <button
                              type="button"
                              className={`symbol-search-bookmark${isBookmarked ? " is-active" : ""}${menuOpen ? " is-menu-open" : ""}`}
                              aria-label={
                                isBookmarked
                                  ? "Управление списками для инструмента"
                                  : "Добавить инструмент в список"
                              }
                              aria-haspopup={watchlistLists.length > 1 ? "menu" : undefined}
                              aria-expanded={watchlistLists.length > 1 ? menuOpen : undefined}
                              title={
                                watchlistLists.length > 1
                                  ? "Выбрать списки"
                                  : isBookmarked
                                    ? "Убрать из списка"
                                    : "Добавить в список"
                              }
                              onClick={(event) => handleBookmarkClick(event, crypto.symbol)}
                            >
                              {isBookmarked ? (
                                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden>
                                  <path
                                    d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden>
                                  <path
                                    d="M7 2.5v9M2.5 7h9"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                            </button>

                            {menuOpen ? (
                              <div
                                ref={bookmarkMenuRef}
                                className="symbol-search-bookmark-menu"
                                role="menu"
                                aria-label="Списки"
                              >
                                {watchlistLists.map((list) => {
                                  const checked = symbolInList(list, crypto.symbol);
                                  const full = !checked && list.symbols.length >= WATCHLIST_MAX_SYMBOLS;
                                  return (
                                    <button
                                      key={list.id}
                                      type="button"
                                      role="menuitemcheckbox"
                                      aria-checked={checked}
                                      disabled={full}
                                      className={`symbol-search-bookmark-menu-item${checked ? " is-checked" : ""}`}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleToggleListMembership(list.id, crypto.symbol);
                                      }}
                                    >
                                      <span
                                        className={`symbol-search-bookmark-menu-check${checked ? " is-checked" : ""}`}
                                        aria-hidden
                                      />
                                      <span className="symbol-search-bookmark-menu-label">{list.title}</span>
                                      <span className="symbol-search-bookmark-menu-count">
                                        {list.symbols.length}/{WATCHLIST_MAX_SYMBOLS}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </span>
                        ) : (
                          <span className="symbol-search-marker" aria-hidden="true">
                            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
                              <path
                                d="M7 2.5v9M2.5 7h9"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isRowActive}
                          className="symbol-search-row-select"
                          onClick={() => {
                            onSelect(crypto);
                            onClose();
                          }}
                        >
                          {crypto.iconUrl ? (
                            <img
                              src={crypto.iconUrl}
                              alt=""
                              className="symbol-search-logo"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="symbol-search-logo-fallback">{crypto.symbol.slice(0, 1)}</span>
                          )}
                          <span className="symbol-search-ticker">{highlightMatch(pair, query)}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="symbol-search-row-select symbol-search-row-select--desc"
                        tabIndex={-1}
                        onClick={() => {
                          onSelect(crypto);
                          onClose();
                        }}
                      >
                        <span className="symbol-search-desc">{highlightMatch(description, query)}</span>
                      </button>
                      <button
                        type="button"
                        className="symbol-search-row-select symbol-search-row-select--exchange"
                        tabIndex={-1}
                        onClick={() => {
                          onSelect(crypto);
                          onClose();
                        }}
                      >
                        <div className="symbol-search-exchange">
                          <div className="symbol-search-exchange-text">
                            <div className="symbol-search-market-type">{MARKET_TYPE}</div>
                            <div className="symbol-search-exchange-name">{EXCHANGE_NAME}</div>
                          </div>
                          <img
                            src={EXCHANGE_LOGO}
                            alt=""
                            className="symbol-search-exchange-logo"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );

  if (embedded) return modal;
  return createPortal(modal, document.body);
}
