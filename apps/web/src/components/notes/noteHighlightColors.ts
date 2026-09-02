import type { Editor } from "@tiptap/react";

export type NoteHighlightColorId =
  | "default"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "gray";

export const NOTE_HIGHLIGHT_COLORS: { id: NoteHighlightColorId; label: string; value: string | null }[] = [
  { id: "default", label: "Без выделения", value: null },
  { id: "red", label: "Красный", value: "#FFD2D0" },
  { id: "orange", label: "Оранжевый", value: "#FFE2BF" },
  { id: "yellow", label: "Жёлтый", value: "#FFF0A8" },
  { id: "green", label: "Зелёный", value: "#D4F5DD" },
  { id: "blue", label: "Синий", value: "#D6EBFF" },
  { id: "purple", label: "Фиолетовый", value: "#EDD9FA" },
  { id: "gray", label: "Серый", value: "#E5E5EA" },
];

export function normalizeNoteHighlightColor(color: string | null | undefined): string | null {
  if (!color) return null;
  return color.trim().toUpperCase();
}

export function getActiveNoteHighlightColor(editor: Editor): string | null {
  const color = editor.getAttributes("highlight").color;
  return normalizeNoteHighlightColor(typeof color === "string" ? color : null);
}

export function applyNoteHighlightColor(editor: Editor, color: string | null): void {
  const chain = editor.chain().focus();
  if (!color) {
    chain.unsetHighlight().run();
    return;
  }
  chain.setHighlight({ color }).run();
}
