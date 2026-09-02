import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";
import { applyNoteLink, getActiveNoteLinkHref, removeNoteLink } from "./noteLinks";

type Props = {
  editor: Editor;
};

type LinkError = "empty-selection" | "invalid-url" | null;

const LINK_ERROR_MESSAGES: Record<Exclude<LinkError, null>, string> = {
  "empty-selection": "Выделите текст, на который нужно наложить ссылку",
  "invalid-url": "Введите корректный адрес ссылки",
};

export function NoteLinkPopover({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<LinkError>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  const activeHref = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? getActiveNoteLinkHref(ed) : ""),
  });
  const isLinkActive = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed?.isActive("link") ?? false,
  });

  const positionMenu = useCallback(() => {
    const btn = rootRef.current?.querySelector<HTMLElement>(".notes-link-popover-btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 320;
    const menuHeight = menuRef.current?.offsetHeight ?? 140;
    const gap = 8;
    let left = rect.left;
    let top = rect.bottom + gap;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - menuHeight - gap);
    }
    setMenuStyle({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    setDraft(activeHref);
    setError(null);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeHref]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => positionMenu();
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, positionMenu]);

  const submitLink = () => {
    const result = applyNoteLink(editor, draft);
    if (result === "ok") {
      setOpen(false);
      setError(null);
      return;
    }
    setError(result);
  };

  const handleRemove = () => {
    removeNoteLink(editor);
    setDraft("");
    setError(null);
    setOpen(false);
  };

  return (
    <div className="notes-link-popover" ref={rootRef}>
      <button
        type="button"
        className={`notes-toolbar-btn notes-link-popover-btn${open || isLinkActive ? " is-active" : ""}${
          open ? " is-menu-open" : ""
        }`}
        aria-label="Ссылка"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="notes-toolbar-link-icon" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="notes-link-popover-menu atlas-glass"
              role="dialog"
              aria-label="Добавить ссылку"
              style={
                menuStyle
                  ? { top: menuStyle.top, left: menuStyle.left, visibility: "visible" }
                  : { visibility: "hidden", top: 0, left: 0 }
              }
            >
              <p className="notes-link-popover-title">Ссылка</p>
              <input
                ref={inputRef}
                type="url"
                className="notes-link-popover-input"
                value={draft}
                placeholder="https://example.com"
                aria-label="Адрес ссылки"
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitLink();
                  }
                }}
              />
              {error ? <p className="notes-link-popover-error">{LINK_ERROR_MESSAGES[error]}</p> : null}
              <div className="notes-link-popover-actions">
                {isLinkActive ? (
                  <button type="button" className="notes-link-popover-action notes-link-popover-action--ghost" onClick={handleRemove}>
                    Убрать
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className="notes-link-popover-action notes-link-popover-action--primary" onClick={submitLink}>
                  Применить
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
