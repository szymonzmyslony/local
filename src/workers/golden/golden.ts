/// <reference path="./worker-configuration.d.ts" />

import { jsonResponse, readJson } from "@/shared/http";
import type {
  EntityType,
  GoldenQueueMessage,
  MaterializeRequest,
} from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";
import type { TablesInsert } from "@/types/database_types";

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/materialize" && request.method === "POST") {
      return materializeViaHttp(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<GoldenQueueMessage>, env: Env) {
    const sb = getServiceClient(env);

    for (const message of batch.messages) {
      try {
        const { body } = message;
        if (body.type !== "golden.materialize") {
          message.ack();
          continue;
        }

        await materializeEntity(sb, body.entityType, body.entityId);
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, GoldenQueueMessage>;

async function materializeViaHttp(request: Request, env: Env): Promise<Response> {
  const body = await readJson<MaterializeRequest>(request);
  if (!body?.entityType || !body.entityId) {
    return jsonResponse(400, { error: "Missing entityType or entityId" });
  }

  const sb = getServiceClient(env);
  try {
    await materializeEntity(sb, body.entityType, body.entityId);
    return jsonResponse(200, { ok: true });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message });
  }
}

async function materializeEntity(
  sb: SupabaseServiceClient,
  entityType: EntityType,
  entityId: string,
) {
  const canonicalId = await resolveCanonical(sb, entityId);
  const familyIds = await getFamilyIds(sb, canonicalId);

  switch (entityType) {
    case "artist":
      await materializeArtist(sb, canonicalId, familyIds);
      break;
    case "gallery":
      await materializeGallery(sb, canonicalId, familyIds);
      break;
    case "event":
      await materializeEvent(sb, canonicalId, familyIds);
      break;
  }
}

async function materializeArtist(
  sb: SupabaseServiceClient,
  canonicalId: string,
  familyIds: string[],
) {
  const { data, error } = await sb
    .from("source_artists")
    .select("name, bio, website, socials")
    .in("identity_entity_id", familyIds);

  if (error) {
    throw error;
  }

  const now = new Date().toISOString();
  const record: TablesInsert<"golden_artists"> = {
    entity_id: canonicalId,
    name: mostFrequent(data?.map((row) => row.name) ?? []) ?? "",
    bio: longest(data?.map((row) => row.bio) ?? []),
    website: mostFrequent(data?.map((row) => row.website) ?? []),
    socials: uniqueStrings(data?.flatMap((row) => row.socials ?? []) ?? []),
    updated_at: now,
  };

  await sb.from("golden_artists").upsert(record, { onConflict: "entity_id" });

  // Update last_materialized_at timestamp
  await sb
    .from("identity_entities")
    .update({ last_materialized_at: now })
    .eq("id", canonicalId);
}

async function materializeGallery(
  sb: SupabaseServiceClient,
  canonicalId: string,
  familyIds: string[],
) {
  const { data, error } = await sb
    .from("source_galleries")
    .select("name, website, address, description")
    .in("identity_entity_id", familyIds);

  if (error) {
    throw error;
  }

  const now = new Date().toISOString();
  const record: TablesInsert<"golden_galleries"> = {
    entity_id: canonicalId,
    name: mostFrequent(data?.map((row) => row.name) ?? []) ?? "",
    website: mostFrequent(data?.map((row) => row.website) ?? []),
    address: mostFrequent(data?.map((row) => row.address) ?? []),
    description: longest(data?.map((row) => row.description) ?? []),
    updated_at: now,
  };

  await sb.from("golden_galleries").upsert(record, { onConflict: "entity_id" });

  // Update last_materialized_at timestamp
  await sb
    .from("identity_entities")
    .update({ last_materialized_at: now })
    .eq("id", canonicalId);
}

async function materializeEvent(
  sb: SupabaseServiceClient,
  canonicalId: string,
  familyIds: string[],
) {
  const { data, error } = await sb
    .from("source_events")
    .select("title, description, url, start_ts, end_ts, venue_name")
    .in("identity_entity_id", familyIds);

  if (error) {
    throw error;
  }

  const now = new Date().toISOString();
  const record: TablesInsert<"golden_events"> = {
    entity_id: canonicalId,
    title: mostFrequent(data?.map((row) => row.title) ?? []) ?? "",
    description: longest(data?.map((row) => row.description) ?? []),
    url: mostFrequent(data?.map((row) => row.url) ?? []),
    start_ts: mostFrequent(data?.map((row) => row.start_ts) ?? []),
    end_ts: mostFrequent(data?.map((row) => row.end_ts) ?? []),
    venue_text: mostFrequent(data?.map((row) => row.venue_name) ?? []),
    updated_at: now,
  };

  await sb.from("golden_events").upsert(record, { onConflict: "entity_id" });

  await refreshEventArtists(sb, canonicalId, familyIds);

  // Update last_materialized_at timestamp
  await sb
    .from("identity_entities")
    .update({ last_materialized_at: now })
    .eq("id", canonicalId);
}

async function refreshEventArtists(
  sb: SupabaseServiceClient,
  canonicalEventId: string,
  familyIds: string[],
) {
  const { data, error } = await sb
    .from("identity_event_artists")
    .select("artist_entity_id")
    .in("event_entity_id", familyIds);

  if (error) {
    throw error;
  }

  const uniqueArtistIds = uniqueStrings(data?.map((row) => row.artist_entity_id) ?? []);
  if (!uniqueArtistIds.length) {
    await sb.from("golden_event_artists").delete().eq("event_entity_id", canonicalEventId);
    return;
  }

  const canonicalMap = await canonicalizeIds(sb, uniqueArtistIds);
  const rows = uniqueArtistIds
    .map((id) => canonicalMap.get(id))
    .filter((id): id is string => Boolean(id))
    .map((artistId): TablesInsert<"golden_event_artists"> => ({
      event_entity_id: canonicalEventId,
      artist_entity_id: artistId,
    }));

  await sb.from("golden_event_artists").delete().eq("event_entity_id", canonicalEventId);
  if (rows.length) {
    await sb.from("golden_event_artists").upsert(rows, {
      onConflict: "event_entity_id,artist_entity_id",
    });
  }
}

async function canonicalizeIds(
  sb: SupabaseServiceClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const id of ids) {
    if (map.has(id)) {
      continue;
    }
    const canonical = await resolveCanonical(sb, id);
    map.set(id, canonical);
  }
  return map;
}

async function resolveCanonical(sb: SupabaseServiceClient, id: string): Promise<string> {
  const { data, error } = await sb.rpc("resolve_canonical", { e: id });
  if (error) {
    throw error;
  }
  return data ?? id;
}

async function getFamilyIds(sb: SupabaseServiceClient, canonicalId: string): Promise<string[]> {
  const { data, error } = await sb.rpc("identity_family", { canon: canonicalId });
  if (error) {
    throw error;
  }

  const ids = new Set<string>([canonicalId]);
  for (const row of data ?? []) {
    if (row?.id) {
      ids.add(row.id);
    }
  }
  return Array.from(ids);
}

function mostFrequent(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  let winner: string | null = null;
  let bestCount = 0;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && (winner?.length ?? 0) < value.length)) {
      winner = value;
      bestCount = count;
    }
  }

  return winner;
}

function longest(values: (string | null | undefined)[]): string | null {
  let longestValue: string | null = null;
  let longestLength = 0;

  for (const value of values) {
    const text = value?.trim();
    if (!text) {
      continue;
    }
    if (text.length > longestLength) {
      longestValue = text;
      longestLength = text.length;
    }
  }

  return longestValue;
}

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return Array.from(set);
}
