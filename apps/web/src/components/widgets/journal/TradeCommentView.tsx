import { extractPlainText } from "../../notes/noteContentMeta";

type Props = {
  content: unknown;
};

export function TradeCommentView({ content }: Props) {
  const text = extractPlainText(content);
  if (!text) return null;
  return <p className="journal-table-detail-comment">{text}</p>;
}
