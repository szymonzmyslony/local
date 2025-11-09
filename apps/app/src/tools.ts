import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";
import { getCurrentAgent } from "agents";
import {
  Constants,
  createEmbedder,
  getServiceClient,
  toPgVector
} from "@shared";
import type {
  GalleryToolResult,
  EventToolResult,
  GalleryMatchItem,
  EventMatchItem
} from "./types/tool-results";
import type {
  ChatState,
  UserRequirements,
  GalleryDistrict,
  TimePreferences,
  SignalCheckResult
} from "./types/chat-state";
import {
  createInitialChatState,
  createInitialUserRequirements,
  createInitialTimePreferences
} from "./types/chat-state";
import type { SavedEventCard } from "./types/chat-state";
import { Zine } from "./server";

const searchInputSchema = z.object({
  query: z.string().trim().min(2, "Query must be at least 2 characters"),
  matchCount: z.number().int().min(1).max(20).optional(),
  matchThreshold: z.number().min(-1).max(1).optional()
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
    "Use this tool when the user wants additional gallery suggestions — either because match_event returned no events or they ask for more options without changing their preferences. Share 1–3 galleries in plain text with a short why-it-fits note. Galleries are never shown as cards.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
    matchThreshold
  }): Promise<GalleryToolResult> => {
    console.log("[match_gallery] Function called");
    const startTime = performance.now();
    console.log("[match_gallery] Starting query:", {
      query,
      matchCount: matchCount ?? 3,
      matchThreshold: matchThreshold ?? 0.6
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
      return { type: "gallery-results", query, items: [] };
    }

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("match_gallery_with_data", {
      match_count: matchCount ?? 3,
      match_threshold: matchThreshold ?? 0.6,
      query_embedding: toPgVector(vector)
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[match_gallery] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[match_gallery] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }


    const totalTime = performance.now() - startTime;
    console.log(`[match_gallery] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms, Embedding: ${embeddingTime.toFixed(2)}ms)`);
    console.log(`[match_gallery] Found ${data.length} galleries:`, data.map(g => ({
      name: g.name,
      similarity: g.similarity.toFixed(3)
    })));

    const result = {
      type: "gallery-results",
      query,
      items: data,
    } satisfies GalleryToolResult;
    return result;
  }
});

const matchEvent = tool({
  description:
    "Find events similar to a query using vector search over event descriptions and metadata. Before searching, ensure the user has provided at least TWO of: time window (today/weekend/month), location (district/area), or interest (mood/style/artist/type). If only one signal is provided, this tool will return guidance for a follow-up question. Call this tool once per assistant turn as soon as you are ready to search. The tool results will be displayed as cards, and you should add only a brief closing message after cards are shown.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
    matchThreshold
  }): Promise<
    | EventToolResult
    | { type: "guidance"; missingSignals: string[]; suggestedQuestion: string }
  > => {
    console.log("[match_event] Function called");

    const { agent } = getCurrentAgent<Zine>();
    if (!agent) {
      console.error('[executeJudgeConcept] Agent not available');
      throw new Error("Agent not available");
    }


    const env = agent.getEnv();



    const startTime = performance.now();
    console.log("[match_event] Starting query:", {
      query,
      matchCount: matchCount ?? 5,
      matchThreshold: matchThreshold ?? 0.6
    });

    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    const embeddingStart = performance.now();
    const vector = await embedder(query);
    const embeddingTime = performance.now() - embeddingStart;
    console.log(`[match_event] Embedding generated in ${embeddingTime.toFixed(2)}ms`);

    if (!vector.length) {
      // If embedding fails but we have 2+ signals, still try to search with fallback
      return { type: "event-results", query, items: [] };
    }

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("match_events_with_data", {
      match_count: matchCount ?? 5,
      match_threshold: matchThreshold ?? 0.6,
      query_embedding: toPgVector(vector)
    });
    const dbTime = performance.now() - dbStart;

    if (error) {
      console.error("[match_event] Full error:", JSON.stringify(error, null, 2));
      throw new Error(`[match_event] ${error.message} | Details: ${error.details} | Hint: ${error.hint} | Code: ${error.code}`);
    }



    const totalTime = performance.now() - startTime;
    console.log(`[match_event] Query completed in ${totalTime.toFixed(2)}ms (DB: ${dbTime.toFixed(2)}ms, Embedding: ${embeddingTime.toFixed(2)}ms)`);
    console.log(`[match_event] Found ${data.length} events:`, data.map(e => ({
      title: e.title,
      gallery: e.gallery?.name,
      occurrences: e.occurrences.length,
      similarity: e.similarity.toFixed(3)
    })));

    const result = {
      type: "event-results",
      query,
      items: data,
    } satisfies EventToolResult;
    return result;
  }
});





const updateUserRequirements = tool({
  description:
    "Update the user's current requirements such as preferred district in Warsaw, desired artists, aesthetics, mood, or time preferences (months, weeks, day periods like morning/evening, or specific hours).",
  inputSchema: updateRequirementsSchema,
  execute: async ({ district, artists, aesthetics, mood, time }) => {
    const context = getCurrentAgent();
    const agent = context?.agent as
      | {
        state?: ChatState;
        initialState?: ChatState;
        setState: (state: ChatState) => void;
      }
      | undefined;

    if (!agent) {
      throw new Error(
        "Agent context is not available for updating requirements"
      );
    }

    const currentState: ChatState = agent.state ?? createInitialChatState();
    const currentRequirements: UserRequirements =
      currentState.userRequirements ?? createInitialUserRequirements();
    const currentTime: TimePreferences =
      currentRequirements.time ?? createInitialTimePreferences();

    const normalizedArtists =
      artists !== undefined
        ? Array.from(
          new Set(
            (artists ?? [])
              .map((name) => name.trim())
              .filter((name): name is string => name.length > 0)
          )
        )
        : undefined;

    const normalizedMood =
      mood !== undefined ? mood?.trim() || null : undefined;

    const normalizedAesthetics =
      aesthetics !== undefined
        ? Array.from(
          new Set(
            (aesthetics ?? [])
              .map((item) => item.trim())
              .filter((item): item is string => item.length > 0)
          )
        )
        : undefined;

    const normalizedTime: TimePreferences | undefined = time
      ? {
        months: Array.from(
          new Set(
            (time.months ?? [])
              .map((value) => value.trim())
              .filter((value): value is string => value.length > 0)
          )
        ),
        weeks: Array.from(
          new Set(
            (time.weeks ?? [])
              .map((value) => value.trim())
              .filter((value): value is string => value.length > 0)
          )
        ),
        dayPeriods: Array.from(
          new Set(
            (time.dayPeriods ?? []).filter(
              (value): value is TimePreferences["dayPeriods"][number] =>
                Boolean(value)
            )
          )
        ),
        specificHours: Array.from(
          new Set(
            (time.specificHours ?? [])
              .map((value) => value.trim())
              .filter((value): value is string => value.length > 0)
          )
        )
      }
      : undefined;

    let inferredDistrict: GalleryDistrict | null | undefined;
    if (district !== undefined) {
      if (district === null) {
        inferredDistrict = null;
      } else if (typeof district === "string") {
        const normalized = district.trim().toLowerCase();
        inferredDistrict =
          galleryDistrictValues.find(
            (value) => value.toLowerCase() === normalized
          ) ?? currentRequirements.district;
      } else {
        inferredDistrict = district;
      }
    }

    const updatedRequirements: UserRequirements = {
      district:
        inferredDistrict !== undefined
          ? inferredDistrict
          : currentRequirements.district,
      artists:
        normalizedArtists !== undefined
          ? normalizedArtists
          : currentRequirements.artists,
      aesthetics:
        normalizedAesthetics !== undefined
          ? normalizedAesthetics
          : currentRequirements.aesthetics,
      mood:
        normalizedMood !== undefined
          ? normalizedMood
          : currentRequirements.mood,
      time: normalizedTime !== undefined ? normalizedTime : currentTime
    };

    agent.setState({
      ...currentState,
      userRequirements: updatedRequirements
    });

    return {
      success: true,
      user_requirements: updatedRequirements
    };
  }
});

const saveToMyZine = tool({
  description:
    "Save an event card to the user's MY ZINE collection for later reference. Use this when the user explicitly asks to save an event to MY ZINE. The user message may contain JSON with eventId and eventData fields - extract and use those directly.",
  inputSchema: z.object({
    eventId: z.string().min(1),
    eventData: z.object({
      id: z.string(),
      title: z.string(),
      status: z.string().nullable(),
      startAt: z.string().nullable(),
      endAt: z.string().nullable(),
      description: z.string().nullable(),
      occurrences: z.array(
        z.object({
          id: z.string(),
          start_at: z.string().nullable(),
          end_at: z.string().nullable(),
          timezone: z.string().nullable()
        })
      ),
      gallery: z
        .object({
          id: z.string(),
          name: z.string().nullable(),
          mainUrl: z.string().nullable(),
          normalizedMainUrl: z.string().nullable()
        })
        .nullable(),
      similarity: z.number()
    })
  }),
  execute: async ({
    eventId,
    eventData
  }): Promise<{ success: boolean; message: string }> => {
    const context = getCurrentAgent();
    const agent = context?.agent as
      | {
        state?: ChatState;
        saveEventToMyZine?: (event: SavedEventCard) => Promise<void>;
      }
      | undefined;

    if (!agent || !agent.saveEventToMyZine) {
      throw new Error("MY ZINE storage is not available");
    }

    const currentState: ChatState = agent.state ?? createInitialChatState();
    const requirements =
      currentState.userRequirements ?? createInitialUserRequirements();

    const eventItem = eventData as EventMatchItem;
    const savedEvent: SavedEventCard = {
      eventId,
      eventName: eventItem.title,
      eventImage: null, // TODO: Add image URL when available in event data
      savedAt: new Date().toISOString(),
      eventData: {
        id: eventItem.id,
        title: eventItem.title,
        description: eventItem.description,
        startAt: eventItem.startAt,
        endAt: eventItem.endAt,
        gallery: eventItem.gallery
          ? {
            id: eventItem.gallery.id,
            name: eventItem.gallery.name,
            mainUrl: eventItem.gallery.mainUrl
          }
          : null
      },
      preferences: {
        district: requirements.district,
        mood: requirements.mood,
        aesthetics: requirements.aesthetics,
        artists: requirements.artists,
        timeWindow:
          requirements.time.weeks.length > 0
            ? requirements.time.weeks[0]
            : requirements.time.months.length > 0
              ? requirements.time.months[0]
              : null
      }
    };

    await agent.saveEventToMyZine(savedEvent);

    return {
      success: true,
      message: `Event "${eventData.title}" saved to MY ZINE`
    };
  }
});

export const tools = {
  match_gallery: matchGallery,
  match_event: matchEvent,
  update_user_requirements: updateUserRequirements,
  save_to_my_zine: saveToMyZine
} satisfies ToolSet;

export const executions = {} as const;
