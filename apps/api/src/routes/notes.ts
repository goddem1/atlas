import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireNotesSession } from "../middleware/requireNotesSession.js";
import {
  createUserNote,
  deleteUserNote,
  getUserNote,
  listUserNotes,
  updateUserNote,
} from "../services/notesService.js";
import {
  createLocalUploadUrls,
  isLocalNotesMediaEnabled,
  readLocalNoteMedia,
  saveLocalNoteMedia,
} from "../services/notesLocalMedia.js";
import { getPresignedUploadUrl, isR2Configured } from "../services/r2Storage.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      image?: string | null;
    };
  }
}

function notesPublicPlugin(): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { key: string } }>("/notes/media/:key", async (req, reply) => {
      if (!isLocalNotesMediaEnabled()) {
        return reply.status(404).send();
      }
      const file = await readLocalNoteMedia(req.params.key);
      if (!file) return reply.status(404).send();
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("Content-Type", file.contentType);
      return reply.send(file.buffer);
    });
  };
}

function notesPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.addContentTypeParser(/^image\//, { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    app.addHook("preHandler", async (request, reply) => {
      const user = await requireNotesSession(request, reply, prisma);
      if (!user) return;
      request.user = user;
    });

    app.get("/notes", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return listUserNotes(prisma, req.user!.id);
    });

    app.put<{ Params: { key: string } }>("/notes/local-upload/:key", async (req, reply) => {
      if (!isLocalNotesMediaEnabled() || isR2Configured()) {
        return reply.status(404).send({ error: "Not found" });
      }
      const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.status(400).send({ error: "Image body is required" });
      }
      try {
        await saveLocalNoteMedia(req.params.key, body, contentType);
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save image";
        return reply.status(400).send({ error: message });
      }
    });

    app.get<{ Params: { id: string } }>("/notes/:id", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const note = await getUserNote(prisma, req.user!.id, req.params.id);
      if (!note) return reply.status(404).send({ error: "Note not found" });
      return note;
    });

    app.post<{ Body: { title?: string; content?: unknown } }>("/notes", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const note = await createUserNote(prisma, req.user!.id, req.body ?? {});
      return reply.status(201).send(note);
    });

    app.patch<{ Params: { id: string }; Body: { title?: string; content?: unknown } }>(
      "/notes/:id",
      async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        const note = await updateUserNote(prisma, req.user!.id, req.params.id, req.body ?? {});
        if (!note) return reply.status(404).send({ error: "Note not found" });
        return note;
      },
    );

    app.delete<{ Params: { id: string } }>("/notes/:id", async (req, reply) => {
      const ok = await deleteUserNote(prisma, req.user!.id, req.params.id);
      if (!ok) return reply.status(404).send({ error: "Note not found" });
      return reply.status(204).send();
    });

    app.post<{ Body: { contentType?: string } }>("/notes/upload-url", async (req, reply) => {
      const contentType = req.body?.contentType?.trim() ?? "";
      if (!contentType.startsWith("image/")) {
        return reply.status(400).send({ error: "contentType must be an image/* MIME type" });
      }

      if (isR2Configured()) {
        try {
          return await getPresignedUploadUrl(contentType);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create upload URL";
          return reply.status(500).send({ error: message });
        }
      }

      if (isLocalNotesMediaEnabled()) {
        return createLocalUploadUrls(contentType);
      }

      return reply.status(503).send({ error: "Image upload is not configured" });
    });
  };
}

export function registerNotesRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  void app.register(notesPublicPlugin());
  void app.register(notesPlugin(prisma));
}
