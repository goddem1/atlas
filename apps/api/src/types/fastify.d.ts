import type { SessionUser } from "../middleware/requireSession.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}
