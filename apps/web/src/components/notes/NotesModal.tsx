import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import {
  createNote,
  deleteNote,
  fetchNote,
  fetchNotesList,
  updateNote,
  type NoteDetail,
  type NoteListItem,
} from "../../services/api";
import { NoteEditor } from "./NoteEditor";
import { NotesList } from "./NotesList";
import { extractCoverImageUrl, extractPreview } from "./noteContentMeta";
import "./notes-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  initialNoteId?: string | null;
};

export function NotesModal({ open, onClose, initialNoteId = null }: Props) {
  useBackdropBlurPause(open);

  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchNotesList();
      setNotes(list);
      return list;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить заметки");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNote = useCallback(async (id: string) => {
    try {
      const note = await fetchNote(id);
      setActiveNote(note);
      setActiveId(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить заметку");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadList().then((list) => {
      if (list.length === 0) {
        setActiveId(null);
        setActiveNote(null);
        return;
      }
      const preferred =
        initialNoteId && list.some((note) => note.id === initialNoteId) ? initialNoteId : list[0]!.id;
      void loadNote(preferred);
    });
  }, [open, initialNoteId, loadList, loadNote]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeId) return;
      void loadNote(id);
    },
    [activeId, loadNote],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setErr(null);
    try {
      const note = await createNote();
      const listItem: NoteListItem = {
        id: note.id,
        title: note.title,
        updatedAt: note.updatedAt,
        preview: "",
        coverImageUrl: null,
      };
      setNotes((prev) => [listItem, ...prev]);
      setActiveNote(note);
      setActiveId(note.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать заметку");
    } finally {
      setCreating(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!activeId) return;
    const idToDelete = activeId;
    setDeleting(true);
    setErr(null);
    try {
      await deleteNote(idToDelete);
      const remaining = notes.filter((n) => n.id !== idToDelete);
      setNotes(remaining);
      if (remaining.length > 0) {
        const nextId = remaining[0]!.id;
        setActiveId(nextId);
        await loadNote(nextId);
      } else {
        setActiveId(null);
        setActiveNote(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить заметку");
    } finally {
      setDeleting(false);
    }
  }, [activeId, notes, loadNote]);

  const handleSave = useCallback(
    async (id: string, patch: { title?: string; content?: object }) => {
      const updated = await updateNote(id, patch);
      setActiveNote(updated);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                title: updated.title,
                updatedAt: updated.updatedAt,
                preview:
                  patch.content && typeof updated.content === "object"
                    ? extractPreview(updated.content)
                    : n.preview,
                coverImageUrl:
                  patch.content && typeof updated.content === "object"
                    ? extractCoverImageUrl(updated.content)
                    : n.coverImageUrl,
              }
            : n,
        ),
      );
      return updated;
    },
    [],
  );

  const handleTitleChange = useCallback((title: string) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, title } : n)));
  }, [activeId]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="notes-modal-overlay" role="presentation">
      <button type="button" className="notes-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-modal-title"
        className="notes-modal-dialog atlas-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="notes-modal-title" className="notes-modal-sr-only">
          Заметки
        </h2>
        {err ? <p className="notes-modal-error">{err}</p> : null}
        <div className="notes-modal-layout">
          <NotesList notes={notes} activeId={activeId} onSelect={handleSelect} />
          <div className="notes-modal-divider" aria-hidden />
          <NoteEditor
            key={activeNote?.id ?? "empty"}
            note={activeNote}
            loading={loading && !activeNote}
            creating={creating}
            deleting={deleting}
            onCreate={() => void handleCreate()}
            onDelete={() => void handleDelete()}
            onSave={handleSave}
            onTitleChange={handleTitleChange}
            onUploadError={setErr}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
