export function extractPlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return extractTextFromNode(content).replace(/\s+/g, " ").trim();
}

export function extractPreview(content: unknown, maxLen = 120): string {
  const text = extractPlainText(content);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export function extractCoverImageUrl(content: unknown): string | null {
  return findFirstImageUrl(content);
}

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(extractTextFromNode).join("");
  }
  return "";
}

function findFirstImageUrl(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  if (n.type === "image") {
    const attrs = n.attrs;
    if (attrs && typeof attrs === "object") {
      const src = (attrs as Record<string, unknown>).src;
      if (typeof src === "string" && src.trim()) return src.trim();
    }
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      const found = findFirstImageUrl(child);
      if (found) return found;
    }
  }
  return null;
}
