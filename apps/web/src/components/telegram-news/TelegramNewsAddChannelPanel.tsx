import { useEffect, useRef } from "react";

type Props = {
  addInput: string;
  addError: string | null;
  addBusy: boolean;
  onAddInputChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function TelegramNewsAddChannelPanel({
  addInput,
  addError,
  addBusy,
  onAddInputChange,
  onSubmit,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <section className="tg-news-add-panel" aria-label="Добавление канала">
      <div className="tg-news-add-panel-head">
        <h3 className="tg-news-add-panel-title">Добавить канал</h3>
        <button type="button" className="tg-news-add-panel-close" onClick={onClose} aria-label="Скрыть">
          <img src="/assets/portfolio-ui/close.svg" alt="" />
        </button>
      </div>

      <form
        className="tg-news-add-panel-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={addInput}
          onChange={(e) => onAddInputChange(e.target.value)}
          placeholder="@username или t.me/…"
          className="tg-news-add-panel-input"
          disabled={addBusy}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="tg-news-add-panel-submit" disabled={addBusy}>
          {addBusy ? "…" : "Добавить"}
        </button>
        {addError ? <div className="tg-news-add-panel-error">{addError}</div> : null}
      </form>

      <p className="tg-news-add-panel-hint">Вставьте @username или ссылку t.me/channel</p>
    </section>
  );
}
