import type { Editor } from "@tiptap/react";

export type NoteTextStyleId = "title" | "heading" | "subheading" | "body" | "mono";

export const NOTE_TEXT_STYLES: { id: NoteTextStyleId; label: string }[] = [
  { id: "title", label: "Название" },
  { id: "heading", label: "Заголовок" },
  { id: "subheading", label: "Подзаголовок" },
  { id: "body", label: "Основной текст" },
  { id: "mono", label: "Моноширинный шрифт" },
];

export function getActiveNoteTextStyle(editor: Editor): NoteTextStyleId {
  if (editor.isActive("heading", { level: 1 })) return "title";
  if (editor.isActive("heading", { level: 2 })) return "heading";
  if (editor.isActive("heading", { level: 3 })) return "subheading";
  if (editor.isActive("paragraph", { variant: "mono" })) return "mono";
  return "body";
}

export function applyNoteTextStyle(editor: Editor, style: NoteTextStyleId): void {
  const chain = editor.chain().focus();
  switch (style) {
    case "title":
      chain.setHeading({ level: 1 }).run();
      return;
    case "heading":
      chain.setHeading({ level: 2 }).run();
      return;
    case "subheading":
      chain.setHeading({ level: 3 }).run();
      return;
    case "body":
      chain.setParagraph().updateAttributes("paragraph", { variant: null }).run();
      return;
    case "mono":
      chain.setParagraph().updateAttributes("paragraph", { variant: "mono" }).run();
      return;
  }
}
