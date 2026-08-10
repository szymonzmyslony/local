import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketConfig } from "@shared";
import { createEmbedder, toPgVector } from "@shared";
import type { GalleryDistrict } from "../types/chat-state";
import { marketAreaCandidates } from "./market-area";

export type GalleryVisitTime =
  | { precision: "day"; weekday: number }
  | { precision: "exact_time"; weekday: number; timeMinutes: number };

export type GallerySearchCriteria =
  | { kind: "semantic"; searchQuery: string }
  | { kind: "area"; area: string }
  | { kind: "semantic_in_area"; searchQuery: string; area: string }
  | { kind: "open_at"; openAt: GalleryVisitTime }
  | { kind: "semantic_open_at"; searchQuery: string; openAt: GalleryVisitTime }
  | { kind: "area_open_at"; area: string; openAt: GalleryVisitTime }
  | {
      kind: "semantic_in_area_open_at";
      searchQuery: string;
      area: string;
      openAt: GalleryVisitTime;
    };

/** Closed input protocol: catalogue listing or one explicit search shape. */
export type GallerySearchParams =
  | { mode: "all" }
  | { mode: "search"; criteria: GallerySearchCriteria };

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

type GalleryByIdQueryResult = Database["public"]["Tables"]["galleries"]["Row"] & {
  gallery_info: Database["public"]["Tables"]["gallery_info"]["Row"] | null;
};

/**
 * Retrieve galleries matching search criteria
 * Uses embedding-based semantic search with SQL filters for district and hours
 */
export async function searchGalleries(
  supabase: SupabaseClient<Database>,
  params: GallerySearchParams,
  openRouterApiKey: string,
  config: MarketConfig
): Promise<{ data: GallerySearchResult[]; error: Error | null }> {
  const criteria = params.mode === "search" ? params.criteria : null;
  const searchQuery =
    criteria && "searchQuery" in criteria ? criteria.searchQuery : undefined;
  const area = criteria && "area" in criteria ? criteria.area : undefined;
  const openAt = criteria && "openAt" in criteria ? criteria.openAt : undefined;
  const resultLimit = params.mode === "all" ? 1000 : 20;
  const areas = area ? marketAreaCandidates(area, config.market) : [];
  const weekday = openAt?.weekday ?? -1;
  const timeMinutes =
    openAt?.precision === "exact_time" ? openAt.timeMinutes : -1;

  console.log("[gallery-search] Searching with params:", params);

  try {
    // If searchQuery provided, use embedding-based semantic search
    if (searchQuery?.trim()) {
      console.log("[gallery-search] Generating embedding for query:", searchQuery);

      const embedder = createEmbedder(openRouterApiKey);
      const embedding = await embedder(searchQuery.trim());
      const embeddingVector = toPgVector(embedding);

      console.log("[gallery-search] Calling search_galleries_filtered RPC");

      const { data, error } = await supabase.rpc("search_galleries_for_market_v2", {
        filter_market: config.market,
        query_embedding: embeddingVector,
        match_count: resultLimit,
        match_threshold: 0.3,
        filter_areas: areas,
        filter_weekday: weekday,
        filter_time_minutes: timeMinutes
      });

      if (error) {
        console.error("[gallery-search] RPC error:", error);
        return { data: [], error: new Error(error.message) };
      }

      // Map RPC results to GallerySearchResult format
      const results: GallerySearchResult[] = (data ?? []).map((g) => ({
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

      if (results.length > 0) {
        console.log(`[gallery-search] Found ${results.length} galleries via embedding search`);
        return { data: results, error: null };
      }

      // A new or partially enriched catalogue may not have gallery embeddings
      // yet. Return the browsable market catalogue instead of encouraging the
      // agent to retry the same empty semantic search.
      console.warn("[gallery-search] Semantic search was empty; falling back to catalogue retrieval");
    }

    // No searchQuery: fall back to basic filtering (district and/or openAt only)
    console.log("[gallery-search] No search query, using basic filter");

    const { data, error } = await supabase.rpc("browse_galleries_for_market", {
      filter_market: config.market,
      match_count: resultLimit,
      filter_areas: areas,
      filter_weekday: weekday,
      filter_time_minutes: timeMinutes
    });

    if (error) {
      console.error("[gallery-search] Query error:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

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
      google_maps_url: g.google_maps_url ?? null
    }));
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
  galleryIds: string[],
  config: MarketConfig
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
          area,
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
      .in("id", galleryIds)
      .eq("market", config.market);

    if (error) {
      console.error("[gallery-search] Error fetching by IDs:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

    const results: GallerySearchResult[] = (data as GalleryByIdQueryResult[]).map((g) => ({
      id: g.id,
      name: g.gallery_info?.name ?? null,
      about: g.gallery_info?.about ?? null,
      district: g.gallery_info?.area ?? g.gallery_info?.district ?? null,
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
