import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { PrismaClient, type ChannelKind } from "@atlas-v1/news-schema/generated/client/index.js";
import { ensureCatalog } from "@atlas-v1/news-core";
import { checkLogin, loginAllowed, recordLoginFailure, requireUser, signToken } from "./auth.js";
import { isChannelUsername, normalizeChannelUsername } from "./channels.js";
import { registerCallRoutes } from "./calls.js";
import { registerServiceRoutes } from "./service.js";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
const port = Number(process.env.NEWS_API_PORT ?? 3101);
const host = process.env.NEWS_API_HOST ?? "0.0.0.0";
const webOrigin = process.env.NEWS_WEB_ORIGIN ?? "http://localhost:5174";

await app.register(cors, { origin: webOrigin, credentials: true });

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Robots-Tag", "noindex, nofollow");
  return payload;
});

app.get("/api/health", async () => ({
  status: "ok" as const,
  host: process.env.APP_HOST ?? "scrtnews.panoramaapp.ru",
  timestamp: new Date().toISOString(),
}));

app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (req, reply) => {
  const ip = req.ip || "unknown";
  if (!loginAllowed(ip)) {
    return reply.status(429).send({ error: "Слишком много попыток. Подождите 15 минут" });
  }
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkLogin(username, password)) {
    recordLoginFailure(ip);
    return reply.status(401).send({ error: "Неверный логин или пароль" });
  }
  return { token: signToken(username.trim()) };
});

app.get("/api/channels", async (req, reply) => {
  if (!(await requireUser(req, reply))) return;
  const channels = await prisma.channel.findMany({
    orderBy: { addedAt: "desc" },
    include: {
      ingest: true,
      _count: { select: { messages: true } },
    },
  });
  return channels.map((channel) => ({
    id: channel.id,
    username: channel.username,
    title: channel.title,
    kind: channel.kind,
    notes: channel.notes,
    isActive: channel.isActive,
    addedAt: channel.addedAt.toISOString(),
    messageCount: channel._count.messages,
    lastSyncAt: channel.ingest?.lastSyncAt?.toISOString() ?? null,
    lastError: channel.ingest?.lastError ?? null,
    floodWaitUntil: channel.ingest?.floodWaitUntil?.toISOString() ?? null,
  }));
});

app.post<{ Body: { username?: string; kind?: ChannelKind; notes?: string } }>(
  "/api/channels",
  async (req, reply) => {
    if (!(await requireUser(req, reply))) return;
    const username = normalizeChannelUsername(typeof req.body?.username === "string" ? req.body.username : "");
    if (!isChannelUsername(username)) {
      return reply.status(400).send({ error: "Нужен публичный username канала, например cryptoattack24" });
    }
    const kind = req.body?.kind === "news" ? "news" : "opinion";
    const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 500) : "";
    const existing = await prisma.channel.findUnique({ where: { username } });
    if (existing) {
      return reply.status(409).send({ error: "Такой канал уже добавлен" });
    }
    const channel = await prisma.channel.create({
      data: { username, kind, notes, ingest: { create: {} } },
    });
    return reply.status(201).send({ id: channel.id, username: channel.username });
  },
);

app.delete<{ Params: { id: string } }>("/api/channels/:id", async (req, reply) => {
  if (!(await requireUser(req, reply))) return;
  const existing = await prisma.channel.findUnique({ where: { id: req.params.id } });
  if (!existing) return reply.status(404).send({ error: "Канал не найден" });
  await prisma.channel.delete({ where: { id: existing.id } });
  return reply.status(204).send();
});

app.get<{ Params: { id: string } }>("/api/channels/:id/messages", async (req, reply) => {
  if (!(await requireUser(req, reply))) return;
  const messages = await prisma.message.findMany({
    where: { channelId: req.params.id },
    orderBy: { postedAt: "desc" },
    take: 30,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  return messages.map((message) => ({
    id: message.id,
    tgMsgId: message.tgMsgId,
    postedAt: message.postedAt.toISOString(),
    isDeleted: message.isDeleted,
    backfilled: message.backfilled,
    editedBeforeIngest: message.editedBeforeIngest,
    versionCount: message.versions.length,
    text: message.versions[0]?.text ?? "",
  }));
});

registerServiceRoutes(app, prisma);
registerCallRoutes(app, prisma);

try {
  await prisma.$connect();
  await ensureCatalog(prisma);
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
