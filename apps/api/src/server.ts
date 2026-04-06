import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { runTradingDayJob } from "./jobs/tradingDayJob.js";
import { registerMarketRoutes } from "./routes/market.js";

const prisma = new PrismaClient();

let tradingDayCron: ReturnType<typeof cron.schedule> | null = null;

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true,
});

app.get("/health", async () => ({
  status: "ok" as const,
  timestamp: new Date().toISOString(),
}));

registerMarketRoutes(app, prisma);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await prisma.$connect();
  await app.listen({ port, host });

  if (process.env.TRADING_DAY_CRON_DISABLED !== "true") {
    tradingDayCron = cron.schedule(
      "55 23 * * *",
      () => {
        void runTradingDayJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info("Cron: tradingDay job at 23:55 Europe/Moscow (MSK)");
  }
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}

const shutdown = async () => {
  tradingDayCron?.stop();
  tradingDayCron = null;
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
