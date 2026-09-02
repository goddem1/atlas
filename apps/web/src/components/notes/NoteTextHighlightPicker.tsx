import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  applyNoteHighlightColor,
  getActiveNoteHighlightColor,
  normalizeNoteHighlightColor,
  NOTE_HIGHLIGHT_COLORS,
  type NoteHighlightColorId,
} from "./noteHighlightColors";

type Props = {
  editor: Editor;
};

function findColorId(activeColor: string | null): NoteHighlightColorId {
  if (!activeColor) return "default";
  const match = NOTE_HIGHLIGHT_COLORS.find(
    (item) => item.value && normalizeNoteHighlightColor(item.value) === activeColor,
  );
  return match?.id ?? "default";
}

export function NoteTextHighlightPicker({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  const activeColor = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? getActiveNoteHighlightColor(ed) : null),
  });
  const activeColorId = findColorId(activeColor);
  const previewColor =
    NOTE_HIGHLIGHT_COLORS.find((item) => item.id === activeColorId)?.value ?? "rgba(255, 240, 168, 0.9)";

  const positionMenu = useCallback(() => {
    const btn = rootRef.current?.querySelector<HTMLElement>(".notes-text-highlight-picker-btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 220;
    const menuHeight = menuRef.current?.offsetHeight ?? 120;
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

  const pickColor = (value: string | null) => {
    applyNoteHighlightColor(editor, value);
    setOpen(false);
  };

  return (
    <div className="notes-text-highlight-picker" ref={rootRef}>
      <button
        type="button"
        className={`notes-toolbar-btn notes-text-highlight-picker-btn${open ? " is-menu-open" : ""}`}
        aria-label="Выделение цветом"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="notes-text-highlight-picker-icon" aria-hidden>
          <span className="notes-text-highlight-picker-mark" style={{ backgroundColor: previewColor }} />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="notes-text-highlight-menu atlas-glass"
              role="menu"
              aria-label="Выделение цветом"
              style={
                menuStyle
                  ? { top: menuStyle.top, left: menuStyle.left, visibility: "visible" }
                  : { visibility: "hidden", top: 0, left: 0 }
              }
            >
              <p className="notes-text-highlight-menu-title">Выделение цветом</p>
              <div className="notes-text-highlight-grid">
                {NOTE_HIGHLIGHT_COLORS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeColorId === item.id}
                    aria-label={item.label}
                    className={`notes-text-highlight-swatch${activeColorId === item.id ? " is-active" : ""}${
                      item.id === "default" ? " notes-text-highlight-swatch--default" : ""
                    }`}
                    style={item.value ? ({ "--swatch-color": item.value } as CSSProperties) : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickColor(item.value)}
                  >
                    {item.id === "default" ? (
                      <span className="notes-text-highlight-swatch-default-mark" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
