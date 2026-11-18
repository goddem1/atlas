import { z } from "zod";

export const MSG_TYPES = ["signal", "view", "news", "result", "ad", "noise"] as const;
export type MsgTypeName = (typeof MSG_TYPES)[number];

const directionSchema = z.enum(["long", "short", "neutral"]).nullable();
const numberOrNull = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().nullable());

const coinSchema = z.object({
  raw_mention: z.string().default(""),
  direction: directionSchema.optional().nullable(),
  stance: z.number().min(-1).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidence: z.string().nullable().optional(),
});

export const extractionSchema = z.object({
  msg_type: z.enum(MSG_TYPES),
  coins: z.array(coinSchema).default([]),
  direction: directionSchema.optional().nullable(),
  stance: z.number().min(-1).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1),
  entry_low: numberOrNull.optional().nullable(),
  entry_high: numberOrNull.optional().nullable(),
  stop: numberOrNull.optional().nullable(),
  targets: z.array(numberOrNull).optional().default([]),
  horizon: z.enum(["days", "weeks", "months", "unknown"]).optional().default("unknown"),
  leverage_mentioned: numberOrNull.optional().nullable(),
  market_view: z
    .object({
      stance: z.number().min(-1).max(1),
      confidence: z.number().min(0).max(1),
      themes: z.array(z.string()).optional().default([]),
    })
    .nullable()
    .optional(),
  refers_to_previous: z.boolean().optional().default(false),
  update_hint: z.string().nullable().optional(),
  update_type: z
    .enum(["stop_moved", "partial_take", "closed_profit", "closed_loss", "invalidated", "comment"])
    .nullable()
    .optional(),
  is_ad: z.boolean().optional().default(false),
  ad_markers: z.array(z.string()).optional().default([]),
  evidence: z.string().default(""),
});

export type ParsedExtraction = z.infer<typeof extractionSchema>;

const AD_RULES: Array<[RegExp, string]> = [
  [/реклам/i, "реклама"],
  [/erid/i, "erid"],
  [/промокод/i, "промокод"],
  [/реферал/i, "реферал"],
  [/t\.me\/\+/i, "реферальная ссылка"],
];

export function numberAppears(text: string, value: number | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  const folded = text.replace(/[\s\u00a0]/g, "").replace(/,/g, ".");
  const token = String(value);
  let from = 0;
  while (from <= folded.length) {
    const index = folded.indexOf(token, from);
    if (index < 0) return false;
    const before = folded[index - 1] ?? "";
    const after = folded[index + token.length] ?? "";
    const leftOk = !/[0-9.]/.test(before);
    const rightOk = !/[0-9]/.test(after);
    if (leftOk && rightOk) return true;
    from = index + 1;
  }
  return false;
}

export function quoteIsSubstring(text: string, quote: string | null | undefined): boolean {
  const needle = quote?.trim() ?? "";
  return needle.length > 0 && text.includes(needle);
}

export function detectAdMarkers(text: string): string[] {
  return AD_RULES.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
}

export type CheckedExtraction = {
  schemaValid: boolean;
  evidenceValid: boolean;
  parsed: ParsedExtraction | null;
  errors: string[];
  rejectedLevels: string[];
};

export function checkExtraction(text: string, raw: unknown): CheckedExtraction {
  const parsedResult = extractionSchema.safeParse(raw);
  if (!parsedResult.success) {
    return {
      schemaValid: false,
      evidenceValid: false,
      parsed: null,
      errors: parsedResult.error.issues.map((issue) => issue.message),
      rejectedLevels: [],
    };
  }
  const parsed = parsedResult.data;
  const rejectedLevels: string[] = [];
  const levels: Array<["entry_low" | "entry_high" | "stop" | "leverage_mentioned", number | null | undefined]> = [
    ["entry_low", parsed.entry_low],
    ["entry_high", parsed.entry_high],
    ["stop", parsed.stop],
    ["leverage_mentioned", parsed.leverage_mentioned],
  ];
  for (const [field, value] of levels) {
    if (value == null) continue;
    if (!numberAppears(text, value)) {
      parsed[field] = null;
      rejectedLevels.push(field);
    }
  }
  parsed.targets = (parsed.targets ?? []).filter((value): value is number => {
    if (value == null) return false;
    if (numberAppears(text, value)) return true;
    rejectedLevels.push("targets");
    return false;
  });
  const markers = Array.from(new Set([...(parsed.ad_markers ?? []), ...detectAdMarkers(text)]));
  parsed.ad_markers = markers;
  if (markers.length > 0) parsed.is_ad = true;
  const evidenceValid = quoteIsSubstring(text, parsed.evidence);
  return { schemaValid: true, evidenceValid, parsed, errors: [], rejectedLevels };
}

export type AliasRow = { alias: string; coinId: string; symbol: string };

export function normalizeMention(raw: string): string {
  return raw.trim().toLowerCase().replace(/^[$#!]+/, "").replace(/\s+/g, " ");
}

export function resolveMention(raw: string, aliases: AliasRow[]): {
  status: "resolved" | "ambiguous" | "unknown";
  coinId: string | null;
  symbol: string | null;
} {
  const key = normalizeMention(raw);
  if (!key) return { status: "unknown", coinId: null, symbol: null };
  const hits = aliases.filter((row) => row.alias === key);
  const coinIds = Array.from(new Set(hits.map((hit) => hit.coinId)));
  if (coinIds.length === 1) {
    const hit = hits[0];
    return { status: "resolved", coinId: hit?.coinId ?? null, symbol: hit?.symbol ?? null };
  }
  if (coinIds.length > 1) return { status: "ambiguous", coinId: null, symbol: null };
  return { status: "unknown", coinId: null, symbol: null };
}

export function parseModelJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(trimmed);
}
