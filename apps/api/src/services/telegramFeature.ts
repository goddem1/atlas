/** Полное отключение Telegram (sync, cron, MTProto) — для локальной разработки. */
export function isTelegramDisabled(): boolean {
  return process.env.TELEGRAM_DISABLED === "true";
}

export function telegramDisabledNewsWidgetPayload() {
  return {
    sentiment: 50,
    why: "Telegram отключён в этой среде.",
    explanation: {
      formula: "Telegram отключён (TELEGRAM_DISABLED=true).",
      notes: [],
    },
    items: [],
    cached: false,
    updatedAt: new Date().toISOString(),
  };
}
