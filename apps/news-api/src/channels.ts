export function normalizeChannelUsername(raw: string): string {
  let value = raw.trim();
  value = value.replace(/^https?:\/\/t\.me\//i, "");
  value = value.replace(/^@/, "");
  value = value.split(/[/?#]/)[0] ?? "";
  return value.trim();
}

export function isChannelUsername(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(value);
}
