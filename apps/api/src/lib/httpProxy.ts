import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";

export type ParsedProxy = {
  protocol: "http" | "https" | "socks4" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export type TelegramSocksProxy = {
  ip: string;
  port: number;
  socksType: 4 | 5;
  username?: string;
  password?: string;
};

let rapidApiDispatcher: Dispatcher | null = null;
let checked = false;

function normalizeProxyUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `http://${value}`;
}

/** host:port:user:pass (как в .env.example для RapidAPI). */
function parseColonProxy(raw: string): ParsedProxy | null {
  const parts = raw.split(":");
  if (parts.length < 4) return null;
  const host = parts[0]?.trim();
  const port = Number.parseInt(parts[1] ?? "", 10);
  const username = parts[2]?.trim();
  const password = parts.slice(3).join(":").trim();
  if (!host || !Number.isFinite(port) || !username || !password) return null;
  return { protocol: "http", host, port, username, password };
}

export function parseOutboundProxyUrl(raw: string): ParsedProxy | null {
  const value = raw.trim();
  if (!value) return null;

  if (!value.includes("://") && value.split(":").length >= 4) {
    return parseColonProxy(value);
  }

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
    const host = url.hostname;
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : url.protocol === "https:" || url.protocol === "http:"
        ? url.protocol === "https:"
          ? 443
          : 80
        : 1080;
    if (!host || !Number.isFinite(port)) return null;
    const proto = url.protocol.replace(":", "").toLowerCase();
    if (proto === "http" || proto === "https" || proto === "socks4" || proto === "socks5") {
      return {
        protocol: proto,
        host,
        port,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function readSharedOutboundProxyRaw(): string {
  return (
    process.env.RAPIDAPI_PROXY_URL?.trim() ??
    process.env.RAPIDAPI_PROXY?.trim() ??
    ""
  );
}

export function listTelegramSocksProxyCandidates(): TelegramSocksProxy[] {
  const explicitUrl = process.env.TELEGRAM_PROXY_URL?.trim();
  if (explicitUrl) {
    const parsed = parseOutboundProxyUrl(explicitUrl);
    if (parsed && (parsed.protocol === "socks4" || parsed.protocol === "socks5")) {
      return [
        {
          ip: parsed.host,
          port: parsed.port,
          socksType: parsed.protocol === "socks4" ? 4 : 5,
          username: parsed.username,
          password: parsed.password,
        },
      ];
    }
  }

  const host = process.env.TELEGRAM_PROXY_HOST?.trim();
  const portRaw = process.env.TELEGRAM_PROXY_PORT?.trim();
  if (host && portRaw) {
    const port = Number.parseInt(portRaw, 10);
    if (Number.isFinite(port)) {
      const type = (process.env.TELEGRAM_PROXY_TYPE ?? "socks5").toLowerCase();
      if (type === "socks4" || type === "socks5") {
        return [
          {
            ip: host,
            port,
            socksType: type === "socks4" ? 4 : 5,
            username: process.env.TELEGRAM_PROXY_USERNAME?.trim() || undefined,
            password: process.env.TELEGRAM_PROXY_PASSWORD?.trim() || undefined,
          },
        ];
      }
    }
  }

  const shared = parseOutboundProxyUrl(readSharedOutboundProxyRaw());
  if (!shared) return [];

  const socksPortRaw = process.env.TELEGRAM_PROXY_SOCKS_PORT?.trim();
  const socksPortOverride = socksPortRaw ? Number.parseInt(socksPortRaw, 10) : undefined;
  const portCandidates = [
    ...(Number.isFinite(socksPortOverride ?? NaN) ? [socksPortOverride!] : []),
    ...(shared.protocol === "socks4" || shared.protocol === "socks5" ? [shared.port] : []),
    1080,
    1081,
    8001,
    shared.port,
  ];
  const seen = new Set<number>();
  const out: TelegramSocksProxy[] = [];
  for (const port of portCandidates) {
    if (!Number.isFinite(port) || seen.has(port)) continue;
    seen.add(port);
    out.push({
      ip: shared.host,
      port,
      socksType: 5,
      username: shared.username,
      password: shared.password,
    });
  }
  return out;
}

export function getRapidApiDispatcher(): Dispatcher | undefined {
  if (checked) return rapidApiDispatcher ?? undefined;
  checked = true;
  const proxyUrl = normalizeProxyUrl(readSharedOutboundProxyRaw());
  if (proxyUrl) {
    rapidApiDispatcher = new ProxyAgent(proxyUrl);
    return rapidApiDispatcher;
  }
  rapidApiDispatcher = null;
  return undefined;
}
