function readEmbeddingConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
} | null {
  const apiKey = (process.env.EMBEDDING_API_KEY ?? process.env.LLM_API_KEY)?.trim() ?? "";
  if (!apiKey) return null;
  const baseUrl = (
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    "https://polza.ai/api/v1"
  ).replace(/\/$/, "");
  const model = process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  return { baseUrl, apiKey, model };
}

export function getEmbeddingModelName(): string {
  return process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}

async function postEmbeddings(input: string | string[]): Promise<number[][]> {
  const config = readEmbeddingConfig();
  if (!config) {
    throw new Error("EMBEDDING_API_KEY or LLM_API_KEY is not configured");
  }

  const res = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = data.data ?? [];
  if (rows.length === 0) throw new Error("Embedding response is empty");

  return rows
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding ?? []);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await postEmbeddings(text);
  if (!embedding?.length) throw new Error("Embedding vector is empty");
  return embedding;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await generateEmbedding(texts[0]!)];
  const embeddings = await postEmbeddings(texts);
  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding batch size mismatch: ${embeddings.length} vs ${texts.length}`);
  }
  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findRelevantFeedback(
  candidateEmbeddings: number[][],
  feedbackEntries: { id: string; embedding: number[] }[],
  topK = 8,
  minSimilarity = 0.75,
): string[] {
  const scored = new Map<string, number>();
  for (const candEmb of candidateEmbeddings) {
    for (const fb of feedbackEntries) {
      if (fb.embedding.length === 0) continue;
      const sim = cosineSimilarity(candEmb, fb.embedding);
      if (sim >= minSimilarity) {
        const prev = scored.get(fb.id) ?? 0;
        if (sim > prev) scored.set(fb.id, sim);
      }
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => id);
}

export function readFeedbackFewshotConfig(): { topK: number; minSimilarity: number } {
  const topKRaw = Number.parseInt(process.env.NEWS_FEEDBACK_FEWSHOT_COUNT ?? "8", 10);
  const minSimRaw = Number.parseFloat(process.env.NEWS_FEEDBACK_MIN_SIMILARITY ?? "0.75");
  return {
    topK: Number.isFinite(topKRaw) ? Math.min(20, Math.max(1, topKRaw)) : 8,
    minSimilarity: Number.isFinite(minSimRaw) ? Math.min(0.99, Math.max(0.5, minSimRaw)) : 0.75,
  };
}
