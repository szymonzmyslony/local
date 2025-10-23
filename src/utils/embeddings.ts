import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Event, Gallery, Artist } from "../schema";
import { AI_CONFIG } from "../config/ai";

/**
 * Generate text representation for event embedding
 */
export function eventToText(event: Event & { artistNames?: string[] }): string {
  const parts = [
    event.title,
    event.description,
    event.category,
    event.eventType,
    ...event.tags,
    ...(event.artistNames || [])
  ];
  return parts.filter(Boolean).join(" | ");
}

/**
 * Generate text representation for gallery embedding
 */
export function galleryToText(gallery: Gallery): string {
  const parts = [
    gallery.name,
    gallery.galleryType,
    gallery.city,
    gallery.neighborhood
  ];
  return parts.filter(Boolean).join(" | ");
}

/**
 * Generate text representation for artist embedding
 */
export function artistToText(artist: Artist): string {
  const parts = [artist.name, artist.bio, artist.website];
  return parts.filter(Boolean).join(" | ");
}

/**
 * Embed multiple events in parallel
 */
export async function embedEvents(
  events: Array<Event & { artistNames?: string[] }>
): Promise<number[][]> {
  if (events.length === 0) return [];

  const values = events.map(eventToText);

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
    values,
    maxParallelCalls: AI_CONFIG.MAX_PARALLEL_CALLS,
    maxRetries: AI_CONFIG.MAX_RETRIES
  });

  return embeddings;
}

/**
 * Embed a single gallery
 */
export async function embedGallery(gallery: Gallery): Promise<number[]> {
  const value = galleryToText(gallery);

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
    values: [value],
    maxParallelCalls: 1,
    maxRetries: AI_CONFIG.MAX_RETRIES
  });

  return embeddings[0];
}

/**
 * Embed multiple artists in parallel
 */
export async function embedArtists(artists: Artist[]): Promise<number[][]> {
  if (artists.length === 0) return [];

  const values = artists.map(artistToText);

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
    values,
    maxParallelCalls: AI_CONFIG.MAX_PARALLEL_CALLS,
    maxRetries: AI_CONFIG.MAX_RETRIES
  });

  return embeddings;
}
