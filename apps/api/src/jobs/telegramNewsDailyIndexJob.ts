import type { PrismaClient } from "@prisma/client";
import {
  computeAndPersistDailyNewsIndex,
  resolveNewsWidgetMskDay,
} from "../services/newsWidgetLlm.js";

type JobLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/** Ежедневный расчёт индекса/топ-5 в ~23:00 МСК — один LLM-вызов на день. */
export async function runTelegramNewsDailyIndexJob(
  log: JobLog,
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.NEWS_WIDGET_LLM_CRON_DISABLED === "true") {
    log.info("[news-index-cron] disabled via NEWS_WIDGET_LLM_CRON_DISABLED");
    return;
  }

  const day = resolveNewsWidgetMskDay();
  log.info({ day }, "[news-index-cron] start");

  try {
    const result = await computeAndPersistDailyNewsIndex(prisma, {
      day,
      skipIfLlmExists: true,
      log,
    });
    log.info(
      {
        day: result.day,
        skipped: result.skipped,
        source: result.source,
        sentiment: result.sentiment,
        candidateCount: result.candidateCount,
      },
      "[news-index-cron] done",
    );
  } catch (err) {
    log.warn({ err, day }, "[news-index-cron] failed");
  }
}
