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

const timePreferencesSchema = z.object({
  months: z.array(z.string().trim().min(1)).nullish(),
  weeks: z.array(z.string().trim().min(1)).nullish(),
  dayPeriods: z
    .array(
      z.enum(["morning", "noon", "afternoon", "evening", "night"] as const)
    )
    .nullish(),
  specificHours: z.array(z.string().trim().min(1)).nullish()
});

const districtInputSchema = z
  .union([districtEnum, z.string().trim().min(1)])
  .nullish();

const updateRequirementsSchema = z.object({
  district: districtInputSchema,
  artists: z.array(z.string().trim().min(1)).nullish(),
  aesthetics: z.array(z.string().trim().min(1)).nullish(),
  mood: z.string().trim().min(1).nullish(),
  time: timePreferencesSchema.nullish()
});

function enforceEnv(): RequiredEnv {
  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase configuration is missing");
  }
  return {
    OPENAI_API_KEY: openaiKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey
  };
}

const matchGallery = tool({
  description:
    "FALLBACK ONLY: Use this tool only when match_event returns no results or very few results. Find galleries similar to a query using vector search. Gallery results should be mentioned in your text response with explanations of why they might match the user's request (style, artists, location), but galleries should NOT be displayed as cards. Only events are shown as cards. When suggesting galleries, explain why they could be a good match based on the user's preferences (mood, aesthetics, location, time constraints).",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
    matchThreshold
  }): Promise<GalleryToolResult> => {
    const env = enforceEnv();
    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);
    const vector = await embedder(query);

    if (!vector.length) {
      return { type: "gallery-results", query, items: [] };
    }

    const { data, error } = await supabase.rpc("match_galeries", {
      match_count: matchCount ?? 8,
      match_threshold: matchThreshold ?? 0.6,
      query_embedding: toPgVector(vector)
    });

    if (error) {
      throw new Error(`[match_gallery] ${error.message}`);
    }

    const matches = (data ?? [])
      .map((row) => {
        const galleryId =
          (row as { gallery_id?: string; id?: string }).gallery_id ??
          (row as { id?: string }).id;
        return {
          id: galleryId as string,
          similarity: (row as { similarity?: number }).similarity ?? 0
        };
      })
      .filter((item) => typeof item.id === "string");

    if (!matches.length) {
      return { type: "gallery-results", query, items: [] };
    }

    const galleryIds = matches.map((item) => item.id);

    const { data: galleryRows, error: galleryError } = await supabase
      .from("galleries")
      .select(
        "id, main_url, normalized_main_url, events_page, gallery_info(name, about)"
      )
      .in("id", galleryIds);

    if (galleryError) {
      throw new Error(
        `[match_gallery] fetch galleries failed: ${galleryError.message}`
      );
    }

    const galleryMap = new Map((galleryRows ?? []).map((row) => [row.id, row]));

    const items: GalleryMatchItem[] = [];
    for (const match of matches) {
      const row = galleryMap.get(match.id);
      if (!row) continue;
      const info = (row.gallery_info ?? {}) as {
        name?: string | null;
        about?: string | null;
      };
      items.push({
        id: row.id,
        name: info.name ?? null,
        about: info.about ?? null,
        mainUrl: row.main_url ?? null,
        normalizedMainUrl: row.normalized_main_url ?? null,
        eventsPage: row.events_page ?? null,
        similarity: match.similarity
      });
    }

    return {
      type: "gallery-results",
      query,
      items
    } satisfies GalleryToolResult;
  }
});

const matchEvent = tool({
  description:
    "Find events similar to a query using vector search over event descriptions and metadata. Before searching, ensure the user has provided at least TWO of: time window (today/weekend/month), location (district/area), or interest (mood/style/artist/type). If only one signal is provided, this tool will return guidance for a follow-up question. Call this tool immediately when ready to search - do not generate text before calling it. The tool results will be displayed as cards, and you should add only a brief closing message after cards are shown.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
    matchThreshold
  }): Promise<
    | EventToolResult
    | { type: "guidance"; missingSignals: string[]; suggestedQuestion: string }
  > => {
    // Check signals if agent context is available
    let signalCheck: SignalCheckResult | null = null;
    try {
      const context = getCurrentAgent();
      const agent = context?.agent as { state?: ChatState } | undefined;
      if (agent?.state?.userRequirements) {
        signalCheck = checkSearchSignals(agent.state.userRequirements);
        if (signalCheck.signalCount < 2) {
          return {
            type: "guidance",
            missingSignals: signalCheck.missingSignals,
            suggestedQuestion:
              signalCheck.suggestedQuestion ??
              "Please provide more details about when, where, or what kind of experience you're looking for."
          };
        }
      }
    } catch {
      // Continue without validation if context unavailable
    }

    const env = enforceEnv();
    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);
    const vector = await embedder(query);

    if (!vector.length) {
      // If embedding fails but we have 2+ signals, still try to search with fallback
      return { type: "event-results", query, items: [] };
    }

    const { data, error } = await supabase.rpc("match_events", {
      match_count: matchCount ?? 8,
      match_threshold: matchThreshold ?? 0.6,
      query_embedding: toPgVector(vector)
    });

    if (error) {
      throw new Error(`[match_event] ${error.message}`);
    }

    const matches = (data ?? [])
      .map((row) => {
        const eventId =
          (row as { event_id?: string; id?: string }).event_id ??
          (row as { id?: string }).id;
        return {
          id: eventId as string,
          similarity: (row as { similarity?: number }).similarity ?? 0
        };
      })
      .filter((item) => typeof item.id === "string");

    if (!matches.length) {
      return { type: "event-results", query, items: [] };
    }

    const eventIds = matches.map((item) => item.id);

    const { data: eventsData, error: eventsError } = await supabase
      .from("events")
      .select(
        "id, title, status, start_at, end_at, gallery_id, event_info(description), event_occurrences(id, start_at, end_at, timezone)"
      )
      .in("id", eventIds);

    if (eventsError) {
      throw new Error(
        `[match_event] fetch events failed: ${eventsError.message}`
      );
    }

    const galleryIds = Array.from(
      new Set(
        (eventsData ?? [])
          .map((event) => event.gallery_id)
          .filter((value): value is string => typeof value === "string")
      )
    );

    const { data: galleriesData, error: galleriesError } = await supabase
      .from("galleries")
      .select("id, main_url, normalized_main_url, gallery_info(name)")
      .in("id", galleryIds);

    if (galleriesError) {
      throw new Error(
        `[match_event] fetch galleries failed: ${galleriesError.message}`
      );
    }

    const galleryMap = new Map(
      (galleriesData ?? []).map((row) => [row.id, row])
    );

    const eventMap = new Map((eventsData ?? []).map((row) => [row.id, row]));

    const items: EventMatchItem[] = [];
    for (const match of matches) {
      const event = eventMap.get(match.id);
      if (!event) continue;
      const info = (event.event_info ?? {}) as { description?: string | null };
      const occurrences = Array.isArray(event.event_occurrences)
        ? event.event_occurrences.map((occ) => ({
            id: String(occ.id ?? `${event.id}-${occ.start_at ?? "occ"}`),
            start_at: occ.start_at ?? null,
            end_at: occ.end_at ?? null,
            timezone: occ.timezone ?? null
          }))
        : [];
      const gallery = event.gallery_id
        ? galleryMap.get(event.gallery_id)
        : undefined;
      items.push({
        id: event.id,
        title: event.title ?? "Untitled event",
        status: (event.status as string | null) ?? null,
        startAt: event.start_at ?? null,
        endAt: event.end_at ?? null,
        description: info.description ?? null,
        occurrences,
        gallery: gallery
          ? {
              id: gallery.id,
              name:
                ((gallery.gallery_info ?? {}) as { name?: string | null })
                  .name ?? null,
              mainUrl: gallery.main_url ?? null,
              normalizedMainUrl: gallery.normalized_main_url ?? null
            }
          : null,
        similarity: match.similarity
      });
    }

    return {
      type: "event-results",
      query,
      items
    };
  }
});

const DISTRICT_KEYWORDS: Record<GalleryDistrict, string[]> = {
  Ochota: ["ochota", "rakowiec", "szczesliwice", "szczęśliwice"],
  Srodmiescie: [
    "srodmiescie",
    "środmieście",
    "centrum",
    "city center",
    "downtown",
    "hoza",
    "hoża",
    "nowy świat",
    "plac defilad",
    "powisle",
    "powiśle",
    "plac konstytucji"
  ],
  Wola: [
    "wola",
    "rondo daszynsk",
    "rondo daszyńsk",
    "mirów",
    "mlynarska",
    "przyokopowa"
  ],
  Bemowo: ["bemowo", "gorce", "jelonki", "fort blizne"],
  Mokotow: [
    "mokotow",
    "mokotów",
    "sielce",
    "stegny",
    "sluzew",
    "służew",
    "kazimierzowska"
  ],
  Praga: [
    "praga",
    "saska kepa",
    "saska kępa",
    "kamionek",
    "zoliborz",
    "żoliborz"
  ],
  Zoliborz: ["zoliborz", "żoliborz", "marymont", "plac wilsona"]
};

function inferDistrict(value: string): GalleryDistrict | null {
  const normalized = value.toLowerCase();
  for (const [district, keywords] of Object.entries(DISTRICT_KEYWORDS) as [
    GalleryDistrict,
    string[]
  ][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return district;
    }
  }
  return null;
}

/**
 * Checks if user has provided sufficient signals (2 of 3: time, location, interest)
 * for a reliable event search. Returns guidance if signals are insufficient.
 */
function checkSearchSignals(requirements: UserRequirements): SignalCheckResult {
  const hasTime =
    requirements.time.months.length > 0 ||
    requirements.time.weeks.length > 0 ||
    requirements.time.dayPeriods.length > 0 ||
    requirements.time.specificHours.length > 0;

  const hasLocation = requirements.district !== null;

  const hasInterest =
    requirements.mood !== null ||
    requirements.aesthetics.length > 0 ||
    requirements.artists.length > 0;

  const signalCount = [hasTime, hasLocation, hasInterest].filter(
    Boolean
  ).length;
  const missingSignals: string[] = [];
  let suggestedQuestion: string | null = null;

  if (!hasTime) missingSignals.push("time");
  if (!hasLocation) missingSignals.push("location");
  if (!hasInterest) missingSignals.push("interest");

  // Prioritize follow-up question based on what's missing
  if (!hasTime && signalCount === 1) {
    suggestedQuestion = "When—today, this weekend, or later this month?";
  } else if (!hasLocation && signalCount === 1) {
    suggestedQuestion = "Where should I look—near you or any district?";
  } else if (!hasInterest && signalCount === 1) {
    suggestedQuestion =
      "What vibe—cheerful, quiet, experimental? Or a style you like?";
  } else if (signalCount === 0) {
    suggestedQuestion =
      "Tell me when and where, or what kind of experience you're looking for.";
  }

  return {
    hasTime,
    hasLocation,
    hasInterest,
    signalCount,
    missingSignals,
    suggestedQuestion
  };
}

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
