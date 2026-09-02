import { lazy, Suspense, memo, useCallback, useEffect, useState } from "react";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { fetchNotesList, type NoteListItem } from "../../../services/api";
import { GALLERY_NOTES_ITEMS } from "../../dashboard/widgetGalleryPreviewData";
import { NoteCoverIcon } from "../../notes/NoteCoverIcon";
import "../shared/portfolio-menu.css";
import "./notes-widget.css";

const NotesModal = lazy(() => import("../../notes/NotesModal").then((m) => ({ default: m.NotesModal })));

const NOTES_WIDGET_VISIBLE_COUNT = 4;

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  onOpenNotes?: (noteId?: string) => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

export const NotesWidget = memo(function NotesWidget({
  dragHandleClassName,
  onDeleteWidget,
  onOpenNotes,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(() => !galleryPreview);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<NoteListItem[]>(() => (galleryPreview ? GALLERY_NOTES_ITEMS : []));
  const [localNotesOpen, setLocalNotesOpen] = useState(false);
  const [localInitialNoteId, setLocalInitialNoteId] = useState<string | null>(null);

  const openNotes = useCallback(
    (noteId?: string) => {
      if (onOpenNotes) {
        onOpenNotes(noteId);
        return;
      }
      setLocalInitialNoteId(noteId ?? null);
      setLocalNotesOpen(true);
    },
    [onOpenNotes],
  );

  const load = useCallback(() => {
    if (galleryPreview) return;
    setLoading(true);
    setErr(null);
    void fetchNotesList()
      .then((list) => setItems(list))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Не удалось загрузить заметки");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [galleryPreview]);

  useEffect(() => {
    if (galleryPreview || overlayOpen) return;
    load();
  }, [load, galleryPreview, overlayOpen]);

  const dragCn = cn("notes-widget-body", dragHandleClassName);
  const visibleItems = items.slice(0, NOTES_WIDGET_VISIBLE_COUNT);

  return (
    <div className="notes-widget-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen ? "is-open" : undefined)}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => {
              setMenuOpen(false);
              openNotes();
            }}
            aria-label="Открыть заметки"
          >
            <img src="/assets/portfolio-ui/folder.svg" alt="" className="portfolio-menu-circle-icon" />
          </button>
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img
              src="/assets/portfolio-ui/close.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close"
            />
          </button>
        </div>
      </div>

      <div className={cn("atlas-glass notes-widget-card", galleryPreview && "notes-widget-card--gallery")}>
        <div className={dragCn}>
          {loading ? <p className="notes-widget-msg">Загрузка…</p> : null}
          {!loading && err ? <p className="notes-widget-msg notes-widget-msg--err">{err}</p> : null}
          {!loading && !err && items.length === 0 ? (
            <p className="notes-widget-msg">
              Нет заметок
              <button type="button" className="notes-widget-inline-link" onClick={() => openNotes()}>
                создать первую
              </button>
            </p>
          ) : null}

          {!loading && !err && items.length > 0 ? (
            <ul className="notes-widget-list">
              {visibleItems.map((note, index) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className={cn("notes-widget-row", index === 0 && "notes-widget-row--featured")}
                    onClick={() => openNotes(note.id)}
                    title={note.preview || note.title}
                  >
                    {index === 0 && note.coverImageUrl ? (
                      <NoteCoverIcon className="notes-widget-row-icon" coverImageUrl={note.coverImageUrl} />
                    ) : null}
                    <span className="notes-widget-row-text">
                      <span className="notes-widget-row-title">{note.title || "Без названия"}</span>
                      <span className="notes-widget-row-preview">
                        {note.preview || "Пустая заметка"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {!galleryPreview && localNotesOpen && !onOpenNotes ? (
        <Suspense fallback={null}>
          <NotesModal
            open
            initialNoteId={localInitialNoteId}
            onClose={() => {
              setLocalNotesOpen(false);
              setLocalInitialNoteId(null);
              load();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
