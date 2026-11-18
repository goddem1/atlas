import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const TOKEN_TTL_SEC = 60 * 60 * 12;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, number[]>();

export function adminUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || "admin";
}

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

function jwtSecret(): string {
  const secret = process.env.NEWS_JWT_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("NEWS_JWT_SECRET должен быть не короче 32 символов");
  }
  return secret;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function passwordsMatch(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(username: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    }),
  );
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", jwtSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string): { sub: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;
  const data = `${header}.${body}`;
  const expected = createHmac("sha256", jwtSecret()).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!payload.sub || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length < MAX_FAILURES;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);
  recent.push(now);
  failures.set(ip, recent);
}

export function checkLogin(username: string, password: string): boolean {
  if (!adminPassword()) return false;
  return passwordsMatch(username, adminUsername()) && passwordsMatch(password, adminPassword());
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? verifyToken(token) : null;
  if (!user) {
    await reply.status(401).send({ error: "Нужен вход" });
    return false;
  }
  return true;
}
