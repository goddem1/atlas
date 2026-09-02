import type { Editor } from "@tiptap/react";

export function getActiveNoteLinkHref(editor: Editor): string {
  const href = editor.getAttributes("link").href;
  return typeof href === "string" ? href : "";
}

export function normalizeNoteLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return null;
  return `https://${trimmed}`;
}

export function applyNoteLink(editor: Editor, href: string): "ok" | "empty-selection" | "invalid-url" {
  const normalized = normalizeNoteLinkUrl(href);
  if (!normalized) return "invalid-url";
  if (editor.state.selection.empty) return "empty-selection";
  const applied = editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
  return applied ? "ok" : "empty-selection";
}

export function removeNoteLink(editor: Editor): void {
  editor.chain().focus().extendMarkRange("link").unsetLink().run();
}
