/** Telegram UI и запросы отключены (локальная разработка). */
export function isTelegramEnabled(): boolean {
  return import.meta.env.VITE_TELEGRAM_DISABLED !== "true";
}
