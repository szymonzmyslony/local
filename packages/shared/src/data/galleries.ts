import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseServiceClient } from "../database/client";
import type {
  Gallery,
  GalleryHoursInsert,
  GalleryInfoInsert,
  GalleryInsert,
  PageInsert
} from "../types/common";
import type {
  GalleryListItem,
  GalleryPipeline,
  GalleryWithRelations,
  PipelineEvent,
  PipelinePage
} from "../types/domain";

function toError(operation: string, error: PostgrestError): Error {
  return new Error(`[${operation}] ${error.message}`);
}

export async function upsertGallery(
  client: SupabaseServiceClient,
  gallery: GalleryInsert
): Promise<Gallery> {
  const { data, error } = await client
    .from("galleries")
    .upsert(gallery, { onConflict: "normalized_main_url" })
    .select()
    .single();

  if (error) {
    throw toError("upsertGallery", error);
  }

  if (!data) {
    throw new Error("[upsertGallery] Supabase returned no data");
  }

  return data satisfies Gallery;
}

export async function upsertGalleryPage(
  client: SupabaseServiceClient,
  page: PageInsert
): Promise<string | null> {
  const { data, error } = await client
    .from("pages")
    .upsert([page], { onConflict: "normalized_url" })
    .select("id")
    .maybeSingle();

  if (error) {
    throw toError("upsertGalleryPage", error);
  }

  return data?.id ?? null;
}

export async function listRecentGalleries(
  client: SupabaseServiceClient,
  limit = 100
): Promise<GalleryListItem[]> {
  const { data, error } = await client
    .from("galleries")
    .select("id, main_url, about_url, normalized_main_url, gallery_info(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw toError("listRecentGalleries", error);
  }

  return (data ?? []) as GalleryListItem[];
}

export async function getGalleryWithInfo(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<GalleryWithRelations | null> {
  const { data, error } = await client
    .from("galleries")
    .select("*, gallery_info(*), gallery_hours(*)")
    .eq("id", galleryId)
    .maybeSingle();

  if (error) {
    throw toError("getGalleryWithInfo", error);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    gallery_info: data.gallery_info ?? null,
    gallery_hours: data.gallery_hours ?? []
  } satisfies GalleryWithRelations;
}

export async function getGalleryPipeline(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<GalleryPipeline | null> {
  const gallery = await getGalleryWithInfo(client, galleryId);
  if (!gallery) {
    return null;
  }

  const [{ data: pageRows, error: pagesError }, { data: eventRows, error: eventsError }] = await Promise.all([
    client
      .from("pages")
      .select(
        "id, gallery_id, url, normalized_url, kind, fetch_status, fetched_at, http_status, created_at, updated_at, " +
          "page_content(markdown, parsed_at), page_structured(parse_status, parsed_at, extracted_page_kind, extraction_error)"
      )
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("events")
      .select("*, event_info(*), event_occurrences(*)")
      .eq("gallery_id", galleryId)
      .order("start_at", { ascending: true })
      .limit(200)
  ]);

  if (pagesError) {
    throw toError("getGalleryPipeline.pages", pagesError);
  }
  if (eventsError) {
    throw toError("getGalleryPipeline.events", eventsError);
  }

  const pageRecords = (pageRows ?? []) as unknown as PipelinePage[];
  const pages: PipelinePage[] = pageRecords.map(page => ({
    ...page,
    page_content: page.page_content ?? null,
    page_structured: page.page_structured ?? null
  }));

  const eventRecords = (eventRows ?? []) as unknown as PipelineEvent[];
  const events: PipelineEvent[] = eventRecords.map(event => ({
    ...event,
    event_info: event.event_info ?? null,
    event_occurrences: event.event_occurrences ?? []
  }));

  return {
    gallery,
    pages,
    events
  } satisfies GalleryPipeline;
}

export async function upsertGalleryInfo(
  client: SupabaseServiceClient,
  payload: GalleryInfoInsert
): Promise<void> {
  const { error } = await client
    .from("gallery_info")
    .upsert([payload], { onConflict: "gallery_id" });

  if (error) {
    throw toError("upsertGalleryInfo", error);
  }
}

export async function upsertGalleryHours(
  client: SupabaseServiceClient,
  rows: GalleryHoursInsert[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await client
    .from("gallery_hours")
    .upsert(rows, { onConflict: "gallery_id,dow" });

  if (error) {
    throw toError("upsertGalleryHours", error);
  }
}
