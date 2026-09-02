import { useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { NotesParagraph } from "./notesParagraph";
import {
  hasImageDrag,
  readImageFileFromClipboard,
  readImageFileFromDataTransfer,
  uploadImageAndInsert,
} from "./notesImageUpload";

export { uploadImageAndInsert } from "./notesImageUpload";

export function useNotesEditor(
  initialContent: object | null,
  onUpdate: (json: object) => void,
  onUploadError?: (message: string) => void,
) {
  const editorRef = useRef<Editor | null>(null);
  const onUploadErrorRef = useRef(onUploadError);
  onUploadErrorRef.current = onUploadError;

  return useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: { levels: [1, 2, 3] },
      }),
      NotesParagraph,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ["bottom-right", "bottom-left", "top-right", "top-left"],
          minWidth: 80,
          minHeight: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Placeholder.configure({ placeholder: "Начни писать..." }),
    ],
    content: initialContent ?? "",
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onDestroy: () => {
      editorRef.current = null;
    },
    onUpdate: ({ editor }) => onUpdate(editor.getJSON()),
    editorProps: {
      handlePaste: (_view, event) => {
        const file = readImageFileFromClipboard(event.clipboardData);
        if (!file || !editorRef.current) return false;
        event.preventDefault();
        void uploadImageAndInsert(file, editorRef.current, onUploadErrorRef.current);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const file = readImageFileFromDataTransfer(event.dataTransfer);
        if (!file || !editorRef.current) return false;
        event.preventDefault();
        void uploadImageAndInsert(file, editorRef.current, onUploadErrorRef.current);
        return true;
      },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (!hasImageDrag(event.dataTransfer)) return false;
          event.preventDefault();
          return true;
        },
        dragenter: (_view, event) => {
          if (!hasImageDrag(event.dataTransfer)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}
