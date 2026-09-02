import type { PrismaClient } from "@prisma/client";
import { refreshMarketIndicesDaily } from "../services/marketIndicesDailyRefresh.js";

type JobLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/** @deprecated Use runMarketIndicesDailyJob — kept for imports. */
export async function runCmcDailySnapshotJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  return runMarketIndicesDailyJob(log, prisma);
}

/** Ежедневное обновление рыночных индексов в 23:59 МСК. */
export async function runMarketIndicesDailyJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  if (process.env.CMC_DAILY_SNAPSHOT_CRON_DISABLED === "true") {
    log.info("[marketIndicesDaily] disabled via CMC_DAILY_SNAPSHOT_CRON_DISABLED");
    return;
  }

  try {
    const result = await refreshMarketIndicesDaily(prisma, log);
    log.info(result, "[marketIndicesDaily] done");
  } catch (err) {
    log.warn({ err }, "[marketIndicesDaily] failed");
  }
}
