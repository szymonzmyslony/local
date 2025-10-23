/**
 * Centralized AI model configuration
 * Single source of truth for all AI/LLM model settings
 */

export const AI_CONFIG = {
  // Chat/Completion models
  CHAT_MODEL: "gpt-5",

  // Embedding models
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: 1536,

  // Performance settings
  MAX_RETRIES: 2,
  MAX_PARALLEL_CALLS: 5
} as const;
