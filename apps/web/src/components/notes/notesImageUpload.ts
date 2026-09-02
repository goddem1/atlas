import type { Editor } from "@tiptap/react";
import { uploadNoteImage } from "../../services/api";

export async function uploadImageAndInsert(
  file: File,
  editor: Editor,
  onError?: (message: string) => void,
) {
  try {
    const publicUrl = await uploadNoteImage(file);
    editor.chain().focus().setImage({ src: publicUrl }).run();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось загрузить изображение";
    onError?.(message);
  }
}

export function hasImageDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types);
  if (types.includes("Files")) return true;
  return Array.from(dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
}

export function readImageFileFromDataTransfer(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null;

  const fromFiles = Array.from(dataTransfer.files).find((f) => f.type.startsWith("image/"));
  if (fromFiles) return fromFiles;

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return null;
}

export function readImageFileFromClipboard(dataTransfer: DataTransfer | null): File | null {
  return readImageFileFromDataTransfer(dataTransfer);
}
