import type { NoteListItem } from "../../services/api";
import { NoteCoverIcon } from "./NoteCoverIcon";

type Props = {
  notes: NoteListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

function formatListDate(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(dt);
}

export function NotesList({ notes, activeId, onSelect }: Props) {
  return (
    <aside className="notes-list">
      <div className="notes-list-scroll">
        {notes.map((note) => {
          const active = note.id === activeId;
          return (
            <button
              key={note.id}
              type="button"
              className={`notes-list-item${active ? " is-active" : ""}`}
              onClick={() => onSelect(note.id)}
            >
              <NoteCoverIcon className="notes-list-item-icon" coverImageUrl={note.coverImageUrl} />
              <span className="notes-list-item-text">
                <span className="notes-list-item-title">{note.title || "Без названия"}</span>
                <span className="notes-list-item-preview">
                  {note.preview || formatListDate(note.updatedAt)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
