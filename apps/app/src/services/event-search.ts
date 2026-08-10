import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { createEmbedder, toPgVector } from "@shared";
import type { MarketConfig } from "@shared";
import { marketAreaCandidates, matchesMarketArea } from "./market-area";

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
  { kind: "anywhere_in_market" } | { kind: "area"; area: string };

export type EventTiming =
  | { kind: "current_and_upcoming" }
  | { kind: "on_date"; date: string }
  | { kind: "date_range"; from: string; to: string };

export type EventAttendance =
  { kind: "in_person" } | { kind: "online" } | { kind: "any" };

export type EventResultSet =
  { kind: "standard" } | { kind: "limited"; count: number };

/** Every discovery dimension is an explicit discriminated union. */
export type EventSearchParams = {
  mode: "discover";
  subject: EventSubject;
  location: EventLocation;
  timing: EventTiming;
  attendance: EventAttendance;
  results: EventResultSet;
};

/** Return the current instant in the format expected by Supabase/Postgres. */
export function getEventSearchStart(now = new Date()): string {
  return now.toISOString();
}

export type EventSearchWindow = { start: string; end: string };

const OPEN_ENDED_SEARCH_END = "9999-12-31T23:59:59.999Z";

function timezoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second")
  );
  return representedAsUtc - at.getTime();
}

function marketMidnight(date: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid market date: ${date}`);
  const targetWallTime = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  let instant = new Date(targetWallTime);
  instant = new Date(targetWallTime - timezoneOffsetMs(instant, timezone));
  // Re-evaluate at the resolved instant because it may cross a DST boundary.
  instant = new Date(targetWallTime - timezoneOffsetMs(instant, timezone));
  return instant.toISOString();
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function getEventSearchWindow(
  timing: EventTiming,
  timezone: string,
  now = new Date()
): EventSearchWindow {
  if (timing.kind === "current_and_upcoming") {
    return { start: now.toISOString(), end: OPEN_ENDED_SEARCH_END };
  }
  if (timing.kind === "on_date") {
    return {
      start: marketMidnight(timing.date, timezone),
      end: marketMidnight(addCalendarDays(timing.date, 1), timezone)
    };
  }
  return {
    start: marketMidnight(timing.from, timezone),
    end: marketMidnight(addCalendarDays(timing.to, 1), timezone)
  };
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

function toMarketDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function eventMatchesTiming(
  event: Pick<EventSearchResult, "start_at" | "end_at">,
  timing: EventTiming,
  now = new Date(),
  timezone = "Europe/London"
): boolean {
  const effectiveEnd = event.end_at ?? event.start_at;
  if (timing.kind === "current_and_upcoming") {
    return Date.parse(effectiveEnd) >= now.getTime();
  }

  const eventStartDate = toMarketDate(event.start_at, timezone);
  const eventEndDate = toMarketDate(effectiveEnd, timezone);
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
  config: MarketConfig,
  now = new Date()
): EventSearchResult[] {
  return events.filter((event) => {
    const locationMatches =
      params.location.kind === "anywhere_in_market" ||
      matchesMarketArea(
        event.gallery_district,
        params.location.area,
        config.market
      );
    return (
      locationMatches &&
      eventMatchesTiming(event, params.timing, now, config.timezone) &&
      eventMatchesAttendance(event, params.attendance)
    );
  });
}

export function deduplicateEvents(
  events: EventSearchResult[]
): EventSearchResult[] {
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
 * Preserve semantic relevance while preventing a recurring tour/session at a
 * single gallery from consuming the whole result set.
 */
export function diversifyEvents(
  events: EventSearchResult[]
): EventSearchResult[] {
  const uniqueSeries: EventSearchResult[] = [];
  const recurring: EventSearchResult[] = [];
  const seenSeries = new Set<string>();
  for (const event of deduplicateEvents(events)) {
    const seriesKey = [
      event.gallery_id,
      event.title.trim().toLowerCase().replace(/\s+/g, " ")
    ].join("|");
    if (seenSeries.has(seriesKey)) recurring.push(event);
    else {
      seenSeries.add(seriesKey);
      uniqueSeries.push(event);
    }
  }

  const queues = new Map<string, EventSearchResult[]>();
  for (const event of uniqueSeries) {
    const queue = queues.get(event.gallery_id) ?? [];
    queue.push(event);
    queues.set(event.gallery_id, queue);
  }
  const interleaved: EventSearchResult[] = [];
  while (queues.size > 0) {
    for (const [galleryId, queue] of queues) {
      const next = queue.shift();
      if (next) interleaved.push(next);
      if (queue.length === 0) queues.delete(galleryId);
    }
  }
  return [...interleaved, ...recurring];
}

/**
 * Search events using semantic search and filters
 */
export async function searchEvents(
  supabase: SupabaseClient<Database>,
  params: EventSearchParams,
  openRouterApiKey: string,
  config: MarketConfig
): Promise<{ data: EventSearchResult[]; error: Error | null }> {
  const { subject } = params;
  const searchQuery =
    "searchQuery" in subject ? subject.searchQuery : undefined;
  const artists = "artists" in subject ? subject.artists : undefined;
  const limit = params.results.kind === "limited" ? params.results.count : 20;
  const window = getEventSearchWindow(params.timing, config.timezone);
  const areas =
    params.location.kind === "area"
      ? marketAreaCandidates(params.location.area, config.market)
      : [];

  console.log("[event-search] Searching with params:", params);
  console.log("[event-search] SQL event window:", window);

  try {
    // If searchQuery provided, use embedding-based semantic search
    if (searchQuery?.trim()) {
      console.log(
        "[event-search] Generating embedding for query:",
        searchQuery
      );

      const embedder = createEmbedder(openRouterApiKey);
      const embedding = await embedder(searchQuery.trim());
      const embeddingVector = toPgVector(embedding);

      console.log("[event-search] Calling search_events_for_market_v2 RPC");

      const { data, error } = await supabase.rpc("search_events_for_market_v2", {
        filter_market: config.market,
        query_embedding: embeddingVector,
        match_count: Math.min(Math.max(limit * 6, 100), 500),
        match_threshold: 0.3,
        filter_window_start: window.start,
        filter_window_end: window.end,
        filter_areas: areas,
        filter_attendance: params.attendance.kind,
        filter_artists: artists ?? []
      });

      if (error) {
        console.error("[event-search] RPC error:", error);
        return { data: [], error: new Error(error.message) };
      }

      if (!data) {
        return { data: [], error: null };
      }

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
        source_url: e.source_url ?? null,
        artists: e.artists ?? [],
        tags: e.tags ?? [],
        images: e.images ?? [],
        gallery_id: e.gallery_id,
        gallery_name: e.gallery_name ?? null,
        gallery_main_url: e.gallery_main_url,
        gallery_district: e.gallery_district ?? null,
        gallery_address: e.gallery_address ?? null
      }));

      const filteredResults = diversifyEvents(
        filterEvents(results, params, config)
      ).slice(0, limit);
      console.log(
        `[event-search] Found ${filteredResults.length} events via embedding search`
      );
      return { data: filteredResults, error: null };
    }

    // No searchQuery: fall back to basic filtering (date and/or artists only)
    console.log("[event-search] No search query, using basic filter");

    const { data, error } = await supabase.rpc("browse_events_for_market", {
      filter_market: config.market,
      match_count: Math.min(Math.max(limit * 6, 100), 500),
      filter_window_start: window.start,
      filter_window_end: window.end,
      filter_areas: areas,
      filter_attendance: params.attendance.kind,
      filter_artists: artists ?? []
    });

    if (error) {
      console.error("[event-search] Query error:", error);
      return { data: [], error: new Error(error.message) };
    }

    if (!data) {
      return { data: [], error: null };
    }

    // Map to EventSearchResult format
    const results: EventSearchResult[] = data.map((e) => ({
      event_id: e.event_id,
      title: e.title,
      description: e.description ?? null,
      start_at: e.start_at,
      end_at: e.end_at,
      timezone: e.timezone,
      status: e.status,
      ticket_url: e.ticket_url,
      source_url: e.source_url,
      artists: e.artists ?? [],
      tags: e.tags ?? [],
      images: e.images ?? [],
      gallery_id: e.gallery_id,
      gallery_name: e.gallery_name ?? null,
      gallery_main_url: e.gallery_main_url,
      gallery_district: e.gallery_district ?? null,
      gallery_address: e.gallery_address ?? null
    }));

    const filteredResults = diversifyEvents(
      filterEvents(results, params, config)
    ).slice(0, limit);
    console.log(
      `[event-search] Found ${filteredResults.length} events via basic filter`
    );
    return { data: filteredResults, error: null };
  } catch (err) {
    console.error("[event-search] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: new Error(errorMessage) };
  }
}
