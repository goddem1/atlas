type LoggerLike = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export function mskNowLabel(now = new Date()): string {
  return now.toLocaleString("sv-SE", { timeZone: "Europe/Moscow" });
}

/** Лог при старте API: включён ли cron и есть ли ключи (без значений). */
export function logBondsYieldCronStatus(log: LoggerLike): void {
  const disabled = process.env.BONDS_YIELD_CRON_DISABLED === "true";
  const primary = Boolean(process.env.RAPIDAPI_KEY?.trim());
  const secondary = Boolean(process.env.RAPIDAPI_KEY_SECONDARY?.trim());

  const payload = {
    disabled,
    rapidApiKeyPrimary: primary,
    rapidApiKeySecondary: secondary,
    fredApiKey: Boolean(process.env.FRED_API_KEY?.trim()),
    tvCron: "0 15 * * * Europe/Moscow",
    fredCron: "15 15 * * * Europe/Moscow",
    startedAtMsk: mskNowLabel(),
  };

  if (disabled) {
    log.warn(payload, "[bonds] cron DISABLED (BONDS_YIELD_CRON_DISABLED=true)");
    return;
  }
  if (!primary) {
    log.warn(payload, "[bonds] cron enabled but RAPIDAPI_KEY is missing — TV job will fail");
    return;
  }
  log.info(payload, "[bonds] cron enabled (TV 15:00 MSK, FRED 15:15 MSK)");
}
