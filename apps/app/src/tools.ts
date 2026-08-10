import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getPublicClient } from "@shared";
import { searchGalleries, getGalleriesByIds } from "./services/gallery-search";
import { searchEvents } from "./services/event-search";

export const ZINE_TOOL_NAMES = [
  "retrieve_galleries",
  "show_recommendations",
  "get_gallery_events",
  "search_events"
] as const;

/** Build tools per turn so every execution uses this agent's typed bindings. */
export function createZineTools(env: Env) {
  /**
   * Tool 1: Retrieve galleries matching search criteria
   * Returns ALL matching galleries with complete details for LLM analysis
   */
  const retrieveGalleries = tool({
    description: `
    Retrieve galleries matching search criteria using semantic search and filters.
    Returns ALL matching galleries with complete details (id, name, about, tags, London area).

    You MUST provide at least ONE of: searchQuery, area, or openAt.

    After receiving results:
    1. Read each gallery's name, about, and tags carefully
    2. Decide which galleries best match user preferences
    3. Call show_recommendations with the gallery IDs you chose
  `,
    inputSchema: z
      .object({
        searchQuery: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "OPTIONAL: Natural language query using semantic understanding (e.g., 'calm minimalist spaces', 'energetic contemporary art')"
          ),
        area: z.string().trim().min(1)
          .optional()
          .describe("OPTIONAL: Filter by London area, borough, or neighbourhood"),
        openAt: z
          .object({
            weekday: z
              .number()
              .int()
              .min(0)
              .max(6)
              .describe(
                "0=Sunday, 1=Monday, ..., 6=Saturday. Focus on weekday."
              ),
            timeMinutes: z
              .number()
              .int()
              .min(0)
              .max(1439)
              .optional()
              .describe(
                "OPTIONAL: Minutes since midnight (e.g., 840 = 2pm). Only include if user mentions specific time."
              )
          })
          .optional()
          .describe(
            "OPTIONAL: Filter by day/time. Weekday is primary, timeMinutes only if user specifies exact time."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("OPTIONAL: Max results (default: 20)")
      })
      .refine((data) => data.searchQuery || data.area || data.openAt, {
        message:
          "Must provide at least one of: searchQuery, area, or openAt"
      }),
    execute: async (params) => {
      console.log("[retrieve_galleries] Called with params:", params);

      const supabase = getPublicClient(env);
      const { data, error } = await searchGalleries(
        supabase,
        params,
        env.OPENROUTER_API_KEY
      );

      if (error) {
        return `Database error: ${error.message}`;
      }

      // Return full data for LLM analysis
      return {
        found: data.length,
        galleries: data.map((g) => ({
          id: g.id,
          name: g.name,
          about: g.about,
          area: g.district,
          address: g.address,
          tags: g.tags,
          instagram: g.instagram,
          main_url: g.main_url
        }))
      };
    }
  });

  /**
   * Tool 2: Show gallery recommendations
   * Refetches galleries by IDs and displays as cards
   * Context-aware: Returns UI data for web, sends WhatsApp messages for WhatsApp
   */
  const showRecommendations = tool({
    description: `
    Display your selected galleries as recommendation cards.

    Provide the gallery IDs (from retrieve_galleries results) that you want to show.
    This will fetch fresh data and display cards to the user.

    IMPORTANT: After calling this, explain WHY you chose these galleries.
  `,
    inputSchema: z.object({
      galleryIds: z
        .array(z.string().uuid())
        .min(1)
        .max(10)
        .describe("Array of gallery IDs to display")
    }),
    execute: async ({ galleryIds }) => {
      console.log("[show_recommendations] Called with IDs:", galleryIds);

      const supabase = getPublicClient(env);

      // Refetch galleries by IDs
      const { data, error } = await getGalleriesByIds(supabase, galleryIds);

      if (error) {
        return `Error fetching galleries: ${error.message}`;
      }

      console.log(
        `[show_recommendations] Returning ${data.length} galleries as data`
      );

      // Return data for both web and WhatsApp
      // For web: React UI will render cards
      // For WhatsApp: AI will format and include in text response
      return {
        type: "gallery-results" as const,
        items: data
      };
    }
  });

  // /**
  //  * Tool 3: Update gallery requirements
  //  * Silently updates user's gallery preferences
  //  */
  // const updateGalleryRequirements = tool({
  //   description: `
  //     Silently update user's gallery preferences. Never announce this action.
  //     Call when user mentions district, aesthetics, mood, or time preferences.
  //   `,
  //   inputSchema: z.object({
  //     district: districtEnum.optional(),
  //     aesthetics: z
  //       .array(z.string().trim().min(1))
  //       .optional()
  //       .describe("Aesthetic keywords: minimalist, contemporary, experimental, etc."),
  //     mood: z
  //       .string()
  //       .trim()
  //       .min(1)
  //       .optional()
  //       .describe("Mood/vibe: calm, energetic, contemplative, playful, etc."),
  //     preferredTime: z
  //       .object({
  //         weekday: z.number().int().min(0).max(6),
  //         timeMinutes: z.number().int().min(0).max(1439),
  //       })
  //       .optional()
  //       .describe("Preferred visiting time"),
  //   }),
  //   execute: async (params) => {
  //     const { agent } = getCurrentAgent<Zine>();
  //     if (!agent) throw new Error("Agent not available");

  //     agent.updateGalleryRequirements(params);

  //     return { success: true };
  //   },
  // });

  /**
   * Tool 4: Get gallery events
   * Fetch events for a specific gallery
   */
  const getGalleryEvents = tool({
    description: `
    Fetch events for a specific gallery.
    Use this after showing gallery recommendations when user wants details.
  `,
    inputSchema: z.object({
      galleryId: z
        .string()
        .uuid()
        .describe(
          "Gallery ID (from retrieve_galleries or show_recommendations)"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of events to return (default: 20)")
    }),
    execute: async ({ galleryId, limit }) => {
      console.log("[get_gallery_events] Called for gallery:", galleryId);

      const supabase = getPublicClient(env);

      const { data, error } = await supabase.rpc("get_gallery_events", {
        gallery_uuid: galleryId,
        event_limit: limit ?? 20
      });

      if (error) {
        return `Error fetching events: ${error.message}`;
      }

      const cutoff = Date.now();
      const upcomingEvents = (data ?? []).filter(
        (event) => Date.parse(event.start_at) >= cutoff
      );

      return {
        type: "event-results" as const,
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

    You MUST provide at least ONE of: searchQuery or artists.

    After receiving results, analyze and present relevant events to the user.
  `,
    inputSchema: z
      .object({
        searchQuery: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "OPTIONAL: Natural language query (e.g., 'photography exhibitions', 'contemporary sculpture')"
          ),
        artists: z
          .array(z.string().trim().min(1))
          .optional()
          .describe(
            "OPTIONAL: Array of artist names. Matches events featuring ANY of these artists."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("OPTIONAL: Max results (default: 20)")
      })
      .refine(
        (data) => data.searchQuery || (data.artists && data.artists.length > 0),
        {
          message: "Must provide at least one of: searchQuery or artists"
        }
      ),
    execute: async (params) => {
      console.log("[search_events] Called with params:", params);

      const supabase = getPublicClient(env);
      const { data, error } = await searchEvents(
        supabase,
        params,
        env.OPENROUTER_API_KEY
      );

      if (error) {
        return `Database error: ${error.message}`;
      }

      return {
        found: data.length,
        events: data.map((e) => ({
          event_id: e.event_id,
          title: e.title,
          description: e.description,
          start_at: e.start_at,
          end_at: e.end_at,
          artists: e.artists,
          tags: e.tags,
          images: e.images,
          gallery: {
            id: e.gallery_id,
            name: e.gallery_name,
            url: e.gallery_main_url,
            district: e.gallery_district,
            address: e.gallery_address
          }
        }))
      };
    }
  });

  return {
    retrieve_galleries: retrieveGalleries,
    show_recommendations: showRecommendations,
    get_gallery_events: getGalleryEvents,
    search_events: searchEventsT
  } satisfies ToolSet;
}
