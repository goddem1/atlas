import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { runMacroMonthEndPrefetch } from "./jobs/macroCalendarPrefetchJob.js";
import { startMacroReleaseActualsScheduler, stopMacroReleaseActualsScheduler } from "./jobs/macroReleaseActualsScheduler.js";
import { runBondsYieldFredJob, runBondsYieldTradingViewJob } from "./jobs/bondsYieldDailyJob.js";
import { logBondsYieldCronStatus } from "./services/bondsYieldCronStatus.js";
import { runTradingDayJob } from "./jobs/tradingDayJob.js";
import { runTelegramNewsDailyIndexJob } from "./jobs/telegramNewsDailyIndexJob.js";
import { runMarketIndicesDailyJob } from "./jobs/marketIndicesDailyJob.js";
import { registerAuthRoutes } from "./routes/authHandler.js";
import { registerMarketRoutes } from "./routes/market.js";
import { registerMarketIndicesRoutes } from "./routes/marketIndices.js";
import { registerMacroRoutes } from "./routes/macro.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerKlineChartPrefsRoutes } from "./routes/klineChartPrefs.js";
import { registerPortfolioRoutes } from "./routes/portfolio.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerTelegramNewsRoutes } from "./routes/telegramNews.js";
import { registerNotesRoutes } from "./routes/notes.js";
import { registerTradesRoutes } from "./routes/trades.js";
import { startBinanceCandleStream, stopBinanceCandleStream } from "./services/binanceCandleStream.js";
import { isTelegramDisabled } from "./services/telegramFeature.js";
import { startCmcMarketIndicesLiveRefresh } from "./services/cmcMarketIndicesLive.js";
import { startTelegramNewsAutoSync } from "./services/telegramNewsSync.js";

const prisma = new PrismaClient();

let tradingDayCron: ReturnType<typeof cron.schedule> | null = null;
let macroMonthEndCron: ReturnType<typeof cron.schedule> | null = null;
let macroReleaseSchedulerStop: (() => void) | null = null;
let bondsYieldTvCron: ReturnType<typeof cron.schedule> | null = null;
let bondsYieldFredCron: ReturnType<typeof cron.schedule> | null = null;
let telegramNewsIndexCron: ReturnType<typeof cron.schedule> | null = null;
let cmcDailySnapshotCron: ReturnType<typeof cron.schedule> | null = null;
let stopCmcLiveRefresh: (() => void) | null = null;
let stopTelegramNewsAutoSync: (() => void) | null = null;

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
registerMarketIndicesRoutes(app, prisma);
registerMacroRoutes(app, prisma);
registerPortfolioRoutes(app, prisma);
registerProfileRoutes(app, prisma);
registerDashboardRoutes(app, prisma);
registerKlineChartPrefsRoutes(app, prisma);
registerTelegramNewsRoutes(app, prisma);
registerNotesRoutes(app, prisma);
registerTradesRoutes(app, prisma);

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

  logBondsYieldCronStatus(app.log);
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
  }

  stopCmcLiveRefresh = startCmcMarketIndicesLiveRefresh(app.log);

  if (isTelegramDisabled()) {
    app.log.info("[telegram-news] disabled via TELEGRAM_DISABLED");
  } else {
    stopTelegramNewsAutoSync = await startTelegramNewsAutoSync(prisma, app.log);
  }

  if (!isTelegramDisabled() && process.env.NEWS_WIDGET_LLM_CRON_DISABLED !== "true") {
    telegramNewsIndexCron = cron.schedule(
      "0 23 * * *",
      () => {
        void runTelegramNewsDailyIndexJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info("Cron: telegram news daily index at 23:00 Europe/Moscow (one LLM call/day)");
  }

  if (process.env.CMC_DAILY_SNAPSHOT_CRON_DISABLED !== "true") {
    cmcDailySnapshotCron = cron.schedule(
      "59 23 * * *",
      () => {
        void runMarketIndicesDailyJob(app.log, prisma);
      },
      { timezone: "Europe/Moscow" },
    );
    app.log.info(
      "Cron: market indices daily refresh at 23:59 Europe/Moscow (CMC + TV VIX/DXY)",
    );
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
  telegramNewsIndexCron?.stop();
  telegramNewsIndexCron = null;
  cmcDailySnapshotCron?.stop();
  cmcDailySnapshotCron = null;
  stopCmcLiveRefresh?.();
  stopCmcLiveRefresh = null;
  stopTelegramNewsAutoSync?.();
  stopTelegramNewsAutoSync = null;
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
