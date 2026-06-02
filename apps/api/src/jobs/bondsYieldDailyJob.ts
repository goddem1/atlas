import type { PrismaClient } from "@prisma/client";
import { mskNowLabel } from "../services/bondsYieldCronStatus.js";
import { refreshBondsYieldFromFred } from "../services/bondsYieldFredRefresh.js";
import { refreshBondsYieldFromTradingView } from "../services/bondsYieldTradingViewRefresh.js";

type JobLog = {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
};

function toLogger(log: JobLog) {
  return {
    info: (msg: string) => log.info(msg),
    warn: (msg: string) => log.warn(msg),
    error: (msg: string) => log.error(msg),
  };
}

export async function runBondsYieldTradingViewJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  const logger = toLogger(log);
  log.info({ startedAtMsk: mskNowLabel() }, "[bonds-tv] cron tick started");
  try {
    const result = await refreshBondsYieldFromTradingView(prisma, logger);
    log.info(
      {
        closeTime: result.closeTime,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      },
      "[bonds-tv] daily refresh done",
    );
  } catch (err) {
    log.error({ err }, "[bonds-tv] daily refresh failed");
  }
}

export async function runBondsYieldFredJob(log: JobLog, prisma: PrismaClient): Promise<void> {
  const logger = toLogger(log);
  log.info({ startedAtMsk: mskNowLabel() }, "[bonds-fred] cron tick started");
  try {
    const result = await refreshBondsYieldFromFred(prisma, logger);
    log.info(
      {
        observationStart: result.observationStart,
        observationEnd: result.observationEnd,
        upserted: result.upserted,
        skipped: result.skipped,
        errors: result.errors,
      },
      "[bonds-fred] daily refresh done",
    );
  } catch (err) {
    log.error({ err }, "[bonds-fred] daily refresh failed");
  }
}
