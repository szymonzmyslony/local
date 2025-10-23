import type { Event, Gallery, Artist } from "../schema";
import type {
  EventQueryOptions,
  GalleryQueryOptions
} from "../types/vectorize";

/**
 * Check if vectors with given IDs already exist in the index
 * Returns Set of IDs that already exist
 */
export async function getExistingVectorIds(
  index: VectorizeIndex,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const existingVectors = await index.getByIds(ids);
  return new Set(existingVectors.map((v) => v.id));
}

/**
 * Insert event embeddings into Vectorize with rich metadata for filtering
 * Idempotent: checks if vectors already exist before inserting
 */
export async function insertEventEmbeddings(
  index: VectorizeIndex,
  events: Array<Event & { artistNames?: string[] }>,
  embeddings: number[][],
  gallery: Gallery
): Promise<void> {
  if (events.length === 0 || embeddings.length === 0) return;
  if (events.length !== embeddings.length) {
    throw new Error(
      `Mismatch: ${events.length} events but ${embeddings.length} embeddings`
    );
  }

  const vectors: VectorizeVector[] = events.map((event, i) => ({
    id: event.id,
    values: embeddings[i],
    metadata: {
      // Display metadata
      title: event.title,
      description: event.description.substring(0, 200), // Truncate for storage
      galleryName: gallery.name,
      artists: (event.artistNames || []).join(", ").substring(0, 200),

      // Filterable metadata (indexed)
      galleryId: event.galleryId,
      eventType: event.eventType,
      category: event.category,
      price: event.price,
      startTimestamp: Math.floor(new Date(event.start).getTime() / 1000),
      endTimestamp: Math.floor(new Date(event.end).getTime() / 1000)
    }
  }));

  await index.upsert(vectors);
}

/**
 * Insert gallery embedding into Vectorize with metadata for filtering
 */
export async function insertGalleryEmbedding(
  index: VectorizeIndex,
  galleryId: string,
  gallery: Gallery,
  embedding: number[]
): Promise<void> {
  const vector: VectorizeVector = {
    id: galleryId,
    values: embedding,
    metadata: {
      name: gallery.name,
      website: gallery.website,
      city: gallery.city,
      neighborhood: gallery.neighborhood || "",
      galleryType: gallery.galleryType || ""
    }
  };

  await index.upsert([vector]);
}

/**
 * Insert artist embeddings into Vectorize
 */
export async function insertArtistEmbeddings(
  index: VectorizeIndex,
  artists: Artist[],
  embeddings: number[][]
): Promise<void> {
  if (artists.length === 0 || embeddings.length === 0) return;
  if (artists.length !== embeddings.length) {
    throw new Error(
      `Mismatch: ${artists.length} artists but ${embeddings.length} embeddings`
    );
  }

  const vectors: VectorizeVector[] = artists.map((artist, i) => ({
    id: artist.id,
    values: embeddings[i],
    metadata: {
      name: artist.name,
      bio: (artist.bio || "").substring(0, 200), // Truncate for storage
      website: artist.website || ""
    }
  }));

  await index.upsert(vectors);
}

/**
 * Search for similar events with strongly typed filters
 */
export async function searchEvents(
  index: VectorizeIndex,
  queryEmbedding: number[],
  options?: EventQueryOptions
): Promise<VectorizeMatches> {
  return await index.query(queryEmbedding, {
    topK: options?.topK || 10,
    filter: options?.filter as VectorizeVectorMetadataFilter | undefined,
    returnValues: options?.returnValues,
    returnMetadata: options?.returnMetadata || "indexed"
  });
}

/**
 * Search for similar galleries with strongly typed filters
 */
export async function searchGalleries(
  index: VectorizeIndex,
  queryEmbedding: number[],
  options?: GalleryQueryOptions
): Promise<VectorizeMatches> {
  return await index.query(queryEmbedding, {
    topK: options?.topK || 10,
    filter: options?.filter as VectorizeVectorMetadataFilter | undefined,
    returnValues: options?.returnValues,
    returnMetadata: options?.returnMetadata || "indexed"
  });
}
