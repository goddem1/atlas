import { useCallback, useEffect, useRef, useState } from "react";
import { TELEGRAM_FILTERS_MAX, normalizeFilterList, normalizeFilterWord, saveTelegramFilters } from "../../lib/telegramFilters";

type Props = {
  filters: string[];
  onFiltersChange: (filters: string[]) => void;
  hiddenCount: number;
  onShowHidden: () => void;
  onClose: () => void;
};

export function TelegramNewsFiltersPanel({
  filters,
  onFiltersChange,
  hiddenCount,
  onShowHidden,
  onClose,
}: Props) {
  const [filterInput, setFilterInput] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAddFilter = useCallback(() => {
    const word = normalizeFilterWord(filterInput);
    if (!word) {
      setFilterError("Введите слово для фильтра");
      return;
    }
    if (filters.some((f) => f.toLowerCase() === word.toLowerCase())) {
      setFilterError("Такой фильтр уже есть");
      return;
    }
    if (filters.length >= TELEGRAM_FILTERS_MAX) {
      setFilterError(`Не больше ${TELEGRAM_FILTERS_MAX} фильтров`);
      return;
    }
    const next = normalizeFilterList([...filters, word]);
    saveTelegramFilters(next);
    onFiltersChange(next);
    setFilterInput("");
    setFilterError(null);
  }, [filterInput, filters, onFiltersChange]);

  const handleRemoveFilter = useCallback(
    (word: string) => {
      const next = filters.filter((f) => f.toLowerCase() !== word.toLowerCase());
      saveTelegramFilters(next);
      onFiltersChange(next);
    },
    [filters, onFiltersChange],
  );

  return (
    <section className="tg-news-filters-panel" aria-label="Фильтры ленты">
      <div className="tg-news-filters-panel-head">
        <h3 className="tg-news-filters-panel-title">Фильтры</h3>
        <button type="button" className="tg-news-filters-panel-close" onClick={onClose} aria-label="Скрыть фильтры">
          <img src="/assets/portfolio-ui/close.svg" alt="" />
        </button>
      </div>

      <form
        className="tg-news-filters-panel-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddFilter();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={filterInput}
          onChange={(e) => {
            setFilterInput(e.target.value);
            setFilterError(null);
          }}
          placeholder="Слово для скрытия…"
          className="tg-news-filters-panel-input"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="tg-news-filters-panel-submit">
          Добавить
        </button>
        {filterError ? <div className="tg-news-filters-panel-error">{filterError}</div> : null}
      </form>

      <p className="tg-news-filters-panel-hint">Посты, где есть эти слова, скрываются из ленты</p>

      {filters.length > 0 ? (
        <>
          <div className="tg-news-filters-panel-chips">
            {filters.map((word) => (
              <button
                key={word.toLowerCase()}
                type="button"
                className="tg-news-filters-panel-chip"
                onClick={() => handleRemoveFilter(word)}
                title="Убрать фильтр"
              >
                <span>{word}</span>
                <span className="tg-news-filters-panel-chip-x" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="tg-news-filters-panel-show-hidden"
              onClick={() => {
                onShowHidden();
                onClose();
              }}
            >
              Смотреть скрытые · {hiddenCount}
            </button>
          ) : (
            <div className="tg-news-filters-panel-empty">В этой ленте скрытых постов нет</div>
          )}
        </>
      ) : (
        <div className="tg-news-filters-panel-empty">Фильтров пока нет</div>
      )}
    </section>
  );
}
