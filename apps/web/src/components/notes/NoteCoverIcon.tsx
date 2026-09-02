type Props = {
  className: string;
  coverImageUrl?: string | null;
};

export function NoteCoverIcon({ className, coverImageUrl }: Props) {
  if (!coverImageUrl) return null;

  return (
    <span className={className} aria-hidden>
      <img src={coverImageUrl} alt="" />
    </span>
  );
}
