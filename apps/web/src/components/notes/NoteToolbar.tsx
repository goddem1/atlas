import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { uploadImageAndInsert } from "./notesImageUpload";
import { NoteTextStyleSelect } from "./NoteTextStyleSelect";
import { NoteTextHighlightPicker } from "./NoteTextHighlightPicker";
import { NoteLinkPopover } from "./NoteLinkPopover";
import "./notes-toolbar.css";

type Props = {
  editor: Editor | null;
  onUploadError?: (message: string) => void;
};

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="notes-toolbar-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function NoteToolbar({ editor, onUploadError }: Props) {
  if (!editor) return null;

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void uploadImageAndInsert(file, editor, onUploadError);
    };
    input.click();
  };

  return (
    <div className="notes-toolbar" role="toolbar" aria-label="Форматирование заметки">
      <ToolbarGroup label="Стиль текста">
        <NoteTextStyleSelect editor={editor} />
        <NoteTextHighlightPicker editor={editor} />
      </ToolbarGroup>

      <ToolbarGroup label="Форматирование">
        <button
          type="button"
          className={cn("notes-toolbar-btn", editor.isActive("bold") && "is-active")}
          aria-label="Жирный"
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn", editor.isActive("italic") && "is-active")}
          aria-label="Курсив"
          aria-pressed={editor.isActive("italic")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn notes-toolbar-btn--underline", editor.isActive("underline") && "is-active")}
          aria-label="Подчёркивание"
          aria-pressed={editor.isActive("underline")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn notes-toolbar-btn--strike", editor.isActive("strike") && "is-active")}
          aria-label="Зачёркивание"
          aria-pressed={editor.isActive("strike")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          S
        </button>
      </ToolbarGroup>

      <ToolbarGroup label="Структура">
        <button
          type="button"
          className={cn("notes-toolbar-btn", editor.isActive("bulletList") && "is-active")}
          aria-label="Маркированный список"
          aria-pressed={editor.isActive("bulletList")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn", editor.isActive("orderedList") && "is-active")}
          aria-label="Нумерованный список"
          aria-pressed={editor.isActive("orderedList")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn notes-toolbar-btn--checklist", editor.isActive("taskList") && "is-active")}
          aria-label="Список с галочками"
          aria-pressed={editor.isActive("taskList")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <span className="notes-toolbar-checklist-icon" aria-hidden />
        </button>
        <button
          type="button"
          className={cn("notes-toolbar-btn notes-toolbar-btn--quote", editor.isActive("blockquote") && "is-active")}
          aria-label="Цитата"
          aria-pressed={editor.isActive("blockquote")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <span className="notes-toolbar-quote-icon" aria-hidden />
        </button>
      </ToolbarGroup>

      <ToolbarGroup label="Вставка">
        <NoteLinkPopover editor={editor} />
        <button
          type="button"
          className="notes-toolbar-btn"
          aria-label="Вставить фото"
          onMouseDown={(e) => e.preventDefault()}
          onClick={pickImage}
        >
          <span className="notes-toolbar-photo-icon" aria-hidden />
        </button>
      </ToolbarGroup>
    </div>
  );
}
