import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getPublicClient, type MarketConfig } from "@shared";
import { searchGalleries } from "./services/gallery-search";
import { searchEvents } from "./services/event-search";
import type { EventCardData } from "./types/chat-state";

export const ZINE_TOOL_NAMES = [
  "retrieve_galleries",
  "get_gallery_events",
  "search_events"
] as const;

const weekdaySchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .describe("0=Sunday, 1=Monday, ..., 6=Saturday");

const visitTimeSchema = z.discriminatedUnion("precision", [
  z
    .object({
      precision: z.literal("day"),
      weekday: weekdaySchema
    })
    .strict(),
  z
    .object({
      precision: z.literal("exact_time"),
      weekday: weekdaySchema,
      timeMinutes: z.number().int().min(0).max(1439)
    })
    .strict()
]);

const gallerySearchCriteriaSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("semantic"),
      searchQuery: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("area"),
      area: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic_in_area"),
      searchQuery: z.string().trim().min(1),
      area: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("open_at"),
      openAt: visitTimeSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic_open_at"),
      searchQuery: z.string().trim().min(1),
      openAt: visitTimeSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("area_open_at"),
      area: z.string().trim().min(1),
      openAt: visitTimeSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic_in_area_open_at"),
      searchQuery: z.string().trim().min(1),
      area: z.string().trim().min(1),
      openAt: visitTimeSchema
    })
    .strict()
]);

const gallerySearchInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }).strict(),
  z
    .object({
      mode: z.literal("search"),
      criteria: gallerySearchCriteriaSchema
    })
    .strict()
]);

const galleryEventsInputSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("default"),
      galleryId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      mode: z.literal("limited"),
      galleryId: z.string().uuid(),
      limit: z.number().int().min(1).max(50)
    })
    .strict()
]);

const eventSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }).strict(),
  z
    .object({
      kind: z.literal("semantic"),
      searchQuery: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("artists"),
      artists: z.array(z.string().trim().min(1)).min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic_and_artists"),
      searchQuery: z.string().trim().min(1),
      artists: z.array(z.string().trim().min(1)).min(1)
    })
    .strict()
]);

const eventLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anywhere_in_market") }).strict(),
  z
    .object({
      kind: z.literal("area"),
      area: z.string().trim().min(1)
    })
    .strict()
]);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const eventTimingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current_and_upcoming") }).strict(),
  z.object({ kind: z.literal("on_date"), date: isoDateSchema }).strict(),
  z
    .object({
      kind: z.literal("date_range"),
      from: isoDateSchema,
      to: isoDateSchema
    })
    .strict()
]);

const eventAttendanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("in_person") }).strict(),
  z.object({ kind: z.literal("online") }).strict(),
  z.object({ kind: z.literal("any") }).strict()
]);

const eventResultSetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standard") }).strict(),
  z
    .object({
      kind: z.literal("limited"),
      count: z.number().int().min(1).max(20)
    })
    .strict()
]);

const eventSearchInputSchema = z
  .object({
    mode: z.literal("discover"),
    subject: eventSubjectSchema,
    location: eventLocationSchema,
    timing: eventTimingSchema,
    attendance: eventAttendanceSchema,
    results: eventResultSetSchema
  })
  .strict();

function normalizeGalleryEvent(
  event: {
    event_id: string;
    title: string;
    description: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
    status: string;
    ticket_url: string;
    source_url: string | null;
    artists: string[];
    tags: string[];
    images: string[];
    gallery: unknown;
  },
  fallbackTimezone: string
): EventCardData {
  const gallery =
    event.gallery && typeof event.gallery === "object"
      ? (event.gallery as Record<string, unknown>)
      : {};
  return {
    event_id: event.event_id,
    title: event.title,
    description: event.description ?? null,
    start_at: event.start_at,
    end_at: event.end_at ?? null,
    timezone: event.timezone ?? fallbackTimezone,
    status: event.status,
    ticket_url: event.ticket_url ?? null,
    source_url: event.source_url,
    artists: event.artists ?? [],
    tags: event.tags ?? [],
    images: event.images ?? [],
    gallery: {
      id: typeof gallery.id === "string" ? gallery.id : "",
      name: typeof gallery.name === "string" ? gallery.name : null,
      main_url: typeof gallery.main_url === "string" ? gallery.main_url : "",
      area: typeof gallery.area === "string" ? gallery.area : null,
      address: typeof gallery.address === "string" ? gallery.address : null
    }
  };
}

/** Build tools per turn so every execution uses this agent's typed bindings. */
export function createZineTools(env: Env, config: MarketConfig) {
  /**
   * Tool 1: Retrieve galleries matching search criteria
   * Returns ALL matching galleries with complete details for LLM analysis
   */
  const retrieveGalleries = tool({
    description: `
    Retrieve galleries matching search criteria using semantic search and filters.
    Returns ALL matching galleries with complete details (id, name, about, tags, ${config.city} area).

    Use mode "all" for the complete ${config.city} catalogue and mode "search" for a
    discovery request. The result renders gallery cards automatically.

    After receiving results:
    1. Read each gallery's name, about, and tags carefully
    2. Explain which galleries best match the user's request
    3. Do not call retrieve_galleries or another gallery tool again this turn
  `,
    inputSchema: gallerySearchInputSchema,
    execute: async (params) => {
      console.log("[retrieve_galleries] Called with params:", params);

      const supabase = getPublicClient(env);
      const { data, error } = await searchGalleries(
        supabase,
        params,
        env.OPENROUTER_API_KEY,
        config
      );

      if (error) {
        return `Database error: ${error.message}`;
      }

      // Return full data for LLM analysis
      return {
        type: "gallery-results" as const,
        market: config.market,
        city: config.city,
        found: data.length,
        nextAction:
          data.length > 0
            ? "Explain these results to the user. The gallery cards are already visible. Do not call another gallery tool this turn."
            : "Do not retry this search with equivalent arguments. Explain the catalogue limitation.",
        items: data
      };
    }
  });

  /**
   * Tool 4: Get gallery events
   * Fetch events for a specific gallery
   */
  const getGalleryEvents = tool({
    description: `
    Fetch events for a specific gallery.
    Use this after showing gallery recommendations when user wants details.
  `,
    inputSchema: galleryEventsInputSchema,
    execute: async (params) => {
      const { galleryId } = params;
      const limit = params.mode === "limited" ? params.limit : 20;
      console.log("[get_gallery_events] Called for gallery:", galleryId);

      const supabase = getPublicClient(env);

      const { data, error } = await supabase.rpc(
        "get_gallery_events_for_market",
        {
          gallery_uuid: galleryId,
          event_limit: limit,
          filter_market: config.market
        }
      );

      if (error) {
        return `Error fetching events: ${error.message}`;
      }

      const cutoff = Date.now();
      const upcomingEvents = (data ?? [])
        .filter((event) => Date.parse(event.end_at ?? event.start_at) >= cutoff)
        .map((event) => normalizeGalleryEvent(event, config.timezone));

      return {
        type: "event-results" as const,
        source: "gallery" as const,
        market: config.market,
        city: config.city,
        galleryId,
        events: upcomingEvents
      };
    }
  });

  /**
   * Tool 5: Search events
   * Find events using semantic search with date and artist filters
   */
  const searchEventsT = tool({
    description: `
    Search for art events using semantic search and filters.
    Returns ALL matching events with complete details for LLM analysis.

    Events are automatically filtered to only show events from the current time onward.

    Always provide five explicit discriminated dimensions:
    subject (any, semantic, artists, semantic_and_artists), location
    (anywhere_in_market or area), and timing (current_and_upcoming, on_date,
    or date_range), attendance (in_person, online, or any), and results
    (standard or limited). Use results limited with the exact requested count;
    otherwise use standard. Use in_person for a place-based visit unless the
    user explicitly asks for online events.

    After receiving results, analyze and present relevant events to the user.
  `,
    inputSchema: eventSearchInputSchema,
    execute: async (params) => {
      console.log("[search_events] Called with params:", params);

      const supabase = getPublicClient(env);
      const { data, error } = await searchEvents(
        supabase,
        params,
        env.OPENROUTER_API_KEY,
        config
      );

      if (error) {
        return `Database error: ${error.message}`;
      }

      return {
        type: "event-results" as const,
        source: "search" as const,
        market: config.market,
        city: config.city,
        found: data.length,
        events: data.map((e) => ({
          event_id: e.event_id,
          title: e.title,
          description: e.description,
          start_at: e.start_at,
          end_at: e.end_at,
          timezone: e.timezone ?? config.timezone,
          status: e.status,
          ticket_url: e.ticket_url,
          source_url: e.source_url,
          artists: e.artists,
          tags: e.tags,
          images: e.images,
          gallery: {
            id: e.gallery_id,
            name: e.gallery_name,
            main_url: e.gallery_main_url,
            area: e.gallery_district,
            address: e.gallery_address
          }
        }))
      };
    }
  });

  return {
    retrieve_galleries: retrieveGalleries,
    get_gallery_events: getGalleryEvents,
    search_events: searchEventsT
  } satisfies ToolSet;
}
