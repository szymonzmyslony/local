/// <reference path="./worker-configuration.d.ts" />

import { createEmbedder, type Embedder } from "@/shared/embedding";
import { jsonResponse } from "@/shared/http";
import { type EntityType, type SimilarityQueueMessage } from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";
import { toPgVector } from "@/shared/vector";
import type { Tables } from "@/types/database_types";

const DEFAULT_THRESHOLDS: Record<EntityType, number> = {
  artist: 0.86,
  gallery: 0.86,
  event: 0.88,
};

type ExtractedArtistRecord = Pick<
  Tables<"extracted_artists">,
  "id" | "name" | "bio" | "website" | "socials" | "embedding"
>;

type ExtractedGalleryRecord = Pick<
  Tables<"extracted_galleries">,
  "id" | "name" | "website" | "address" | "description" | "embedding"
>;

type ExtractedEventRecord = Pick<
  Tables<"extracted_events">,
  "id" | "title" | "description" | "url" | "start_ts" | "end_ts" | "venue_name" | "embedding"
>;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/stats" && request.method === "GET") {
      return getSimilarityStats(env);
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<SimilarityQueueMessage>, env: Env) {
    const sb = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    for (const message of batch.messages) {
      try {
        const { body } = message;
        await handleMessage(sb, body, embedder);
        message.ack();
      } catch (error) {
        console.error("Similarity computation error:", error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, SimilarityQueueMessage>;

async function getSimilarityStats(env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  // Count pending similarity reviews across all entity types
  const [artistCount, galleryCount, eventCount] = await Promise.all([
    sb
      .from("extracted_artist_links")
      .select("*", { count: "exact", head: true })
      .eq("curator_decision", "pending"),
    sb
      .from("extracted_gallery_links")
      .select("*", { count: "exact", head: true })
      .eq("curator_decision", "pending"),
    sb
      .from("extracted_event_links")
      .select("*", { count: "exact", head: true })
      .eq("curator_decision", "pending"),
  ]);

  return jsonResponse(200, {
    pendingReviews: {
      artists: artistCount.count ?? 0,
      galleries: galleryCount.count ?? 0,
      events: eventCount.count ?? 0,
      total: (artistCount.count ?? 0) + (galleryCount.count ?? 0) + (eventCount.count ?? 0),
    },
  });
}

async function handleMessage(
  sb: SupabaseServiceClient,
  body: SimilarityQueueMessage,
  embedder: Embedder,
): Promise<void> {
  switch (body.type) {
    case "similarity.compute.artist":
      await computeArtistSimilarity(sb, body.entityId, embedder, body.threshold);
      break;
    case "similarity.compute.gallery":
      await computeGallerySimilarity(sb, body.entityId, embedder, body.threshold);
      break;
    case "similarity.compute.event":
      await computeEventSimilarity(sb, body.entityId, embedder, body.threshold);
      break;
  }
}

async function computeArtistSimilarity(
  sb: SupabaseServiceClient,
  entityId: string,
  embedder: Embedder,
  threshold?: number,
): Promise<void> {
  // Get the extracted artist
  const { data, error } = await sb
    .from("extracted_artists")
    .select("id, name, bio, website, socials, embedding")
    .eq("id", entityId)
    .maybeSingle<ExtractedArtistRecord>();

  if (error) throw error;
  if (!data) return;

  // Compute embedding if not exists
  let embedding = data.embedding;
  if (!embedding) {
    const embeddingVector = await buildArtistEmbedding(data, embedder);
    const pgVector = toPgVector(embeddingVector);

    // Store embedding on extracted artist
    await sb.from("extracted_artists").update({ embedding: pgVector }).eq("id", entityId);

    embedding = pgVector;
  }

  // Find similar artists using DB function
  const { data: matches, error: matchError } = await sb.rpc("find_similar_artists", {
    query_embedding: embedding,
    match_threshold: threshold ?? DEFAULT_THRESHOLDS.artist,
    match_count: 10,
  });

  if (matchError) throw matchError;
  if (!matches || matches.length === 0) return;

  // Create similarity links
  for (const match of matches) {
    if (!match || match.id === entityId) continue;

    // Ensure consistent ordering (lower UUID first)
    const [sourceA, sourceB] =
      entityId < match.id ? [entityId, match.id] : [match.id, entityId];

    await sb
      .from("extracted_artist_links")
      .upsert(
        {
          source_a_id: sourceA,
          source_b_id: sourceB,
          similarity_score: match.similarity,
          curator_decision: "pending",
        },
        { onConflict: "source_a_id,source_b_id" },
      )
      .select("source_a_id");
  }
}

async function computeGallerySimilarity(
  sb: SupabaseServiceClient,
  entityId: string,
  embedder: Embedder,
  threshold?: number,
): Promise<void> {
  // Get the extracted gallery
  const { data, error } = await sb
    .from("extracted_galleries")
    .select("id, name, website, address, description, embedding")
    .eq("id", entityId)
    .maybeSingle<ExtractedGalleryRecord>();

  if (error) throw error;
  if (!data) return;

  // Compute embedding if not exists
  let embedding = data.embedding;
  if (!embedding) {
    const embeddingVector = await buildGalleryEmbedding(data, embedder);
    const pgVector = toPgVector(embeddingVector);

    // Store embedding on extracted gallery
    await sb.from("extracted_galleries").update({ embedding: pgVector }).eq("id", entityId);

    embedding = pgVector;
  }

  // Find similar galleries using DB function
  const { data: matches, error: matchError } = await sb.rpc("find_similar_galleries", {
    query_embedding: embedding,
    match_threshold: threshold ?? DEFAULT_THRESHOLDS.gallery,
    match_count: 10,
  });

  if (matchError) throw matchError;
  if (!matches || matches.length === 0) return;

  // Create similarity links
  for (const match of matches) {
    if (!match || match.id === entityId) continue;

    // Ensure consistent ordering (lower UUID first)
    const [sourceA, sourceB] =
      entityId < match.id ? [entityId, match.id] : [match.id, entityId];

    await sb
      .from("extracted_gallery_links")
      .upsert(
        {
          source_a_id: sourceA,
          source_b_id: sourceB,
          similarity_score: match.similarity,
          curator_decision: "pending",
        },
        { onConflict: "source_a_id,source_b_id" },
      )
      .select("source_a_id");
  }
}

async function computeEventSimilarity(
  sb: SupabaseServiceClient,
  entityId: string,
  embedder: Embedder,
  threshold?: number,
): Promise<void> {
  // Get the extracted event
  const { data, error } = await sb
    .from("extracted_events")
    .select("id, title, description, url, start_ts, end_ts, venue_name, embedding")
    .eq("id", entityId)
    .maybeSingle<ExtractedEventRecord>();

  if (error) throw error;
  if (!data) return;

  // Compute embedding if not exists
  let embedding = data.embedding;
  if (!embedding) {
    const embeddingVector = await buildEventEmbedding(data, embedder);
    const pgVector = toPgVector(embeddingVector);

    // Store embedding on extracted event
    await sb.from("extracted_events").update({ embedding: pgVector }).eq("id", entityId);

    embedding = pgVector;
  }

  // Find similar events using DB function
  const { data: matches, error: matchError } = await sb.rpc("find_similar_events", {
    query_embedding: embedding,
    match_threshold: threshold ?? DEFAULT_THRESHOLDS.event,
    match_count: 10,
  });

  if (matchError) throw matchError;
  if (!matches || matches.length === 0) return;

  // Create similarity links
  for (const match of matches) {
    if (!match || match.id === entityId) continue;

    // Ensure consistent ordering (lower UUID first)
    const [sourceA, sourceB] =
      entityId < match.id ? [entityId, match.id] : [match.id, entityId];

    await sb
      .from("extracted_event_links")
      .upsert(
        {
          source_a_id: sourceA,
          source_b_id: sourceB,
          similarity_score: match.similarity,
          curator_decision: "pending",
        },
        { onConflict: "source_a_id,source_b_id" },
      )
      .select("source_a_id");
  }
}

async function buildArtistEmbedding(
  artist: ExtractedArtistRecord,
  embedder: Embedder,
): Promise<number[]> {
  const parts = [artist.name, artist.bio ?? "", artist.website ?? "", (artist.socials ?? []).join(" ")];
  return embedder(parts.filter(Boolean).join("\n"));
}

async function buildGalleryEmbedding(
  gallery: ExtractedGalleryRecord,
  embedder: Embedder,
): Promise<number[]> {
  const parts = [gallery.name, gallery.address ?? "", gallery.website ?? "", gallery.description ?? ""];
  return embedder(parts.filter(Boolean).join("\n"));
}

async function buildEventEmbedding(
  event: ExtractedEventRecord,
  embedder: Embedder,
): Promise<number[]> {
  const parts = [
    event.title,
    event.description ?? "",
    event.venue_name ?? "",
    event.url ?? "",
    [event.start_ts ?? "", event.end_ts ?? ""].join(" "),
  ];
  return embedder(parts.filter(Boolean).join("\n"));
}
