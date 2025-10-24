import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Event, Gallery, Artist } from "../schema";
import { AI_CONFIG } from "../config/ai";

export function eventToText(event: Event & { artistNames?: string[] }): string {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const parts = [event.title, event.description, event.category, event.event_type, ...tags, ...(event.artistNames || [])];
  return parts.filter(Boolean).join(" | ");
}

export function galleryToText(gallery: Gallery): string {
  const parts = [gallery.name, gallery.gallery_type, gallery.city, gallery.neighborhood];
  return parts.filter(Boolean).join(" | ");
}

export function artistToText(artist: Artist): string {
  const parts = [artist.name, artist.bio, artist.website];
  return parts.filter(Boolean).join(" | ");
}

export async function embedEvents(events: Array<Event & { artistNames?: string[] }>): Promise<number[][]> {
  if (events.length === 0) return [];
  const values = events.map(eventToText);
  try {
    const { embeddings } = await embedMany({
      model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
      values,
      maxParallelCalls: AI_CONFIG.MAX_PARALLEL_CALLS,
      maxRetries: AI_CONFIG.MAX_RETRIES
    });
    return embeddings;
  } catch (error) {
    console.error("[ai] embedEvents error", { count: events.length, error });
    throw error;
  }
}

export async function embedGallery(gallery: Gallery): Promise<number[]> {
  const value = galleryToText(gallery);
  try {
    const { embeddings } = await embedMany({
      model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
      values: [value],
      maxParallelCalls: 1,
      maxRetries: AI_CONFIG.MAX_RETRIES
    });
    return embeddings[0];
  } catch (error) {
    console.error("[ai] embedGallery error", { galleryId: gallery.id, error });
    throw error;
  }
}

export async function embedArtists(artists: Artist[]): Promise<number[][]> {
  if (artists.length === 0) return [];
  const values = artists.map(artistToText);
  try {
    const { embeddings } = await embedMany({
      model: openai.textEmbeddingModel(AI_CONFIG.EMBEDDING_MODEL),
      values,
      maxParallelCalls: AI_CONFIG.MAX_PARALLEL_CALLS,
      maxRetries: AI_CONFIG.MAX_RETRIES
    });
    return embeddings;
  } catch (error) {
    console.error("[ai] embedArtists error", { count: artists.length, error });
    throw error;
  }
}