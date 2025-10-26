/// <reference path="./worker-configuration.d.ts" />

import { createEmbedder, type Embedder } from "@/shared/embedding";
import { jsonResponse, readJson } from "@/shared/http";
import {
  type EntityType,
  type GoldenQueueMessage,
  type IdentityQueueMessage,
  type IndexRequest,
  type MergeRequest,
} from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";
import { toPgVector } from "@/shared/vector";
import type { Tables } from "@/types/database_types";

const SIMILARITY_THRESHOLDS: Record<EntityType, number> = {
  artist: 0.86,
  gallery: 0.86,
  event: 0.88,
};

type SourceArtistRecord = Pick<
  Tables<"source_artists">,
  "id" | "name" | "bio" | "website" | "socials" | "identity_entity_id"
>;

type SourceGalleryRecord = Pick<
  Tables<"source_galleries">,
  "id" | "name" | "website" | "address" | "description" | "identity_entity_id"
>;

type SourceEventRecord = Pick<
  Tables<"source_events">,
  | "id"
  | "title"
  | "description"
  | "url"
  | "start_ts"
  | "end_ts"
  | "venue_name"
  | "participants"
  | "identity_entity_id"
>;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/index" && request.method === "POST") {
      return indexViaHttp(request, env);
    }

    if (url.pathname === "/merge" && request.method === "POST") {
      return mergeViaHttp(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<IdentityQueueMessage>, env: Env) {
    const sb = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    for (const message of batch.messages) {
      try {
        const { body } = message;
        const messages = await handleMessage(sb, body, embedder);
        for (const msg of messages) {
          await env.GOLDEN_PRODUCER.send(msg);
        }
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, IdentityQueueMessage>;

async function indexViaHttp(request: Request, env: Env): Promise<Response> {
  const body = await readJson<IndexRequest>(request);
  if (!body?.entity_type || !body.source_id) {
    return jsonResponse(400, { error: "Missing entity_type or source_id" });
  }

  const sb = getServiceClient(env);
  const embedder = createEmbedder(env.OPENAI_API_KEY);
  try {
    const messages = await indexSource(sb, body.entity_type, body.source_id, embedder);
    for (const msg of messages) {
      await env.GOLDEN_PRODUCER.send(msg);
    }
    return jsonResponse(200, { ok: true, queued: messages.length });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message });
  }
}

async function mergeViaHttp(request: Request, env: Env): Promise<Response> {
  const body = await readJson<MergeRequest>(request);
  if (!body?.entity_type || !body.winner_id || !body.loser_id) {
    return jsonResponse(400, { error: "Missing entity_type, winner_id, or loser_id" });
  }

  const sb = getServiceClient(env);
  const { error } = await sb.rpc("merge_identity_entities", {
    t: body.entity_type,
    winner: body.winner_id,
    loser: body.loser_id,
  });

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  await env.GOLDEN_PRODUCER.send({
    type: "golden.materialize",
    entityType: body.entity_type,
    entityId: body.winner_id,
  });

  return jsonResponse(200, { ok: true });
}

async function handleMessage(
  sb: SupabaseServiceClient,
  body: IdentityQueueMessage,
  embedder: Embedder,
): Promise<GoldenQueueMessage[]> {
  switch (body.type) {
    case "identity.index.artist":
      return indexSource(sb, "artist", body.sourceArtistId, embedder);
    case "identity.index.gallery":
      return indexSource(sb, "gallery", body.sourceGalleryId, embedder);
    case "identity.index.event":
      return indexSource(sb, "event", body.sourceEventId, embedder);
    default:
      return [];
  }
}

async function indexSource(
  sb: SupabaseServiceClient,
  entityType: EntityType,
  sourceId: string,
  embedder: Embedder,
): Promise<GoldenQueueMessage[]> {
  switch (entityType) {
    case "artist": {
      const identityId = await indexArtist(sb, sourceId, embedder);
      return identityId
        ? [{ type: "golden.materialize", entityType: "artist", entityId: identityId }]
        : [];
    }
    case "gallery": {
      const identityId = await indexGallery(sb, sourceId, embedder);
      return identityId
        ? [{ type: "golden.materialize", entityType: "gallery", entityId: identityId }]
        : [];
    }
    case "event": {
      const { identityId, newArtistIds } = await indexEvent(sb, sourceId, embedder);
      if (!identityId) {
        return [];
      }
      return [
        { type: "golden.materialize", entityType: "event", entityId: identityId },
        ...newArtistIds.map((id) => ({
          type: "golden.materialize" as const,
          entityType: "artist" as const,
          entityId: id,
        })),
      ];
    }
  }
}

async function indexArtist(
  sb: SupabaseServiceClient,
  sourceArtistId: string,
  embedder: Embedder,
): Promise<string | undefined> {
  const { data, error } = await sb
    .from("source_artists")
    .select("id, name, bio, website, socials, identity_entity_id")
    .eq("id", sourceArtistId)
    .maybeSingle<SourceArtistRecord>();

  if (error) {
    throw error;
  }

  const record = (data ?? null) as SourceArtistRecord | null;
  if (!record) {
    return undefined;
  }

  let identityId = record.identity_entity_id ?? undefined;

  let embeddingVector: number[] | undefined;
  if (!identityId) {
    embeddingVector = await buildArtistEmbedding(record, embedder);
    const insert = await sb
      .from("identity_entities")
      .insert({
        entity_type: "artist",
        display_name: record.name,
        embedding: embeddingVector?.length ? toPgVector(embeddingVector) : null,
      })
      .select("id, embedding")
      .maybeSingle();

    if (insert.error) {
      throw insert.error;
    }
    identityId = insert.data?.id;
    if (identityId) {
      await sb.from("source_artists").update({ identity_entity_id: identityId }).eq("id", record.id);
    }
  }

  if (!identityId) {
    return undefined;
  }

  const embedding = await ensureEmbedding(sb, identityId, embeddingVector);
  await createSimilarLinks(sb, "artist", identityId, embedding);

  return identityId;
}

async function indexGallery(
  sb: SupabaseServiceClient,
  sourceGalleryId: string,
  embedder: Embedder,
): Promise<string | undefined> {
  const { data, error } = await sb
    .from("source_galleries")
    .select("id, name, website, address, description, identity_entity_id")
    .eq("id", sourceGalleryId)
    .maybeSingle<SourceGalleryRecord>();

  if (error) {
    throw error;
  }

  const record = (data ?? null) as SourceGalleryRecord | null;
  if (!record) {
    return undefined;
  }

  let identityId = record.identity_entity_id ?? undefined;

  let embeddingVector: number[] | undefined;
  if (!identityId) {
    embeddingVector = await buildGalleryEmbedding(record, embedder);
    const insert = await sb
      .from("identity_entities")
      .insert({
        entity_type: "gallery",
        display_name: record.name,
        embedding: embeddingVector?.length ? toPgVector(embeddingVector) : null,
      })
      .select("id, embedding")
      .maybeSingle();

    if (insert.error) {
      throw insert.error;
    }
    identityId = insert.data?.id;
    if (identityId) {
      await sb
        .from("source_galleries")
        .update({ identity_entity_id: identityId })
        .eq("id", record.id);
    }
  }

  if (!identityId) {
    return undefined;
  }

  const embedding = await ensureEmbedding(sb, identityId, embeddingVector);
  await createSimilarLinks(sb, "gallery", identityId, embedding);

  return identityId;
}

async function indexEvent(
  sb: SupabaseServiceClient,
  sourceEventId: string,
  embedder: Embedder,
): Promise<{ identityId?: string; newArtistIds: string[] }> {
  const { data, error } = await sb
    .from("source_events")
    .select(
      "id, title, description, url, start_ts, end_ts, venue_name, participants, identity_entity_id",
    )
    .eq("id", sourceEventId)
    .maybeSingle<SourceEventRecord>();

  if (error) {
    throw error;
  }

  const record = (data ?? null) as SourceEventRecord | null;
  if (!record) {
    return { identityId: undefined, newArtistIds: [] };
  }

  let identityId = record.identity_entity_id ?? undefined;

  let embeddingVector: number[] | undefined;
  if (!identityId) {
    embeddingVector = await buildEventEmbedding(record, embedder);
    const insert = await sb
      .from("identity_entities")
      .insert({
        entity_type: "event",
        display_name: record.title,
        embedding: embeddingVector?.length ? toPgVector(embeddingVector) : null,
      })
      .select("id, embedding")
      .maybeSingle();

    if (insert.error) {
      throw insert.error;
    }
    identityId = insert.data?.id;
    if (identityId) {
      await sb.from("source_events").update({ identity_entity_id: identityId }).eq("id", record.id);
    }
  }

  if (!identityId) {
    return { identityId: undefined, newArtistIds: [] };
  }

  const embedding = await ensureEmbedding(sb, identityId, embeddingVector);
  await createSimilarLinks(sb, "event", identityId, embedding);

  const newArtistIds = await linkParticipants(sb, identityId, record.participants ?? [], embedder);

  return { identityId, newArtistIds };
}

async function buildArtistEmbedding(artist: SourceArtistRecord, embedder: Embedder): Promise<number[]> {
  const parts = [artist.name, artist.bio ?? "", artist.website ?? "", (artist.socials ?? []).join(" ")];
  return embedder(parts.filter(Boolean).join("\n"));
}

async function buildGalleryEmbedding(gallery: SourceGalleryRecord, embedder: Embedder): Promise<number[]> {
  const parts = [gallery.name, gallery.address ?? "", gallery.website ?? "", gallery.description ?? ""];
  return embedder(parts.filter(Boolean).join("\n"));
}

async function buildEventEmbedding(event: SourceEventRecord, embedder: Embedder): Promise<number[]> {
  const parts = [
    event.title,
    event.description ?? "",
    event.venue_name ?? "",
    event.url ?? "",
    [event.start_ts ?? "", event.end_ts ?? ""].join(" "),
    (event.participants ?? []).join(" "),
  ];
  return embedder(parts.filter(Boolean).join("\n"));
}

async function ensureEmbedding(
  sb: SupabaseServiceClient,
  identityId: string,
  vector?: number[],
): Promise<string | undefined> {
  if (vector && vector.length) {
    return toPgVector(vector);
  }

  const { data } = await sb
    .from("identity_entities")
    .select("embedding")
    .eq("id", identityId)
    .maybeSingle();

  return (data?.embedding as string | null) ?? undefined;
}

async function createSimilarLinks(
  sb: SupabaseServiceClient,
  entityType: EntityType,
  identityId: string,
  embedding: string | undefined,
) {
  if (!embedding) {
    return;
  }

  const { data, error } = await sb.rpc("match_identity_entities", {
    t: entityType,
    q: embedding,
    k: 5,
  });

  if (error || !data) {
    if (error) throw error;
    return;
  }

  const threshold = SIMILARITY_THRESHOLDS[entityType];

  for (const match of data) {
    if (!match || match.id === identityId) {
      continue;
    }
    const similarity = match.distance ?? 0;
    if (similarity < threshold) {
      continue;
    }

    await sb
      .from("identity_links")
      .upsert(
        {
          entity_type: entityType,
          a_id: identityId,
          b_id: match.id,
          relation: "similar",
          score: similarity,
          created_by: "system",
        },
        { onConflict: "entity_type,a_id,b_id,relation" },
      )
      .select("id");
  }
}

async function linkParticipants(
  sb: SupabaseServiceClient,
  eventIdentityId: string,
  participants: string[],
  embedder: Embedder,
): Promise<string[]> {
  const materialized = new Set<string>();

  for (const participant of participants) {
    const artist = await ensureArtistByName(sb, participant, embedder);
    if (!artist?.id) {
      continue;
    }

    await sb
      .from("identity_event_artists")
      .upsert(
        {
          event_entity_id: eventIdentityId,
          artist_entity_id: artist.id,
        },
        { onConflict: "event_entity_id,artist_entity_id" },
      )
      .select("event_entity_id");

    if (artist.created) {
      materialized.add(artist.id);
    }
  }

  return [...materialized];
}

type EnsureArtistResult = { id: string; created: boolean } | undefined;

async function ensureArtistByName(
  sb: SupabaseServiceClient,
  name: string,
  embedder: Embedder,
): Promise<EnsureArtistResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }

  const vector = await embedder(trimmed);
  const embedding = vector.length ? toPgVector(vector) : undefined;
  if (!embedding) {
    return undefined;
  }

  const { data, error } = await sb.rpc("match_identity_entities", {
    t: "artist",
    q: embedding,
    k: 3,
  });

  if (error) {
    return undefined;
  }

  const best = data?.find(Boolean);
  if (best && best.distance >= SIMILARITY_THRESHOLDS.artist) {
    return { id: best.id, created: false };
  }

  const insert = await sb
    .from("identity_entities")
    .insert({
      entity_type: "artist",
      display_name: trimmed,
      embedding,
    })
    .select("id")
    .maybeSingle();

  if (insert.error) {
    return undefined;
  }

  const id = insert.data?.id;
  return id ? { id, created: true } : undefined;
}
