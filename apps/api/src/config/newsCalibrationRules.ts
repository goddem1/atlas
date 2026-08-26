export const NEWS_CALIBRATION_DURABLE_RULES: string[] = [
  // Пример — добавлять сюда по мере появления устойчивых паттернов:
  // "Листинги на биржах для некрупных альткоинов — вес не выше 2, даже при явном факте.",
];

export function formatDurableRulesBlock(): string {
  if (NEWS_CALIBRATION_DURABLE_RULES.length === 0) return "";
  return (
    "## Постоянные правила калибровки от автора проекта:\n" +
    NEWS_CALIBRATION_DURABLE_RULES.map((r) => `- ${r}`).join("\n")
  );
}
