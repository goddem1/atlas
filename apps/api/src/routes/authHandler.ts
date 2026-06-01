import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../auth.js";

/** Публичный URL Better Auth (браузер: /api/auth/* → API: /auth/*). */
function buildAuthRequestUrl(request: FastifyRequest): string {
  const publicBase =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ??
    `http://${request.headers.host ?? `localhost:${process.env.PORT ?? 3001}`}/auth`;

  const rawUrl = request.url;
  const qIndex = rawUrl.indexOf("?");
  const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const query = qIndex === -1 ? "" : rawUrl.slice(qIndex);

  const suffix = pathname.replace(/^\/auth\/?/, "");
  const pathPart = suffix ? `/${suffix}` : "/";
  return `${publicBase}${pathPart}${query}`;
}

async function handleAuthRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = new URL(buildAuthRequestUrl(request));

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined && request.body !== null) {
    body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  const req = new Request(url.toString(), {
    method: request.method,
    headers,
    body,
  });

  const response = await auth.handler(req);
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  const text = await response.text();
  reply.send(text.length > 0 ? text : null);
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    handler: handleAuthRequest,
  });
}
