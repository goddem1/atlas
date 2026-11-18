type SocksProxy = {
  ip: string;
  port: number;
  socksType: 5;
  username?: string;
  password?: string;
};

function parseProxy(raw: string): { protocol: string; host: string; port: number; username?: string; password?: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (!value.includes("://") && value.split(":").length >= 4) {
    const parts = value.split(":");
    const host = parts[0]?.trim() ?? "";
    const port = Number.parseInt(parts[1] ?? "", 10);
    const username = parts[2]?.trim();
    const password = parts.slice(3).join(":").trim();
    if (!host || !Number.isFinite(port)) return null;
    return { protocol: "http", host, port, username, password };
  }
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
    const port = Number.parseInt(url.port || "1080", 10);
    if (!url.hostname || !Number.isFinite(port)) return null;
    return {
      protocol: url.protocol.replace(":", "").toLowerCase(),
      host: url.hostname,
      port,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return null;
  }
}

export function telegramProxyCandidates(): SocksProxy[] {
  const explicitHost = process.env.TELEGRAM_PROXY_HOST?.trim();
  const explicitPort = Number.parseInt(process.env.TELEGRAM_PROXY_PORT ?? "", 10);
  if (explicitHost && Number.isFinite(explicitPort)) {
    return [
      {
        ip: explicitHost,
        port: explicitPort,
        socksType: 5,
        username: process.env.TELEGRAM_PROXY_USERNAME?.trim() || undefined,
        password: process.env.TELEGRAM_PROXY_PASSWORD?.trim() || undefined,
      },
    ];
  }
  const shared = parseProxy(process.env.RAPIDAPI_PROXY_URL?.trim() || process.env.TELEGRAM_PROXY_URL?.trim() || "");
  if (!shared) return [];
  if (shared.protocol === "http" || shared.protocol === "https") {
    return [{ ip: "127.0.0.1", port: 1080, socksType: 5 }];
  }
  const ports = [1080, 1081, shared.port];
  const seen = new Set<number>();
  return ports
    .filter((port) => {
      if (!Number.isFinite(port) || seen.has(port)) return false;
      seen.add(port);
      return true;
    })
    .map((port) => ({
      ip: shared.host,
      port,
      socksType: 5 as const,
      username: shared.username,
      password: shared.password,
    }));
}
