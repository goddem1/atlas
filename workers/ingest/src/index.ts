import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@atlas-v1/news-schema/generated/client/index.js";
import { Api, TelegramClient } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { EditedMessage } from "telegram/events/EditedMessage.js";
import { DeletedMessage } from "telegram/events/DeletedMessage.js";
import { FloodWaitError } from "telegram/errors/index.js";
import { markDeleted, upsertIncomingMessage, type IncomingMessage } from "./persist.js";
import { telegramProxyCandidates } from "./proxy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
dotenv.config({ path: path.join(repoRoot, "apps/news-api/.env") });
dotenv.config({ path: path.join(repoRoot, "apps/api/.env") });

const prisma = new PrismaClient();
const pauseMs = Number(process.env.INGEST_PAUSE_MS ?? 1000);
const backfillDays = Number(process.env.INGEST_BACKFILL_DAYS ?? 30);
const reconcileMs = 60 * 60 * 1000;

type KnownChannel = { id: string; username: string; tgId: string | null };

const known = new Map<string, KnownChannel>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asDate(value: Date | number | undefined | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
}

function mediaKinds(message: Api.Message): string[] {
  if (!message.media) return [];
  return [message.media.className.replace(/^MessageMedia/, "").toLowerCase()];
}

function toIncoming(message: Api.Message): IncomingMessage | null {
  if (!message.id || message.className !== "Message") return null;
  const postedAt = asDate(message.date);
  if (!postedAt) return null;
  const reply = message.replyTo;
  const replyId =
    reply && "replyToMsgId" in reply && typeof reply.replyToMsgId === "number" ? reply.replyToMsgId : null;
  const fwd = message.fwdFrom;
  const forwardedFrom =
    fwd && "fromName" in fwd && typeof fwd.fromName === "string"
      ? fwd.fromName
      : fwd
        ? "forward"
        : null;
  return {
    tgMsgId: message.id,
    postedAt,
    text: message.message ?? "",
    replyToTgMsgId: replyId,
    isForward: Boolean(fwd),
    forwardedFrom,
    mediaKinds: mediaKinds(message),
    editedAt: asDate(message.editDate),
  };
}

async function rememberError(channelId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "ingest error";
  const floodWaitUntil =
    error instanceof FloodWaitError ? new Date(Date.now() + error.seconds * 1000) : undefined;
  await prisma.ingestState.upsert({
    where: { channelId },
    create: { channelId, lastError: message.slice(0, 500), floodWaitUntil },
    update: { lastError: message.slice(0, 500), floodWaitUntil },
  });
}

async function clearError(channelId: string, lastTgMsgId?: number): Promise<void> {
  await prisma.ingestState.upsert({
    where: { channelId },
    create: { channelId, lastSyncAt: new Date(), lastTgMsgId, lastError: null },
    update: { lastSyncAt: new Date(), lastError: null, ...(lastTgMsgId != null ? { lastTgMsgId } : {}) },
  });
}

async function saveChannelMessage(
  channelId: string,
  message: Api.Message,
  backfilled: boolean,
): Promise<void> {
  const incoming = toIncoming(message);
  if (!incoming) return;
  await upsertIncomingMessage(prisma, channelId, incoming, backfilled);
}

function peerChannelId(peer: unknown): string {
  if (peer == null) return "";
  if (typeof peer === "string" || typeof peer === "number" || typeof peer === "bigint") return String(peer);
  if (typeof peer !== "object") return "";
  const record = peer as { channelId?: unknown; id?: unknown };
  const raw = record.channelId ?? record.id;
  if (raw == null) return "";
  return String(raw);
}

function channelByPeer(peer: unknown): KnownChannel | undefined {
  const id = peerChannelId(peer).replace(/^-100/, "");
  if (!id) return undefined;
  for (const channel of known.values()) {
    const stored = (channel.tgId ?? "").replace(/^-100/, "");
    if (stored && stored === id) return channel;
  }
  return undefined;
}

async function backfill(client: TelegramClient, channel: KnownChannel): Promise<void> {
  const state = await prisma.ingestState.findUnique({ where: { channelId: channel.id } });
  if (state?.floodWaitUntil && state.floodWaitUntil.getTime() > Date.now()) return;
  if (state?.lastSyncAt) return;
  const entity = await client.getEntity(channel.username);
  const tgId = "id" in entity ? String(entity.id) : null;
  const title = "title" in entity && typeof entity.title === "string" ? entity.title : channel.username;
  await prisma.channel.update({ where: { id: channel.id }, data: { tgId, title } });
  channel.tgId = tgId;
  known.set(channel.id, channel);

  const cutoff = Date.now() - backfillDays * 24 * 60 * 60 * 1000;
  let newest = 0;
  for await (const message of client.iterMessages(entity, { waitTime: pauseMs / 1000 })) {
    if (!(message instanceof Api.Message)) continue;
    const postedAt = asDate(message.date);
    if (!postedAt || postedAt.getTime() < cutoff) break;
    await saveChannelMessage(channel.id, message, true);
    if (message.id > newest) newest = message.id;
  }
  await clearError(channel.id, newest || undefined);
}

async function reconcile(client: TelegramClient, channel: KnownChannel): Promise<void> {
  if (!channel.tgId) return;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.message.findMany({
    where: { channelId: channel.id, postedAt: { gte: since }, isDeleted: false },
    select: { tgMsgId: true },
  });
  if (rows.length === 0) return;
  const entity = await client.getEntity(channel.username);
  const missing: number[] = [];
  for (let i = 0; i < rows.length; i += 80) {
    const chunk = rows.slice(i, i + 80).map((row) => row.tgMsgId);
    const remote = await client.getMessages(entity, { ids: chunk });
    remote.forEach((message, index) => {
      const id = chunk[index];
      if (id == null) return;
      const kind = (message as { className?: string } | undefined)?.className;
      if (!message || kind === "MessageEmpty") missing.push(id);
    });
    await sleep(pauseMs);
  }
  await markDeleted(prisma, channel.id, missing);
  await clearError(channel.id);
}

async function refreshKnown(): Promise<void> {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    select: { id: true, username: true, tgId: true },
  });
  known.clear();
  for (const channel of channels) known.set(channel.id, channel);
}

async function main(): Promise<void> {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID ?? "", 10);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? "";
  const session = process.env.TELEGRAM_SESSION?.trim() ?? "";
  if (!apiId || !apiHash || !session) {
    throw new Error("Нет TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION. Берутся из apps/api/.env Panorama.");
  }
  const proxies = telegramProxyCandidates();
  const attempts = [undefined, ...proxies];
  let client: TelegramClient | null = null;
  let lastErr: unknown;
  for (const proxy of attempts) {
    const next = new TelegramClient(new StringSession(session), apiId, apiHash, {
      connectionRetries: 2,
      baseLogger: new Logger(LogLevel.NONE),
      ...(proxy ? { proxy } : {}),
    });
    try {
      console.log(proxy ? `подключение через ${proxy.ip}:${proxy.port}` : "подключение без прокси");
      const ready = (async () => {
        await next.connect();
        console.log("сокет есть, проверяю сессию");
        if (!(await next.isUserAuthorized())) {
          throw new Error("Telegram-сессия Panorama не авторизована");
        }
        console.log("сессия ок");
      })();
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("таймаут подключения к Telegram")), 20000);
        }),
      ]);
      client = next;
      break;
    } catch (err) {
      lastErr = err instanceof Error ? new Error(err.message) : new Error("не удалось подключиться");
      console.log(lastErr.message);
      await Promise.race([
        next.disconnect().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
  }
  if (!client) throw lastErr instanceof Error ? lastErr : new Error("Не удалось подключиться к Telegram");

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!(message instanceof Api.Message)) return;
      const channel = channelByPeer(message.peerId);
      if (!channel) return;
      await saveChannelMessage(channel.id, message, false);
      await clearError(channel.id, message.id);
    } catch (err) {
      console.error("new message", err);
    }
  }, new NewMessage({}));

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!(message instanceof Api.Message)) return;
      const channel = channelByPeer(message.peerId);
      if (!channel) return;
      await saveChannelMessage(channel.id, message, false);
    } catch (err) {
      console.error("edit", err);
    }
  }, new EditedMessage({}));

  client.addEventHandler(async (event) => {
    try {
      const channel = channelByPeer(event.peer);
      if (!channel || !Array.isArray(event.deletedIds)) return;
      await markDeleted(prisma, channel.id, event.deletedIds.filter((id) => typeof id === "number"));
    } catch (err) {
      console.error("delete", err);
    }
  }, new DeletedMessage({}));

  const tick = async () => {
    await refreshKnown();
    for (const channel of known.values()) {
      try {
        await backfill(client, channel);
      } catch (err) {
        if (err instanceof FloodWaitError) await sleep(err.seconds * 1000);
        await rememberError(channel.id, err);
        console.error(channel.username, err);
      }
      await sleep(pauseMs);
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, 20_000);
  setInterval(() => {
    void (async () => {
      for (const channel of known.values()) {
        try {
          await reconcile(client, channel);
        } catch (err) {
          await rememberError(channel.id, err);
        }
      }
    })();
  }, reconcileMs);
  console.log("news ingest listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
