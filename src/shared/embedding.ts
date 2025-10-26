import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AI_CONFIG } from './config/ai';

export type Embedder = (text: string) => Promise<number[]>;

export function createEmbedder(apiKey: string): Embedder {
  const openai = createOpenAI({ apiKey });
  const model = openai.embedding(AI_CONFIG.EMBEDDING_MODEL);

  return async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const { embedding } = await embed({
      model,
      value: trimmed,
      maxRetries: AI_CONFIG.MAX_RETRIES,
    });

    return embedding;
  };
}
