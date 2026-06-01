import "dotenv/config";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { runMacroMonthEndPrefetch } from "./jobs/macroCalendarPrefetchJob.js";
import { startMacroReleaseActualsScheduler, stopMacroReleaseActualsScheduler } from "./jobs/macroReleaseActualsScheduler.js";
import { runBondsYieldFredJob, runBondsYieldTradingViewJob } from "./jobs/bondsYieldDailyJob.js";
import { runTradingDayJob } from "./jobs/tradingDayJob.js";
import { registerAuthRoutes } from "./routes/authHandler.js";
import { registerMarketRoutes } from "./routes/market.js";
import { registerMacroRoutes } from "./routes/macro.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPortfolioRoutes } from "./routes/portfolio.js";
import { startBinanceCandleStream, stopBinanceCandleStream } from "./services/binanceCandleStream.js";

const prisma = new PrismaClient();

let tradingDayCron: ReturnType<typeof cron.schedule> | null = null;
let macroMonthEndCron: ReturnType<typeof cron.schedule> | null = null;
let macroReleaseSchedulerStop: (() => void) | null = null;
let bondsYieldTvCron: ReturnType<typeof cron.schedule> | null = null;
let bondsYieldFredCron: ReturnType<typeof cron.schedule> | null = null;

const app = Fastify({
  logger: true,
});

const corsOrigin = process.env.CORS_ORIGIN ?? true;

await app.register(cookie);
await app.register(cors, {
  origin: corsOrigin,
  credentials: true,
});

app.get("/health", async () => ({
  status: "ok" as const,
  timestamp: new Date().toISOString(),
}));

registerAuthRoutes(app);
registerMarketRoutes(app, prisma);
registerMacroRoutes(app, prisma);
registerPortfolioRoutes(app, prisma);
registerDashboardRoutes(app, prisma);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await prisma.$connect();

  if (process.env.BINANCE_WS_DISABLED !== "true") {
    const symbols = await prisma.cryptocurrencyList.findMany({
      select: { pairSymbol: true, symbol: true },
      orderBy: { symbol: "asc" },
    });
    const pairs = Array.from(
      new Set(symbols.map((row) => (row.pairSymbol?.trim() || `${row.symbol}USDT`).toUpperCase())),
    );
    startBinanceCandleStream(pairs, { log: app.log });
  }

  await app.listen({ port, host });

  if (process.env.TRADING_DAY_CRON_DISABLED !== "true") {
    tradingDayCron = cron.schedule(
      "1 0 * * *",
      () => {
        void runTradingDayJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info("Cron: tradingDay job at 00:00:01 Europe/Moscow (MSK)");
  }

  if (process.env.MACRO_PREFETCH_CRON_DISABLED !== "true") {
    macroMonthEndCron = cron.schedule(
      "58 23 * * *",
      () => {
        void runMacroMonthEndPrefetch(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info("Cron: macro month-end prefetch at 23:58 Europe/Moscow (next 2 months)");
  }

  if (process.env.MACRO_RELEASE_SCHEDULER_DISABLED !== "true") {
    macroReleaseSchedulerStop = startMacroReleaseActualsScheduler(app.log, prisma).stop;
  }

  if (process.env.BONDS_YIELD_CRON_DISABLED !== "true") {
    bondsYieldTvCron = cron.schedule(
      "0 15 * * *",
      () => {
        void runBondsYieldTradingViewJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    bondsYieldFredCron = cron.schedule(
      "15 15 * * *",
      () => {
        void runBondsYieldFredJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info("Cron: bonds yield TradingView at 15:00 MSK, FRED at 15:15 MSK");
  }
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}

const shutdown = async () => {
  tradingDayCron?.stop();
  tradingDayCron = null;
  macroMonthEndCron?.stop();
  macroMonthEndCron = null;
  macroReleaseSchedulerStop?.();
  macroReleaseSchedulerStop = null;
  bondsYieldTvCron?.stop();
  bondsYieldTvCron = null;
  bondsYieldFredCron?.stop();
  bondsYieldFredCron = null;
  stopMacroReleaseActualsScheduler();
  stopBinanceCandleStream();
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
