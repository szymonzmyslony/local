import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { createEmbedder, toPgVector } from "@shared";
import type { GalleryDistrict } from "../types/chat-state";

/**
 * Gallery search parameters
 * At least ONE of searchQuery, district, or openAt must be provided
 */
export type GallerySearchParams = {
  searchQuery?: string;             // OPTIONAL - semantic search via embeddings
  district?: GalleryDistrict;       // OPTIONAL - filter by district
  openAt?: {
    weekday: number;                // 0-6 (0=Sunday)
    timeMinutes?: number;           // 0-1439 (minutes since midnight) - optional
  };
  limit?: number;                   // OPTIONAL - default: 20
};

/**
 * Complete gallery data for LLM analysis and display
 */
export type GallerySearchResult = {
  id: string;
  name: string | null;
  about: string | null;
  district: GalleryDistrict | null;
  address: string | null;
  tags: string[] | null;
  main_url: string;
  about_url: string | null;
  events_page: string | null;
  instagram: string | null;
  phone: string | null;
  email: string | null;
  google_maps_url: string | null;
};

type GalleryQueryResult = Database["public"]["Tables"]["galleries"]["Row"] & {
  gallery_info: Database["public"]["Tables"]["gallery_info"]["Row"] | null;
};

/**
 * Retrieve galleries matching search criteria
 * Uses embedding-based semantic search with SQL filters for district and hours
 */
export async function searchGalleries(
  supabase: SupabaseClient<Database>,
  params: GallerySearchParams,
  openaiApiKey: string
): Promise<{ data: GallerySearchResult[]; error: Error | null }> {
  const { searchQuery, district, openAt, limit = 20 } = params;

  // Validate: at least one search criterion must be provided
  if (!searchQuery && !district && !openAt) {
    console.error("[gallery-search] No search parameters provided");
    return {
      data: [],
      error: new Error("At least one search parameter required (searchQuery, district, or openAt)")
    };
  }

  console.log("[gallery-search] Searching with params:", params);

  try {
    // If searchQuery provided, use embedding-based semantic search
    if (searchQuery && searchQuery.trim()) {
      console.log("[gallery-search] Generating embedding for query:", searchQuery);

      const embedder = createEmbedder(openaiApiKey);
      const embedding = await embedder(searchQuery.trim());
      const embeddingVector = toPgVector(embedding);

      console.log("[gallery-search] Calling search_galleries_filtered RPC");

      const { data, error } = await supabase.rpc("search_galleries_filtered", {
        query_embedding: embeddingVector,
        match_count: limit,
        match_threshold: 0.3,
        filter_district: district ?? undefined,
        filter_weekday: openAt?.weekday ?? undefined,
        filter_time_minutes: openAt?.timeMinutes ?? undefined,
      });

      if (error) {
        console.error("[gallery-search] RPC error:", error);
        return { data: [], error: new Error(error.message) };
      }

      if (!data) {
        return { data: [], error: null };
      }

      // Map RPC results to GallerySearchResult format
      const results: GallerySearchResult[] = data.map((g) => ({
        id: g.id,
        name: g.name ?? null,
        about: g.about ?? null,
        district: (g.district as GalleryDistrict) ?? null,
        address: g.address ?? null,
        tags: g.tags ?? null,
        main_url: g.main_url,
        about_url: g.about_url ?? null,
        events_page: g.events_page ?? null,
        instagram: g.instagram ?? null,
        phone: g.phone ?? null,
        email: g.email ?? null,
        google_maps_url: g.google_maps_url ?? null,
      }));

      console.log(`[gallery-search] Found ${results.length} galleries via embedding search`);
      return { data: results, error: null };
    }

    // No searchQuery: fall back to basic filtering (district and/or openAt only)
    console.log("[gallery-search] No search query, using basic filter");

    let query = supabase
      .from("galleries")
      .select(
        `
        id,
        main_url,
        normalized_main_url,
        about_url,
        events_page,
        gallery_info!inner (
          name,
          about,
          district,
          address,
          tags,
          email,
          phone,
          instagram,
          google_maps_url
        )
      `
      )
      .limit(limit);

    if (district) {
      query = query.eq("gallery_info.district", district);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[gallery-search] Query error:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

    let results: GallerySearchResult[] = (data as GalleryQueryResult[]).map((g) => ({
      id: g.id,
      name: g.gallery_info?.name ?? null,
      about: g.gallery_info?.about ?? null,
      district: g.gallery_info?.district ?? null,
      address: g.gallery_info?.address ?? null,
      tags: g.gallery_info?.tags ?? null,
      main_url: g.main_url,
      about_url: g.about_url,
      events_page: g.events_page,
      instagram: g.gallery_info?.instagram ?? null,
      phone: g.gallery_info?.phone ?? null,
      email: g.gallery_info?.email ?? null,
      google_maps_url: g.gallery_info?.google_maps_url ?? null,
    }));

    // Apply hours filter if specified (only for non-embedding search)
    if (openAt && results.length > 0) {
      const galleryIds = results.map((g) => g.id);

      const { data: hoursData, error: hoursError } = await supabase
        .from("gallery_hours")
        .select("gallery_id, weekday, open_minutes")
        .in("gallery_id", galleryIds)
        .eq("weekday", openAt.weekday);

      if (hoursError) {
        console.error("[gallery-search] Hours query error:", hoursError);
        return { data: [], error: new Error(hoursError.message) };
      }

      if (hoursData) {
        // Find galleries open at specified time
        const openGalleryIds = new Set(
          hoursData
            .filter((h) => {
              const ranges = h.open_minutes as unknown;
              if (!Array.isArray(ranges)) return false;

              // If timeMinutes not specified, just check if gallery has hours for this weekday
              if (openAt.timeMinutes === undefined) {
                return true;
              }

              // Check if time falls within any range
              return ranges.some((range) => {
                if (!Array.isArray(range) || range.length < 2) return false;
                const [start, end] = range as [number, number];
                return openAt.timeMinutes! >= start && openAt.timeMinutes! <= end;
              });
            })
            .map((h) => h.gallery_id)
        );

        results = results.filter((g) => openGalleryIds.has(g.id));
      }
    }

    console.log(`[gallery-search] Found ${results.length} galleries via basic filter`);
    return { data: results, error: null };
  } catch (err) {
    console.error("[gallery-search] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: new Error(errorMessage) };
  }
}

/**
 * Get specific galleries by IDs (for show_recommendations)
 * Refetches fresh data from database
 */
export async function getGalleriesByIds(
  supabase: SupabaseClient<Database>,
  galleryIds: string[]
): Promise<{ data: GallerySearchResult[]; error: Error | null }> {
  console.log("[gallery-search] Fetching galleries by IDs:", galleryIds);

  try {
    const { data, error } = await supabase
      .from("galleries")
      .select(
        `
        id,
        main_url,
        normalized_main_url,
        about_url,
        events_page,
        gallery_info!inner (
          name,
          about,
          district,
          address,
          tags,
          email,
          phone,
          instagram,
          google_maps_url
        )
      `
      )
      .in("id", galleryIds);

    if (error) {
      console.error("[gallery-search] Error fetching by IDs:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

    const results: GallerySearchResult[] = (data as GalleryQueryResult[]).map((g) => ({
      id: g.id,
      name: g.gallery_info?.name ?? null,
      about: g.gallery_info?.about ?? null,
      district: g.gallery_info?.district ?? null,
      address: g.gallery_info?.address ?? null,
      tags: g.gallery_info?.tags ?? null,
      main_url: g.main_url,
      about_url: g.about_url,
      events_page: g.events_page,
      instagram: g.gallery_info?.instagram ?? null,
      phone: g.gallery_info?.phone ?? null,
      email: g.gallery_info?.email ?? null,
      google_maps_url: g.gallery_info?.google_maps_url ?? null,
    }));

    console.log(`[gallery-search] Fetched ${results.length} galleries by ID`);
    return { data: results, error: null };
  } catch (err) {
    console.error("[gallery-search] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: new Error(errorMessage) };
  }
}
