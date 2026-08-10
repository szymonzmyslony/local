import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { createEmbedder, toPgVector } from "@shared";
import { matchesLondonArea } from "./london-area";

export type EventSubject =
  | { kind: "any" }
  | { kind: "semantic"; searchQuery: string }
  | { kind: "artists"; artists: string[] }
  | {
      kind: "semantic_and_artists";
      searchQuery: string;
      artists: string[];
    };

export type EventLocation =
  | { kind: "anywhere_in_london" }
  | { kind: "area"; area: string };

export type EventTiming =
  | { kind: "current_and_upcoming" }
  | { kind: "on_date"; date: string }
  | { kind: "date_range"; from: string; to: string };

export type EventAttendance =
  | { kind: "in_person" }
  | { kind: "online" }
  | { kind: "any" };

/** Every discovery dimension is an explicit discriminated union. */
export type EventSearchParams = {
  mode: "discover";
  subject: EventSubject;
  location: EventLocation;
  timing: EventTiming;
  attendance: EventAttendance;
};

/** Return the current instant in the format expected by Supabase/Postgres. */
export function getEventSearchStart(now = new Date()): string {
  return now.toISOString();
}

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
  source_url: string | null;
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

const londonDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function toLondonDate(value: string): string {
  return londonDateFormatter.format(new Date(value));
}

export function eventMatchesTiming(
  event: Pick<EventSearchResult, "start_at" | "end_at">,
  timing: EventTiming,
  now = new Date()
): boolean {
  const effectiveEnd = event.end_at ?? event.start_at;
  if (timing.kind === "current_and_upcoming") {
    return Date.parse(effectiveEnd) >= now.getTime();
  }

  const eventStartDate = toLondonDate(event.start_at);
  const eventEndDate = toLondonDate(effectiveEnd);
  if (timing.kind === "on_date") {
    return eventStartDate <= timing.date && eventEndDate >= timing.date;
  }
  return eventStartDate <= timing.to && eventEndDate >= timing.from;
}

export function eventMatchesAttendance(
  event: Pick<EventSearchResult, "title" | "description" | "tags">,
  attendance: EventAttendance
): boolean {
  if (attendance.kind === "any") return true;
  const evidence = [event.title, event.description ?? "", ...event.tags]
    .join(" ")
    .toLowerCase();
  const isOnlineOnly =
    /\bonline[- ]only\b/.test(evidence) ||
    /\bonline (exhibition|event|screening|programme|program)\b/.test(evidence);
  return attendance.kind === "online" ? isOnlineOnly : !isOnlineOnly;
}

function filterEvents(
  events: EventSearchResult[],
  params: EventSearchParams,
  now = new Date()
): EventSearchResult[] {
  return events.filter((event) => {
    const locationMatches =
      params.location.kind === "anywhere_in_london" ||
      matchesLondonArea(event.gallery_district, params.location.area);
    return (
      locationMatches &&
      eventMatchesTiming(event, params.timing, now) &&
      eventMatchesAttendance(event, params.attendance)
    );
  });
}

export function deduplicateEvents(events: EventSearchResult[]): EventSearchResult[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = [
      event.gallery_id,
      event.title.trim().toLowerCase().replace(/\s+/g, " "),
      event.start_at
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Search events using semantic search and filters
 */
export async function searchEvents(
  supabase: SupabaseClient<Database>,
  params: EventSearchParams,
  openRouterApiKey: string
): Promise<{ data: EventSearchResult[]; error: Error | null }> {
  const { subject } = params;
  const searchQuery =
    "searchQuery" in subject ? subject.searchQuery : undefined;
  const artists = "artists" in subject ? subject.artists : undefined;
  const limit = 20;
  const searchStart = getEventSearchStart();

  console.log("[event-search] Searching with params:", params);
  console.log("[event-search] Auto-filtering events after:", searchStart);

  try {
    // If searchQuery provided, use embedding-based semantic search
    if (searchQuery?.trim()) {
      console.log("[event-search] Generating embedding for query:", searchQuery);

      const embedder = createEmbedder(openRouterApiKey);
      const embedding = await embedder(searchQuery.trim());
      const embeddingVector = toPgVector(embedding);

      console.log("[event-search] Calling search_events_filtered RPC");

      const { data, error } = await supabase.rpc("search_events_filtered", {
        query_embedding: embeddingVector,
        match_count: 100,
        match_threshold: 0.3,
        filter_start_after:
          params.timing.kind === "current_and_upcoming"
            ? searchStart
            : `${params.timing.kind === "on_date" ? params.timing.date : params.timing.from}T00:00:00Z`,
        filter_artists: artists ?? undefined,
      });

      if (error) {
        console.error("[event-search] RPC error:", error);
        return { data: [], error: new Error(error.message) };
      }

      if (!data) {
        return { data: [], error: null };
      }

      const eventIds = (data ?? []).map((event) => event.event_id);
      const { data: sourceRows } = eventIds.length
        ? await supabase.from("events").select("id, source_url").in("id", eventIds)
        : { data: [] };
      const sourceUrls = new Map(
        (sourceRows ?? []).map((event) => [event.id, event.source_url])
      );

      // Map RPC results to EventSearchResult format.
      const results: EventSearchResult[] = data.map((e) => ({
        event_id: e.event_id,
        title: e.title,
        description: e.description ?? null,
        start_at: e.start_at,
        end_at: e.end_at ?? null,
        timezone: e.timezone ?? null,
        status: e.status,
        ticket_url: e.ticket_url ?? null,
        source_url: sourceUrls.get(e.event_id) ?? null,
        artists: e.artists ?? [],
        tags: e.tags ?? [],
        images: e.images ?? [],
        gallery_id: e.gallery_id,
        gallery_name: e.gallery_name ?? null,
        gallery_main_url: e.gallery_main_url,
        gallery_district: e.gallery_district ?? null,
        gallery_address: e.gallery_address ?? null,
      }));

      const filteredResults = deduplicateEvents(filterEvents(results, params)).slice(
        0,
        limit
      );
      console.log(`[event-search] Found ${filteredResults.length} events via embedding search`);
      return { data: filteredResults, error: null };
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
        source_url,
        gallery_id,
        event_info!inner (
          description,
          artists,
          tags,
          images
        ),
        galleries!inner (
          main_url,
          market,
          gallery_info (
            name,
            area,
            address
          )
        )
      `
      )
      .order("start_at", { ascending: true })
      .limit(100)
      .eq("galleries.market", "ldn")
      .eq("published", true);

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
      source_url: e.source_url,
      artists: e.event_info?.artists ?? [],
      tags: e.event_info?.tags ?? [],
      images: e.event_info?.images ?? [],
      gallery_id: e.gallery_id,
      gallery_name: e.galleries?.gallery_info?.name ?? null,
      gallery_main_url: e.galleries?.main_url ?? "",
      gallery_district: e.galleries?.gallery_info?.area ?? null,
      gallery_address: e.galleries?.gallery_info?.address ?? null,
    }));

    const filteredResults = deduplicateEvents(filterEvents(results, params)).slice(
      0,
      limit
    );
    console.log(`[event-search] Found ${filteredResults.length} events via basic filter`);
    return { data: filteredResults, error: null };
  } catch (err) {
    console.error("[event-search] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: new Error(errorMessage) };
  }
}
