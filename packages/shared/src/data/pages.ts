import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseServiceClient } from "../database/client";
import type {
  Page,
  PageContentInsert,
  PageInsert,
  PageStructuredInsert,
  PageUpdate,
  PageKind
} from "../types/common";
import type { PageDetail, PageListItem } from "../types/domain";

export type PageSummary = Pick<Page, "id" | "url" | "normalized_url" | "kind" | "gallery_id">;

function toError(operation: string, error: PostgrestError): Error {
  return new Error(`[${operation}] ${error.message}`);
}

export async function selectPagesByIds(
  client: SupabaseServiceClient,
  pageIds: readonly string[]
): Promise<PageSummary[]> {
  if (pageIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("pages")
    .select("id, url, normalized_url, kind, gallery_id")
    .in("id", [...pageIds]);

  if (error) {
    throw toError("selectPagesByIds", error);
  }

  return (data ?? []) as PageSummary[];
}

export async function selectPagesByGallery(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<Page[]> {
  const { data, error } = await client
    .from("pages")
    .select("*")
    .eq("gallery_id", galleryId);

  if (error) {
    throw toError("selectPagesByGallery", error);
  }

  return (data ?? []) as Page[];
}

export async function getPageMarkdown(
  client: SupabaseServiceClient,
  pageId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("page_content")
    .select("markdown")
    .eq("page_id", pageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("getPageMarkdown", error);
  }

  return data?.markdown ?? null;
}

export async function getPageMarkdownBulk(
  client: SupabaseServiceClient,
  pageIds: readonly string[]
): Promise<Map<string, string>> {
  if (pageIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("page_content")
    .select("page_id, markdown")
    .in("page_id", [...pageIds]);

  if (error) {
    throw toError("getPageMarkdownBulk", error);
  }

  return new Map((data ?? []).map(row => [row.page_id, row.markdown ?? ""]));
}

export async function getPageDetail(
  client: SupabaseServiceClient,
  pageId: string
): Promise<PageDetail | null> {
  const { data, error } = await client
    .from("pages")
    .select(
      "id, url, normalized_url, kind, fetch_status, fetched_at, " +
        "page_content(markdown, parsed_at), page_structured(parse_status, parsed_at, extracted_page_kind, extraction_error)"
    )
    .eq("id", pageId)
    .maybeSingle();

  if (error) {
    throw toError("getPageDetail", error);
  }

  if (!data) {
    return null;
  }

  const record = data as unknown as PageDetail;

  return {
    ...record,
    page_content: record.page_content ?? null,
    page_structured: record.page_structured ?? null
  } satisfies PageDetail;
}

export async function upsertPageContent(
  client: SupabaseServiceClient,
  record: PageContentInsert
): Promise<void> {
  const { error } = await client
    .from("page_content")
    .upsert([record], { onConflict: "page_id" });

  if (error) {
    throw toError("upsertPageContent", error);
  }
}

export async function updatePageById(
  client: SupabaseServiceClient,
  pageId: string,
  patch: PageUpdate
): Promise<void> {
  const { error } = await client
    .from("pages")
    .update(patch)
    .eq("id", pageId);

  if (error) {
    throw toError("updatePageById", error);
  }
}

export async function upsertPageStructured(
  client: SupabaseServiceClient,
  record: PageStructuredInsert
): Promise<void> {
  const { error } = await client
    .from("page_structured")
    .upsert([record], { onConflict: "page_id" });

  if (error) {
    throw toError("upsertPageStructured", error);
  }
}

export async function selectEventExtractions(
  client: SupabaseServiceClient,
  pageIds: readonly string[]
): Promise<Array<{ page_id: string; data: unknown; extracted_page_kind: "event_detail" }>> {
  if (pageIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("page_structured")
    .select("page_id, data, extracted_page_kind")
    .in("page_id", [...pageIds])
    .eq("extracted_page_kind", "event_detail")
    .eq("parse_status", "ok");

  if (error) {
    throw toError("selectEventExtractions", error);
  }

  return (data ?? []) as Array<{ page_id: string; data: unknown; extracted_page_kind: "event_detail" }>;
}

export async function findExistingNormalizedUrls(
  client: SupabaseServiceClient,
  normalizedUrls: readonly string[]
): Promise<string[]> {
  if (normalizedUrls.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("pages")
    .select("normalized_url")
    .in("normalized_url", [...normalizedUrls]);

  if (error) {
    throw toError("findExistingNormalizedUrls", error);
  }

  return (data ?? []).map(row => row.normalized_url);
}

export async function insertPages(
  client: SupabaseServiceClient,
  rows: PageInsert[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await client.from("pages").insert(rows);

  if (error) {
    throw toError("insertPages", error);
  }
}

export async function deleteEventOccurrencesByEventId(
  client: SupabaseServiceClient,
  eventId: string
): Promise<void> {
  const { error } = await client.from("event_occurrences").delete().eq("event_id", eventId);
  if (error) {
    throw toError("deleteEventOccurrencesByEventId", error);
  }
}

export async function listPages(
  client: SupabaseServiceClient,
  filters: { galleryId?: string | null; kind?: PageKind | null; limit?: number } = {}
): Promise<PageListItem[]> {
  const { galleryId, kind, limit = 200 } = filters;
  let query = client
    .from("pages")
    .select("id, url, normalized_url, kind, fetch_status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (galleryId) {
    query = query.eq("gallery_id", galleryId);
  }
  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;

  if (error) {
    throw toError("listPages", error);
  }

  return (data ?? []) as PageListItem[];
}
