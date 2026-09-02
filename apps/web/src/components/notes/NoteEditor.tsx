import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { EditorContent } from "@tiptap/react";
import type { NoteDetail } from "../../services/api";
import { hasImageDrag, readImageFileFromDataTransfer, uploadImageAndInsert } from "./notesImageUpload";
import { useNotesEditor } from "./useNotesEditor";
import { NoteToolbar } from "./NoteToolbar";

type Props = {
  note: NoteDetail | null;
  loading?: boolean;
  creating?: boolean;
  deleting?: boolean;
  onCreate?: () => void;
  onDelete?: () => void;
  onSave: (id: string, patch: { title?: string; content?: object }) => Promise<NoteDetail | void>;
  onTitleChange?: (title: string) => void;
  onUploadError?: (message: string) => void;
};

function formatEditedAt(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(dt);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  }).format(dt);
  return `${date} ${time}`;
}

function NotesEditorActions({
  onCreate,
  onDelete,
  creating = false,
  deleting = false,
  canDelete = false,
}: {
  onCreate?: () => void;
  onDelete?: () => void;
  creating?: boolean;
  deleting?: boolean;
  canDelete?: boolean;
}) {
  if (!onCreate) return null;

  const handleDelete = () => {
    if (!canDelete || deleting) return;
    onDelete?.();
  };

  return (
    <>
      <aside className="notes-modal-rail" aria-label="Действия с заметками">
        <div className="notes-modal-rail-actions">
          <button
            type="button"
            className="notes-create-btn btn-glass"
            disabled={creating || deleting}
            aria-label="Новая заметка"
            title="Новая заметка"
            onClick={onCreate}
          >
            <img src="/assets/portfolio-ui/plus.svg" alt="" aria-hidden="true" className="notes-create-btn-icon" />
          </button>
          <button
            type="button"
            className="notes-delete-btn btn-glass"
            disabled={!canDelete || creating || deleting}
            aria-label="Удалить заметку"
            title="Удалить заметку"
            onClick={handleDelete}
          >
            <img src="/assets/portfolio-ui/trash.svg" alt="" aria-hidden="true" className="notes-delete-btn-icon" />
          </button>
        </div>
      </aside>
      <div className="notes-modal-divider notes-modal-divider--header" aria-hidden />
    </>
  );
}

export function NoteEditor({
  note,
  loading = false,
  creating = false,
  deleting = false,
  onCreate,
  onDelete,
  onSave,
  onTitleChange,
  onUploadError,
}: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const pendingRef = useRef<{ title?: string; content?: object }>({});
  const saveTimerRef = useRef<number | null>(null);
  const noteIdRef = useRef<string | null>(note?.id ?? null);

  const flushSave = useCallback(async () => {
    const id = noteIdRef.current;
    if (!id) return;
    const patch = pendingRef.current;
    if (!patch.title && !patch.content) return;
    pendingRef.current = {};
    await onSave(id, patch);
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, 800);
  }, [flushSave]);

  const queuePatch = useCallback(
    (patch: { title?: string; content?: object }) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleContentUpdate = useCallback(
    (json: object) => {
      queuePatch({ content: json });
    },
    [queuePatch],
  );

  const editor = useNotesEditor(
    note?.content && typeof note.content === "object" ? (note.content as object) : null,
    handleContentUpdate,
    onUploadError,
  );

  useEffect(() => {
    noteIdRef.current = note?.id ?? null;
    setTitle(note?.title ?? "");
  }, [note?.id, note?.title]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      void flushSave();
    };
  }, [flushSave]);

  const handleTitleInput = (value: string) => {
    setTitle(value);
    onTitleChange?.(value);
    queuePatch({ title: value });
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasImageDrag(event.dataTransfer)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    dragDepthRef.current = 0;
    setDragOver(false);
    const file = readImageFileFromDataTransfer(event.dataTransfer);
    if (!file || !editor) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadImageAndInsert(file, editor, onUploadError);
  };

  const handleDelete = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingRef.current = {};
    onDelete?.();
  };

  if (!note) {
    return (
      <div className="notes-editor">
        <div className="notes-editor-topbar">
          <NotesEditorActions onCreate={onCreate} onDelete={handleDelete} creating={creating} deleting={deleting} />
          <div className="notes-editor-topbar-spacer" aria-hidden />
        </div>
        <div className="notes-editor-main notes-editor-main--empty">
          <p className="notes-editor-empty-text">{loading ? "Загрузка…" : "Выберите заметку или создайте новую"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-editor">
      <div className="notes-editor-topbar">
        <NotesEditorActions
          onCreate={onCreate}
          onDelete={handleDelete}
          creating={creating}
          deleting={deleting}
          canDelete
        />
        <NoteToolbar editor={editor} onUploadError={onUploadError} />
      </div>
      <div className="notes-editor-main">
        <div className="notes-editor-meta">
          Последнее редактирование: {formatEditedAt(note.updatedAt)}
        </div>
        <input
          type="text"
          className="notes-editor-title"
          value={title}
          placeholder="Без названия"
          aria-label="Заголовок заметки"
          onChange={(e) => handleTitleInput(e.target.value)}
        />
        <div
          className={`notes-editor-body${dragOver ? " is-drag-over" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragOver ? <div className="notes-editor-drop-hint">Отпустите, чтобы вставить фото</div> : null}
          <EditorContent editor={editor} className="notes-tiptap-root" />
        </div>
      </div>
    </div>
  );
}
