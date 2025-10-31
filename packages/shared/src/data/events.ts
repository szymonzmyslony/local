import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseServiceClient } from "../database/client";
import type {
  EventInfo,
  EventInfoInsert,
  EventInfoUpdate,
  EventInsert,
  EventOccurrenceInsert,
  EventUpdate
} from "../types/common";
import type { EventListItem, EventWithRelations } from "../types/domain";

function toError(operation: string, error: PostgrestError): Error {
  return new Error(`[${operation}] ${error.message}`);
}

export async function selectEventsByGallery(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<EventWithRelations[]> {
  const { data, error } = await client
    .from("events")
    .select("*, event_info(*), event_occurrences(*)")
    .eq("gallery_id", galleryId)
    .order("start_at", { ascending: true })
    .limit(200);

  if (error) {
    throw toError("selectEventsByGallery", error);
  }

  return (data ?? []).map(event => ({
    ...event,
    event_info: event.event_info ?? null,
    event_occurrences: event.event_occurrences ?? []
  })) as EventWithRelations[];
}

export async function findEventIdByPage(
  client: SupabaseServiceClient,
  pageId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("events")
    .select("id")
    .eq("page_id", pageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("findEventIdByPage", error);
  }

  return data?.id ?? null;
}

export async function selectEventIdsByPageIds(
  client: SupabaseServiceClient,
  pageIds: readonly string[]
): Promise<Map<string, string>> {
  if (pageIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("events")
    .select("id, page_id")
    .in("page_id", [...pageIds]);

  if (error) {
    throw toError("selectEventIdsByPageIds", error);
  }

  return new Map(
    (data ?? [])
      .filter(row => row.page_id)
      .map(row => [row.page_id as string, row.id])
  );
}

export async function upsertEvent(
  client: SupabaseServiceClient,
  payload: EventInsert,
  existingId?: string | null
): Promise<string> {
  if (existingId) {
    const { data, error } = await client
      .from("events")
      .update(payload)
      .eq("id", existingId)
      .select("id")
      .single();

    if (error) {
      throw toError("upsertEvent.update", error);
    }

    return data.id;
  }

  const { data, error } = await client
    .from("events")
    .insert([payload])
    .select("id")
    .single();

  if (error) {
    throw toError("upsertEvent.insert", error);
  }

  return data.id;
}

export async function upsertEventInfo(
  client: SupabaseServiceClient,
  payload: EventInfoInsert
): Promise<void> {
  const { error } = await client
    .from("event_info")
    .upsert([payload], { onConflict: "event_id" });

  if (error) {
    throw toError("upsertEventInfo", error);
  }
}

export async function replaceEventOccurrences(
  client: SupabaseServiceClient,
  occurrences: EventOccurrenceInsert[],
  eventId: string
): Promise<void> {
  const { error: deleteError } = await client
    .from("event_occurrences")
    .delete()
    .eq("event_id", eventId);

  if (deleteError) {
    throw toError("replaceEventOccurrences.delete", deleteError);
  }

  if (occurrences.length === 0) {
    return;
  }

  const { error } = await client.from("event_occurrences").insert(occurrences);

  if (error) {
    throw toError("replaceEventOccurrences", error);
  }
}

export async function listEvents(
  client: SupabaseServiceClient,
  galleryId: string,
  limit = 200
): Promise<EventListItem[]> {
  const { data, error } = await client
    .from("events")
    .select("id, title, start_at, status, page_id")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw toError("listEvents", error);
  }

  return (data ?? []) as EventListItem[];
}

export async function updateEventInfoEmbedding(
  client: SupabaseServiceClient,
  eventId: string,
  update: EventInfoUpdate
): Promise<void> {
  const { error } = await client
    .from("event_info")
    .update(update)
    .eq("event_id", eventId);

  if (error) {
    throw toError("updateEventInfoEmbedding", error);
  }
}

export async function updateGalleryInfoEmbedding(
  client: SupabaseServiceClient,
  galleryId: string,
  update: { embedding: string; embedding_model: string; embedding_created_at: string }
): Promise<void> {
  const { error } = await client
    .from("gallery_info")
    .update(update)
    .eq("gallery_id", galleryId);

  if (error) {
    throw toError("updateGalleryInfoEmbedding", error);
  }
}

export async function selectEventTitle(client: SupabaseServiceClient, eventId: string): Promise<string | null> {
  const { data, error } = await client
    .from("events")
    .select("title")
    .eq("id", eventId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectEventTitle", error);
  }

  return data?.title ?? null;
}

export async function selectEventInfoBasics(client: SupabaseServiceClient, eventId: string): Promise<{ description: string | null; tags: string[] | null }> {
  const { data, error } = await client
    .from("event_info")
    .select("description, tags")
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectEventInfoBasics", error);
  }

  return {
    description: data?.description ?? null,
    tags: (data?.tags as string[] | null) ?? null
  };
}

export async function updateEventFields(
  client: SupabaseServiceClient,
  eventId: string,
  update: EventUpdate
): Promise<void> {
  const { error } = await client
    .from("events")
    .update(update)
    .eq("id", eventId);

  if (error) {
    throw toError("updateEventFields", error);
  }
}

export async function saveEventInfo(
  client: SupabaseServiceClient,
  eventId: string,
  info: Pick<EventInfo, "description" | "tags" | "artists">
): Promise<void> {
  const { data, error } = await client
    .from("event_info")
    .update(info)
    .eq("event_id", eventId)
    .select("event_id")
    .maybeSingle();

  if (error) {
    throw toError("saveEventInfo.update", error);
  }

  if (!data) {
    const insertPayload: EventInfoInsert = {
      event_id: eventId,
      data: {},
      ...info
    };
    const { error: insertError } = await client.from("event_info").insert([insertPayload]);
    if (insertError) {
      throw toError("saveEventInfo.insert", insertError);
    }
  }
}

export async function getEventWithRelations(
  client: SupabaseServiceClient,
  eventId: string
): Promise<EventWithRelations | null> {
  const { data, error } = await client
    .from("events")
    .select("*, event_info(*), event_occurrences(*)")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw toError("getEventWithRelations", error);
  }

  if (!data) {
    return null;
  }

  const event: EventWithRelations = {
    ...data,
    event_info: data.event_info ?? null,
    event_occurrences: data.event_occurrences ?? []
  };

  return event;
}
