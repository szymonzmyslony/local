import { embed } from "ai";
import { AI_CONFIG } from "../config/ai";
import { createZineProvider } from "./provider";

export type Embedder = (text: string) => Promise<number[]>;

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
