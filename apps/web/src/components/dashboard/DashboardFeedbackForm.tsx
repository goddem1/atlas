import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import { sendDashboardFeedback } from "../../services/api";

function MessageIcon() {
  return (
    <svg
      className="dashboard-floating-action-icon dashboard-floating-action-icon--message"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M7 8.5h10M7 12h6"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M6.5 18.5 4 21V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v7.4a2.8 2.8 0 0 1-2.8 2.8H8.2L6.5 18.5Z"
      />
    </svg>
  );
}

export function DashboardFeedbackForm() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useBackdropBlurPause(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  const submit = async () => {
    const text = message.trim();
    if (text.length < 2 || sending) return;
    setSending(true);
    setError("");
    try {
      await sendDashboardFeedback({ message: text, contact: contact.trim() });
      setMessage("");
      setContact("");
      setSent(true);
    } catch (err) {
      setSent(false);
      setError(err instanceof Error && err.message ? err.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="dashboard-floating-action-btn btn-glass"
        aria-label="Написать сообщение"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setSent(false);
          setError("");
        }}
      >
        <MessageIcon />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="dashboard-feedback-overlay" role="presentation">
              <button type="button" className="dashboard-feedback-backdrop" aria-label="Закрыть" onClick={close} />
              <form
                className="dashboard-feedback-dialog atlas-glass"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <h2 id={titleId} className="dashboard-feedback-title">
                  Написать нам
                </h2>
                <textarea
                  className="dashboard-feedback-text"
                  value={message}
                  maxLength={2000}
                  rows={5}
                  placeholder="Сообщение"
                  aria-label="Сообщение"
                  autoFocus
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setSent(false);
                  }}
                />
                <input
                  className="dashboard-feedback-input"
                  value={contact}
                  maxLength={160}
                  placeholder="Почта или Telegram, если нужен ответ"
                  aria-label="Контакт для ответа"
                  onChange={(event) => setContact(event.target.value)}
                />
                <button
                  type="submit"
                  className="dashboard-feedback-send"
                  disabled={sending || message.trim().length < 2}
                >
                  {sending ? "Отправка…" : "Отправить"}
                </button>
                {sent ? <p className="dashboard-feedback-status">Сообщение отправлено в Telegram.</p> : null}
                {error ? <p className="dashboard-feedback-status dashboard-feedback-status--error">{error}</p> : null}
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
