import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";
import { getCurrentAgent } from "agents";
import {
  Constants,
  createEmbedder,
  getServiceClient,
  toPgVector,
  type Database
} from "@shared";
import type {
  GalleryToolResult,
  EventToolResult,
  CombinedToolResult
} from "./types/tool-results";
import type {
  UserRequirements,
  GalleryDistrict
} from "./types/chat-state";
import { Zine } from "./server";

// Use Supabase types as source of truth
type EventFromEmbedding = Database["public"]["Functions"]["match_events_with_data"]["Returns"][number];
type EventFromText = Database["public"]["Functions"]["text_search_events"]["Returns"][number];
type GalleryFromEmbedding = Database["public"]["Functions"]["match_gallery_with_data"]["Returns"][number];
type GalleryFromText = Database["public"]["Functions"]["text_search_galleries"]["Returns"][number];

const searchInputSchema = z.object({
  query: z.string().trim().min(2, "Query must be at least 2 characters"),
  matchCount: z.number().int().min(1).max(20).optional(),
});

type RequiredEnv = Pick<
  Env,
  "OPENAI_API_KEY" | "SUPABASE_URL" | "SUPABASE_ANON_KEY"
>;

const galleryDistrictValues = Constants.public.Enums.gallery_district;
const galleryDistrictTuple = galleryDistrictValues as unknown as [
  GalleryDistrict,
  ...GalleryDistrict[]
];
const districtEnum = z.enum(galleryDistrictTuple);


const districtInputSchema = z
  .union([districtEnum, z.string().trim().min(1)])
  .nullish();

const updateRequirementsSchema = z.object({
  district: districtInputSchema,
  artists: z.array(z.string().trim().min(1)).nullish(),
  aesthetics: z.array(z.string().trim().min(1)).nullish(),
  mood: z.string().trim().min(1).nullish(),
});



const matchGallery = tool({
  description:
    "Find galleries using semantic/vector search. Returns summary list for AI analysis. Stores results in state for show_recommendations to display as cards.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
  }) => {
    console.log("[match_gallery] Function called");
    const startTime = performance.now();
    console.log("[match_gallery] Starting query:", {
      query,
      matchCount: matchCount ?? 10,
    });
    const { agent } = getCurrentAgent<Zine>();

    if (!agent) {
      console.error('[match_gallery] Agent not available');
      throw new Error("Agent not available");
    }

    const env = agent.getEnv();
    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    const embeddingStart = performance.now();
    const vector = await embedder(query);
    const embeddingTime = performance.now() - embeddingStart;
    console.log(`[match_gallery] Embedding generated in ${embeddingTime.toFixed(2)}ms`);

    if (!vector.length) {
      agent.storeSearchResults([], []);
      return { found: 0, galleries: [] };
    }

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("match_gallery_with_data", {
      match_count: matchCount ?? 10,
      match_threshold: 0.2,
      query_embedding: toPgVector(vector)
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[match_gallery] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[match_gallery] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[match_gallery] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms, Embedding: ${embeddingTime.toFixed(2)}ms)`);
    console.log(`[match_gallery] Found ${data.length} galleries:`,
      data.map((g, i) => `[${i}] ${g.name} in ${g.district} (sim: ${g.similarity.toFixed(3)})`));

    // Store results with similarity from database
    agent.storeSearchResults([], data);
    const currentState = agent.getSearchResults();
    console.log(`[match_gallery] State after storing: ${currentState?.events.length || 0} events, ${currentState?.galleries.length || 0} galleries`);

    // Return simple summary for AI
    return {
      found: data.length,
      galleries: data.map((g, i) => ({
        index: i,
        name: g.name,
        district: g.district,
        about: g.about || "",
        tags: g.tags || [],
        similarity: Number(g.similarity.toFixed(3))
      }))
    };
  }
});

const matchEvent = tool({
  description:
    "Find events using semantic/vector search. Returns summary list for AI analysis. Stores results in state for show_recommendations to display as cards.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
  }) => {
    console.log("[match_event] Function called");

    const { agent } = getCurrentAgent<Zine>();
    if (!agent) {
      console.error('[match_event] Agent not available');
      throw new Error("Agent not available");
    }

    const env = agent.getEnv();
    const startTime = performance.now();
    console.log("[match_event] Starting query:", {
      query,
      matchCount: matchCount ?? 10,
    });

    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    const embeddingStart = performance.now();
    const vector = await embedder(query);
    const embeddingTime = performance.now() - embeddingStart;
    console.log(`[match_event] Embedding generated in ${embeddingTime.toFixed(2)}ms`);

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("match_events_with_data", {
      match_count: matchCount ?? 10,
      match_threshold: 0.2,
      query_embedding: toPgVector(vector)
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[match_event] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[match_event] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[match_event] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms, Embedding: ${embeddingTime.toFixed(2)}ms)`);
    console.log(`[match_event] Found ${data.length} events:`,
      data.map((e, i) => `[${i}] ${e.title} at ${e.gallery?.name} (sim: ${e.similarity.toFixed(3)})`));

    // Store results with similarity from database
    agent.storeSearchResults(data, []);
    const currentState = agent.getSearchResults();
    console.log(`[match_event] State after storing: ${currentState?.events.length || 0} events, ${currentState?.galleries.length || 0} galleries`);

    // Return simple summary for AI
    return {
      found: data.length,
      events: data.map((e, i) => ({
        index: i,
        title: e.title,
        description: e.description || "",
        gallery: e.gallery?.name || "Unknown",
        artists: e.artists || [],
        tags: e.tags || [],
        start_at: e.start_at || "",
        end_at: e.end_at || "",
        similarity: Number(e.similarity.toFixed(3))
      }))
    };
  }
});





const updateUserRequirements = tool({
  description:
    "Update the user's current requirements such as preferred district in Warsaw, desired artists, aesthetics, mood, or time preferences (months, weeks, day periods like morning/evening, or specific hours).",
  inputSchema: updateRequirementsSchema,
  execute: async ({ district, artists, aesthetics, mood }) => {
    const { agent } = getCurrentAgent<Zine>();

    if (!agent) {
      console.error('[updateUserRequirements] Agent not available');
      throw new Error("Agent not available");
    }

    // Build the partial requirements object with only provided fields
    const updatedRequirements: Partial<UserRequirements> = {};

    if (district !== undefined) {
      if (district === null) {
        updatedRequirements.district = null;
      } else if (typeof district === "string") {
        const normalized = district.trim().toLowerCase();
        updatedRequirements.district =
          galleryDistrictValues.find(
            (value) => value.toLowerCase() === normalized
          ) ?? null;
      } else {
        updatedRequirements.district = district;
      }
    }

    if (artists !== undefined) {
      updatedRequirements.artists = Array.from(
        new Set(
          (artists ?? [])
            .map((name) => name.trim())
            .filter((name): name is string => name.length > 0)
        )
      );
    }

    if (aesthetics !== undefined) {
      updatedRequirements.aesthetics = Array.from(
        new Set(
          (aesthetics ?? [])
            .map((item) => item.trim())
            .filter((item): item is string => item.length > 0)
        )
      );
    }

    if (mood !== undefined) {
      updatedRequirements.mood = mood?.trim() || null;
    }

    agent.updateUserRequirements(updatedRequirements);

    return {
      success: true,
      user_requirements: agent.state.userRequirements
    };
  }
});

const textSearchEventsSchema = z.object({
  searchQuery: z.string().trim().optional(),
  searchLimit: z.number().int().min(1).max(20).optional(),
});

const searchEventsByText = tool({
  description:
    "Search for events by title or artist name using full-text search. Returns summary list for AI analysis. Stores results in state for show_recommendations to display as cards.",
  inputSchema: textSearchEventsSchema,
  execute: async ({
    searchQuery,
    searchLimit,
  }) => {
    console.log("[search_events_by_text] Function called");
    const startTime = performance.now();
    console.log("[search_events_by_text] Starting query:", {
      searchQuery,
      searchLimit: searchLimit ?? 10,
    });

    const { agent } = getCurrentAgent<Zine>();
    if (!agent) {
      console.error('[search_events_by_text] Agent not available');
      throw new Error("Agent not available");
    }

    const env = agent.getEnv();
    const supabase = getServiceClient(env);

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("text_search_events", {
      search_query: searchQuery || null,
      search_limit: searchLimit ?? 10,
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[search_events_by_text] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[search_events_by_text] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[search_events_by_text] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms)`);
    console.log(`[search_events_by_text] Found ${data.length} events:`,
      data.map((e, i) => `[${i}] ${e.title}${e.artists?.length ? ` - ${e.artists.join(', ')}` : ''}`));

    // Convert to EventMatchItem format with similarity
    const eventsWithSimilarity = data.map(item => ({
      ...item,
      gallery: item.gallery as any, // Json type from DB
      occurrences: item.occurrences as any, // Json type from DB
      similarity: 1.0, // Text search doesn't have similarity scores
    }));

    agent.storeSearchResults(eventsWithSimilarity, []);
    const currentState = agent.getSearchResults();
    console.log(`[search_events_by_text] State after storing: ${currentState?.events.length || 0} events, ${currentState?.galleries.length || 0} galleries`);

    // Return simple summary for AI
    return {
      found: data.length,
      events: data.map((e, i) => ({
        index: i,
        title: e.title,
        description: e.description || "",
        artists: e.artists || [],
        tags: e.tags || [],
        start_at: e.start_at || "",
        end_at: e.end_at || ""
      }))
    };
  }
});

const textSearchGalleriesSchema = z.object({
  searchQuery: z.string().trim().optional(),
  filterDistrict: districtInputSchema,
  searchLimit: z.number().int().min(1).max(20).optional(),
});

const searchGalleriesByText = tool({
  description:
    "Search for galleries by name or filter by district using full-text search. Returns summary list for AI analysis. Stores results in state for show_recommendations to display as cards.",
  inputSchema: textSearchGalleriesSchema,
  execute: async ({
    searchQuery,
    filterDistrict,
    searchLimit,
  }) => {
    console.log("[search_galleries_by_text] Function called");
    const startTime = performance.now();
    console.log("[search_galleries_by_text] Starting query:", {
      searchQuery,
      filterDistrict,
      searchLimit: searchLimit ?? 10,
    });

    const { agent } = getCurrentAgent<Zine>();
    if (!agent) {
      console.error('[search_galleries_by_text] Agent not available');
      throw new Error("Agent not available");
    }

    const env = agent.getEnv();
    const supabase = getServiceClient(env);

    // Normalize district if provided
    let normalizedDistrict: string | null = null;
    if (filterDistrict) {
      const normalized = filterDistrict.trim().toLowerCase();
      normalizedDistrict =
        galleryDistrictValues.find(
          (value) => value.toLowerCase() === normalized
        ) ?? null;
    }

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("text_search_galleries", {
      search_query: searchQuery || null,
      filter_district: normalizedDistrict,
      search_limit: searchLimit ?? 10,
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[search_galleries_by_text] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[search_galleries_by_text] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[search_galleries_by_text] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms)`);
    console.log(`[search_galleries_by_text] Found ${data.length} galleries:`,
      data.map((g, i) => `[${i}] ${g.name} in ${g.district}`));

    // Convert to GalleryMatchItem format with similarity
    const galleriesWithSimilarity = data.map(item => ({
      ...item,
      similarity: 1.0, // Text search doesn't have similarity scores
    }));

    agent.storeSearchResults([], galleriesWithSimilarity);
    const currentState = agent.getSearchResults();
    console.log(`[search_galleries_by_text] State after storing: ${currentState?.events.length || 0} events, ${currentState?.galleries.length || 0} galleries`);

    // Return simple summary for AI
    return {
      found: data.length,
      galleries: data.map((g, i) => ({
        index: i,
        name: g.name,
        about: g.about || "",
        district: g.district,
        address: g.address || "",
        tags: g.tags || []
      }))
    };
  }
});

const showRecommendationsSchema = z.object({
  eventIndices: z.array(z.number().int().min(0)).optional().describe("Array of indices (0-based) of events to display from the last search results"),
  galleryIndices: z.array(z.number().int().min(0)).optional().describe("Array of indices (0-based) of galleries to display from the last search results"),
  userContext: z.string().optional().describe("Description of why these recommendations match user preferences"),
});

const showRecommendations = tool({
  description:
    "Display specific search results as recommendation cards. Call this AFTER you've analyzed results from search tools (search_events_by_text, search_galleries_by_text, match_event, match_gallery). Provide indices of items you want to show (e.g., eventIndices: [0, 2, 5] to show the 1st, 3rd, and 6th events). You MUST provide personalized commentary in your response explaining why each recommendation matches the user.",
  inputSchema: showRecommendationsSchema,
  execute: async ({
    eventIndices,
    galleryIndices,
    userContext,
  }): Promise<EventToolResult | GalleryToolResult | CombinedToolResult> => {
    console.log("[show_recommendations] Function called");
    console.log("[show_recommendations] Input:", {
      eventIndices,
      galleryIndices,
      userContext,
    });

    const { agent } = getCurrentAgent<Zine>();
    if (!agent) {
      console.error('[show_recommendations] Agent not available');
      throw new Error("Agent not available");
    }

    const storedResults = agent.getSearchResults();

    if (!storedResults) {
      console.log("[show_recommendations] No stored search results found");
      return {
        type: "event-results",
        query: "no results",
        items: [],
      };
    }

    console.log(`[show_recommendations] State has ${storedResults.events.length} events, ${storedResults.galleries.length} galleries`);

    const hasEventIndices = eventIndices && eventIndices.length > 0;
    const hasGalleryIndices = galleryIndices && galleryIndices.length > 0;

    // If both types of indices provided, return combined result
    if (hasEventIndices && hasGalleryIndices) {
      const selectedEvents = eventIndices!
        .filter(idx => idx < storedResults.events.length)
        .map(idx => storedResults.events[idx]);

      const selectedGalleries = galleryIndices!
        .filter(idx => idx < storedResults.galleries.length)
        .map(idx => storedResults.galleries[idx]);

      console.log(`[show_recommendations] Displaying ${selectedEvents.length} events and ${selectedGalleries.length} galleries`);
      console.log(`  Events:`, selectedEvents.map((e, i) => `[${eventIndices![i]}] ${e.title}`));
      console.log(`  Galleries:`, selectedGalleries.map((g, i) => `[${galleryIndices![i]}] ${g.name}`));

      return {
        type: "combined-results",
        query: userContext || "recommendations",
        events: selectedEvents,
        galleries: selectedGalleries,
      } satisfies CombinedToolResult;
    }

    // Select events by indices only
    if (hasEventIndices) {
      const selectedEvents = eventIndices!
        .filter(idx => idx < storedResults.events.length)
        .map(idx => storedResults.events[idx]);

      console.log(`[show_recommendations] Displaying ${selectedEvents.length} events:`,
        selectedEvents.map((e, i) => `[${eventIndices![i]}] ${e.title} at ${e.gallery?.name}`));

      return {
        type: "event-results",
        query: userContext || "recommendations",
        items: selectedEvents,
      } satisfies EventToolResult;
    }

    // Select galleries by indices only
    if (hasGalleryIndices) {
      const selectedGalleries = galleryIndices!
        .filter(idx => idx < storedResults.galleries.length)
        .map(idx => storedResults.galleries[idx]);

      console.log(`[show_recommendations] Displaying ${selectedGalleries.length} galleries:`,
        selectedGalleries.map((g, i) => `[${galleryIndices![i]}] ${g.name} in ${g.district}`));

      return {
        type: "gallery-results",
        query: userContext || "recommendations",
        items: selectedGalleries,
      } satisfies GalleryToolResult;
    }

    // If no indices provided, return empty
    console.log("[show_recommendations] No indices provided");
    return {
      type: "event-results",
      query: "no results",
      items: [],
    };
  }
});

export const tools = {
  match_gallery: matchGallery,
  match_event: matchEvent,
  search_events_by_text: searchEventsByText,
  search_galleries_by_text: searchGalleriesByText,
  show_recommendations: showRecommendations,
  update_user_requirements: updateUserRequirements
} satisfies ToolSet;

export const executions = {} as const;
