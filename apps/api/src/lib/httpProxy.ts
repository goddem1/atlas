import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";

let rapidApiDispatcher: Dispatcher | null = null;
let checked = false;

function normalizeProxyUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `http://${value}`;
}

export function getRapidApiDispatcher(): Dispatcher | undefined {
  if (checked) return rapidApiDispatcher ?? undefined;
  checked = true;
  const rawProxy =
    process.env.RAPIDAPI_PROXY_URL ??
    process.env.RAPIDAPI_PROXY ??
    "";
  const proxyUrl = normalizeProxyUrl(rawProxy);
  if (proxyUrl) {
    rapidApiDispatcher = new ProxyAgent(proxyUrl);
    return rapidApiDispatcher;
  }
  rapidApiDispatcher = null;
  return undefined;
}
