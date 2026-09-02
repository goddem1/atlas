import Paragraph from "@tiptap/extension-paragraph";

/** Абзац с вариантом «моноширинный» для стиля текста в заметках. */
export const NotesParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      variant: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-variant"),
        renderHTML: (attributes: { variant?: string | null }) => {
          if (!attributes.variant) return {};
          return { "data-variant": attributes.variant };
        },
      },
    };
  },
});
