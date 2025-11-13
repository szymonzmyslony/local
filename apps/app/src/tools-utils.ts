import type { SupabaseClient } from "@supabase/supabase-js";
import { Constants } from "@shared";
import type { GalleryDistrict } from "./types/chat-state";

/**
 * Format a Supabase error into a user-friendly message for the LLM
 */
export function formatDatabaseError(error: any, toolName: string): string {
  console.error(`[${toolName}] Full error:`, JSON.stringify(error, null, 2));
  return `Database error: ${error.message}${error.details ? ` | Details: ${error.details}` : ''}${error.hint ? ` | Hint: ${error.hint}` : ''}`;
}

/**
 * Perform semantic search with embedding generation and performance tracking
 */
export async function performSemanticSearch(params: {
  query: string;
  supabase: SupabaseClient<any>;
  embedder: (text: string) => Promise<number[]>;
  toPgVector: (vector: number[]) => string;
  rpcFunction: string;
  matchCount: number;
  matchThreshold?: number;
  toolName: string;
}): Promise<{
  data: any[] | null;
  error: any;
  timings: { embedding: number; db: number; total: number };
}> {
  const {
    query,
    supabase,
    embedder,
    toPgVector,
    rpcFunction,
    matchCount,
    matchThreshold = 0.2,
    toolName
  } = params;

  const startTime = performance.now();

  // Generate embedding
  const embeddingStart = performance.now();
  const vector = await embedder(query);
  const embeddingTime = performance.now() - embeddingStart;
  console.log(`[${toolName}] Embedding generated in ${embeddingTime.toFixed(2)}ms`);

  // Empty vector check
  if (!vector.length) {
    return {
      data: null,
      error: { message: "Empty embedding vector generated" },
      timings: { embedding: embeddingTime, db: 0, total: performance.now() - startTime }
    };
  }

  // Perform database query
  const dbStart = performance.now();
  const { data, error } = await supabase.rpc(rpcFunction, {
    match_count: matchCount,
    match_threshold: matchThreshold,
    query_embedding: toPgVector(vector)
  });
  const dbTime = performance.now() - dbStart;

  const totalTime = performance.now() - startTime;
  console.log(
    `[${toolName}] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms, Embedding: ${embeddingTime.toFixed(2)}ms)`
  );

  return {
    data,
    error,
    timings: { embedding: embeddingTime, db: dbTime, total: totalTime }
  };
}

/**
 * Format search results with proper index calculation
 */
export function formatToolResults<T, R>(params: {
  data: T[];
  currentStateLength: number;
  mapFn: (item: T, absoluteIndex: number) => R;
}): { found: number; items: R[] } {
  const { data, currentStateLength, mapFn } = params;
  const startIndex = currentStateLength - data.length;

  return {
    found: data.length,
    items: data.map((item, i) => mapFn(item, startIndex + i))
  };
}

/**
 * Normalize district input to valid GalleryDistrict enum value
 */
export function normalizeDistrict(
  input: string | null | undefined
): GalleryDistrict | null {
  if (!input) return null;

  const normalized = input.trim().toLowerCase();
  const galleryDistrictValues = Constants.public.Enums.gallery_district;

  return (
    galleryDistrictValues.find(
      (value) => value.toLowerCase() === normalized
    ) ?? null
  );
}
