import { useMemo } from "react";
import twemoji from "@twemoji/api";

const TWEMOJI_OPTIONS = {
  folder: "svg",
  ext: ".svg",
  className: "atlas-twemoji",
} as const;

export function parseTwemojiHtml(text: string): string {
  if (!text || !twemoji.test(text)) return text;
  return twemoji.parse(text, TWEMOJI_OPTIONS);
}

type Props = {
  text: string;
  className?: string;
};

/** Plain text with Unicode emoji replaced by Twemoji SVG (same look on all OS). */
export function TwemojiText({ text, className }: Props) {
  const html = useMemo(() => parseTwemojiHtml(text), [text]);

  if (html === text) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
