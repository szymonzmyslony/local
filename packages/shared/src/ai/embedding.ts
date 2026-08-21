import { embed, embedMany } from "ai";
import { AI_CONFIG } from "../config/ai";
import { createZineProvider } from "./provider";

export type Embedder = (text: string) => Promise<number[]>;
export type BatchEmbedder = (texts: string[]) => Promise<number[][]>;

export function createEmbedder(apiKey: string): Embedder {
  const openrouter = createZineProvider(apiKey);
  const model = openrouter.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL);

  return async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const { embedding } = await embed({
      model,
      value: trimmed,
      maxRetries: AI_CONFIG.MAX_RETRIES,
      abortSignal: AbortSignal.timeout(AI_CONFIG.EMBEDDING_TIMEOUT_MS)
    });

    return embedding;
  };
}

export function createBatchEmbedder(apiKey: string): BatchEmbedder {
  const openrouter = createZineProvider(apiKey);
  const model = openrouter.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL);

  return async (texts: string[]) => {
    const nonEmpty = texts
      .map((text, index) => ({ index, text: text.trim() }))
      .filter((entry) => entry.text.length > 0);
    const result = texts.map<number[]>(() => []);
    if (nonEmpty.length === 0) return result;

    const { embeddings } = await embedMany({
      model,
      values: nonEmpty.map((entry) => entry.text),
      maxRetries: AI_CONFIG.MAX_RETRIES,
      abortSignal: AbortSignal.timeout(AI_CONFIG.EMBEDDING_TIMEOUT_MS)
    });
    for (const [position, embedding] of embeddings.entries()) {
      const entry = nonEmpty[position];
      if (entry) result[entry.index] = embedding;
    }
    return result;
  };
}
