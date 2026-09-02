import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";
import { applyNoteTextStyle, getActiveNoteTextStyle, NOTE_TEXT_STYLES, type NoteTextStyleId } from "./noteTextStyles";

type Props = {
  editor: Editor;
};

export function NoteTextStyleSelect({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  const activeStyle = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? getActiveNoteTextStyle(ed) : "body"),
  });
  const activeLabel = NOTE_TEXT_STYLES.find((style) => style.id === activeStyle)?.label ?? "Текст";

  const positionMenu = useCallback(() => {
    const trigger = rootRef.current?.querySelector<HTMLElement>(".notes-text-style-select-trigger");
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 168;
    const menuHeight = menuRef.current?.offsetHeight ?? 220;
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

  const pickStyle = (styleId: NoteTextStyleId) => {
    applyNoteTextStyle(editor, styleId);
    setOpen(false);
  };

  return (
    <div className="notes-text-style-select" ref={rootRef}>
      <button
        type="button"
        className={`notes-text-style-select-trigger${open ? " is-menu-open" : ""}`}
        aria-label="Стиль текста"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
      >
        {activeLabel}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="notes-text-style-menu atlas-glass"
              role="listbox"
              aria-label="Стиль текста"
              style={
                menuStyle
                  ? { top: menuStyle.top, left: menuStyle.left, visibility: "visible" }
                  : { visibility: "hidden", top: 0, left: 0 }
              }
            >
              {NOTE_TEXT_STYLES.map((style) => {
                const active = style.id === activeStyle;
                return (
                  <button
                    key={style.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`notes-text-style-option list-on-glass${active ? " is-active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickStyle(style.id)}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
