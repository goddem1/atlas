export type GoldItem = {
  msgType: string | null;
  fieldErrors: string[];
  missedSignal: boolean;
};

export type GoldScore = {
  key: string;
  value: number | null;
  n: number;
  status: "ok" | "insufficient_data";
};

export type MetricPoint = {
  key: string;
  value: number | null;
  n: number;
  status: string;
};

export function evalSkipReason(labeled: number): string | null {
  if (labeled <= 0) return "Золотой набор пуст: размеченных сообщений нет, модель не вызывается";
  return null;
}

export function activationDecision(input: { labeled: number; evalRan: boolean }): { ok: boolean; reason: string } {
  if (input.labeled < 1) return { ok: false, reason: "Золотой набор пуст, сравнивать нечего" };
  if (!input.evalRan) return { ok: false, reason: "Сначала прогоните версию на золотом наборе" };
  return { ok: true, reason: "Можно включить вручную" };
}

export function scoreGold(items: GoldItem[], minN: number): GoldScore[] {
  const predicted = items.filter((item) => item.msgType === "signal");
  const precise = predicted.filter((item) => !item.fieldErrors.includes("msgType")).length;
  const real = items.filter((item) => item.missedSignal || (item.msgType === "signal" && !item.fieldErrors.includes("msgType")));
  const found = real.filter((item) => item.msgType === "signal" && !item.fieldErrors.includes("msgType")).length;
  const score = (key: string, successes: number, n: number): GoldScore => ({
    key,
    value: n > 0 ? successes / n : null,
    n,
    status: n >= minN ? "ok" : "insufficient_data",
  });
  return [
    score("signal_precision", precise, predicted.length),
    score("signal_recall", found, real.length),
    { key: "gold_set_size", value: items.length, n: items.length, status: items.length >= minN ? "ok" : "insufficient_data" },
  ];
}

export function diffMetrics(base: MetricPoint[], next: MetricPoint[]): Array<{ key: string; base: MetricPoint | null; next: MetricPoint | null; delta: number | null }> {
  const keys = [...new Set([...base, ...next].map((point) => point.key))];
  return keys.map((key) => {
    const left = base.find((point) => point.key === key) ?? null;
    const right = next.find((point) => point.key === key) ?? null;
    const delta = left?.value != null && right?.value != null ? right.value - left.value : null;
    return { key, base: left, next: right, delta };
  });
}
