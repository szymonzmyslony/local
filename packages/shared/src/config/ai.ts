export const AI_CONFIG = {
  CHAT_MODEL: "openai/gpt-5.6-luna",
  EMBEDDING_MODEL: "openai/text-embedding-3-small",
  EMBEDDING_DIMENSIONS: 1536,
  EMBEDDING_TIMEOUT_MS: 60_000,
  MAX_RETRIES: 2,
  MAX_PARALLEL_CALLS: 5
} as const;
