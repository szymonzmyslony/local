import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { createEmbedder, toPgVector } from "@shared";

/**
 * Event search parameters
 * At least ONE of searchQuery or artists must be provided
 * Date filtering (startAfter) is automatically set to today
 */
export type EventSearchParams = {
  searchQuery?: string;     // OPTIONAL - semantic search via embeddings
  artists?: string[];       // OPTIONAL - array of artist names
  limit?: number;           // OPTIONAL - default: 20
};

// Fixed date for filtering - only show events after this date
const TODAY = "2025-10-14T00:00:00Z";

/**
 * Complete event data with linked gallery info
 */
export type EventSearchResult = {
  event_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  status: string;
  ticket_url: string | null;
  artists: string[];
  tags: string[];
  images: string[];
  gallery_id: string;
  gallery_name: string | null;
  gallery_main_url: string;
  gallery_district: string | null;
  gallery_address: string | null;
};

type EventQueryResult = Database["public"]["Tables"]["events"]["Row"] & {
  event_info: Database["public"]["Tables"]["event_info"]["Row"] | null;
  galleries: (Database["public"]["Tables"]["galleries"]["Row"] & {
    gallery_info: Database["public"]["Tables"]["gallery_info"]["Row"] | null;
  }) | null;
};

/**
 * Search events using semantic search and filters
 */
export async function searchEvents(
  supabase: SupabaseClient<Database>,
  params: EventSearchParams,
  openaiApiKey: string
): Promise<{ data: EventSearchResult[]; error: Error | null }> {
  const { searchQuery, artists, limit = 20 } = params;

  // Validate: at least one search criterion required
  if (!searchQuery && (!artists || artists.length === 0)) {
    console.error("[event-search] No search parameters provided");
    return {
      data: [],
      error: new Error("At least one search parameter required (searchQuery or artists)")
    };
  }

  console.log("[event-search] Searching with params:", params);
  console.log("[event-search] Auto-filtering events after:", TODAY);

  try {
    // If searchQuery provided, use embedding-based semantic search
    if (searchQuery && searchQuery.trim()) {
      console.log("[event-search] Generating embedding for query:", searchQuery);

      const embedder = createEmbedder(openaiApiKey);
      const embedding = await embedder(searchQuery.trim());
      const embeddingVector = toPgVector(embedding);

      console.log("[event-search] Calling search_events_filtered RPC");

      const { data, error } = await supabase.rpc("search_events_filtered", {
        query_embedding: embeddingVector,
        match_count: limit,
        match_threshold: 0.3,
        filter_start_after: TODAY,
        filter_artists: artists ?? undefined,
      });

      if (error) {
        console.error("[event-search] RPC error:", error);
        return { data: [], error: new Error(error.message) };
      }

      if (!data) {
        return { data: [], error: null };
      }

      // Map RPC results to EventSearchResult format
      const results: EventSearchResult[] = data.map((e) => ({
        event_id: e.event_id,
        title: e.title,
        description: e.description ?? null,
        start_at: e.start_at,
        end_at: e.end_at ?? null,
        timezone: e.timezone ?? null,
        status: e.status,
        ticket_url: e.ticket_url ?? null,
        artists: e.artists ?? [],
        tags: e.tags ?? [],
        images: e.images ?? [],
        gallery_id: e.gallery_id,
        gallery_name: e.gallery_name ?? null,
        gallery_main_url: e.gallery_main_url,
        gallery_district: e.gallery_district ?? null,
        gallery_address: e.gallery_address ?? null,
      }));

      console.log(`[event-search] Found ${results.length} events via embedding search`);
      return { data: results, error: null };
    }

    // No searchQuery: fall back to basic filtering (date and/or artists only)
    console.log("[event-search] No search query, using basic filter");

    let query = supabase
      .from("events")
      .select(
        `
        id,
        title,
        start_at,
        end_at,
        timezone,
        status,
        ticket_url,
        gallery_id,
        event_info!inner (
          description,
          artists,
          tags,
          images
        ),
        galleries (
          main_url,
          gallery_info (
            name,
            district,
            address
          )
        )
      `
      )
      .order("start_at", { ascending: true })
      .limit(limit)
      .gt("start_at", TODAY);

    if (artists && artists.length > 0) {
      query = query.overlaps("event_info.artists", artists);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[event-search] Query error:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

    // Map to EventSearchResult format
    const results: EventSearchResult[] = (data as unknown as EventQueryResult[]).map((e) => ({
      event_id: e.id,
      title: e.title,
      description: e.event_info?.description ?? null,
      start_at: e.start_at,
      end_at: e.end_at,
      timezone: e.timezone,
      status: e.status,
      ticket_url: e.ticket_url,
      artists: e.event_info?.artists ?? [],
      tags: e.event_info?.tags ?? [],
      images: e.event_info?.images ?? [],
      gallery_id: e.gallery_id,
      gallery_name: e.galleries?.gallery_info?.name ?? null,
      gallery_main_url: e.galleries?.main_url ?? "",
      gallery_district: e.galleries?.gallery_info?.district ?? null,
      gallery_address: e.galleries?.gallery_info?.address ?? null,
    }));

    console.log(`[event-search] Found ${results.length} events via basic filter`);
    return { data: results, error: null };
  } catch (err) {
    console.error("[event-search] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: new Error(errorMessage) };
  }
}
