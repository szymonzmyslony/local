import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";
import { getCurrentAgent } from "agents";
import { Constants, createEmbedder, getServiceClient, toPgVector } from "@shared";
import type { GalleryToolResult, EventToolResult, GalleryMatchItem, EventMatchItem } from "./types/tool-results";
import type { ChatState, UserRequirements, GalleryDistrict, TimePreferences } from "./types/chat-state";
import { createInitialChatState, createInitialUserRequirements, createInitialTimePreferences } from "./types/chat-state";

const searchInputSchema = z.object({
  query: z.string().trim().min(2, "Query must be at least 2 characters"),
  matchCount: z.number().int().min(1).max(20).optional(),
  matchThreshold: z.number().min(-1).max(1).optional()
});

type RequiredEnv = Pick<Env, "OPENAI_API_KEY" | "SUPABASE_URL" | "SUPABASE_ANON_KEY">;

const galleryDistrictValues = Constants.public.Enums.gallery_district;
const galleryDistrictTuple = galleryDistrictValues as unknown as [GalleryDistrict, ...GalleryDistrict[]];
const districtEnum = z.enum(galleryDistrictTuple);

const timePreferencesSchema = z.object({
  months: z.array(z.string().trim().min(1)).nullish(),
  weeks: z.array(z.string().trim().min(1)).nullish(),
  dayPeriods: z.array(z.enum(["morning", "noon", "afternoon", "evening", "night"] as const)).nullish(),
  specificHours: z.array(z.string().trim().min(1)).nullish()
});

const districtInputSchema = z.union([districtEnum, z.string().trim().min(1)]).nullish();

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
  description: "Find galleries similar to a free-form query using vector search over gallery info.",
  inputSchema: searchInputSchema,
  execute: async ({ query, matchCount, matchThreshold }): Promise<GalleryToolResult> => {
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

    const matches = (data ?? []).map((row) => {
      const galleryId = (row as { gallery_id?: string; id?: string }).gallery_id ?? (row as { id?: string }).id;
      return {
        id: galleryId as string,
        similarity: (row as { similarity?: number }).similarity ?? 0
      };
    }).filter((item) => typeof item.id === "string");

    if (!matches.length) {
      return { type: "gallery-results", query, items: [] };
    }

    const galleryIds = matches.map((item) => item.id);

    const { data: galleryRows, error: galleryError } = await supabase
      .from("galleries")
      .select("id, main_url, normalized_main_url, events_page, gallery_info(name, about)")
      .in("id", galleryIds);

    if (galleryError) {
      throw new Error(`[match_gallery] fetch galleries failed: ${galleryError.message}`);
    }

    const galleryMap = new Map(
      (galleryRows ?? []).map((row) => [row.id, row])
    );

    const items: GalleryMatchItem[] = [];
    for (const match of matches) {
      const row = galleryMap.get(match.id);
      if (!row) continue;
      const info = (row.gallery_info ?? {}) as { name?: string | null; about?: string | null };
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
  description: "Find events similar to a query using vector search over event descriptions and metadata.",
  inputSchema: searchInputSchema,
  execute: async ({ query, matchCount, matchThreshold }): Promise<EventToolResult> => {
    const env = enforceEnv();
    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);
    const vector = await embedder(query);

    if (!vector.length) {
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

    const matches = (data ?? []).map((row) => {
      const eventId = (row as { event_id?: string; id?: string }).event_id ?? (row as { id?: string }).id;
      return {
        id: eventId as string,
        similarity: (row as { similarity?: number }).similarity ?? 0
      };
    }).filter((item) => typeof item.id === "string");

    if (!matches.length) {
      return { type: "event-results", query, items: [] };
    }

    const eventIds = matches.map((item) => item.id);

    const { data: eventsData, error: eventsError } = await supabase
      .from("events")
      .select("id, title, status, start_at, end_at, gallery_id, event_info(description), event_occurrences(id, start_at, end_at, timezone)")
      .in("id", eventIds);

    if (eventsError) {
      throw new Error(`[match_event] fetch events failed: ${eventsError.message}`);
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
      throw new Error(`[match_event] fetch galleries failed: ${galleriesError.message}`);
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
      const gallery = event.gallery_id ? galleryMap.get(event.gallery_id) : undefined;
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
              name: ((gallery.gallery_info ?? {}) as { name?: string | null }).name ?? null,
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
    } satisfies EventToolResult;
  }
});

const DISTRICT_KEYWORDS: Record<GalleryDistrict, string[]> = {
  Ochota: ["ochota", "rakowiec", "szczesliwice", "szczęśliwice"],
  Srodmiescie: ["srodmiescie", "środmieście", "centrum", "city center", "downtown", "hoza", "hoża", "nowy świat", "plac defilad", "powisle", "powiśle", "plac konstytucji"],
  Wola: ["wola", "rondo daszynsk", "rondo daszyńsk", "mirów", "mlynarska", "przyokopowa"],
  Bemowo: ["bemowo", "gorce", "jelonki", "fort blizne"],
  Mokotow: ["mokotow", "mokotów", "sielce", "stegny", "sluzew", "służew", "kazimierzowska"],
  Praga: ["praga", "saska kepa", "saska kępa", "kamionek", "zoliborz", "żoliborz"],
  Zoliborz: ["zoliborz", "żoliborz", "marymont", "plac wilsona"]
};

function inferDistrict(value: string): GalleryDistrict | null {
  const normalized = value.toLowerCase();
  for (const [district, keywords] of Object.entries(DISTRICT_KEYWORDS) as [GalleryDistrict, string[]][]) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return district;
    }
  }
  return null;
}

const updateUserRequirements = tool({
  description: "Update the user's current requirements such as preferred district in Warsaw, desired artists, aesthetics, mood, or time preferences (months, weeks, day periods like morning/evening, or specific hours).",
  inputSchema: updateRequirementsSchema,
  execute: async ({ district, artists, aesthetics, mood, time }) => {
    const context = getCurrentAgent();
    const agent = context?.agent as { state?: ChatState; initialState?: ChatState; setState: (state: ChatState) => void } | undefined;

    if (!agent) {
      throw new Error("Agent context is not available for updating requirements");
    }

    const currentState: ChatState = agent.state ?? createInitialChatState();
    const currentRequirements: UserRequirements = currentState.userRequirements ?? createInitialUserRequirements();
    const currentTime: TimePreferences = currentRequirements.time ?? createInitialTimePreferences();

    const normalizedArtists = artists !== undefined
      ? Array.from(new Set((artists ?? []).map((name) => name.trim()).filter((name): name is string => name.length > 0)))
      : undefined;

    const normalizedMood = mood !== undefined ? (mood?.trim() || null) : undefined;

    const normalizedAesthetics = aesthetics !== undefined
      ? Array.from(new Set((aesthetics ?? []).map((item) => item.trim()).filter((item): item is string => item.length > 0)))
      : undefined;

    const normalizedTime: TimePreferences | undefined = time
      ? {
          months: Array.from(new Set((time.months ?? []).map((value) => value.trim()).filter((value): value is string => value.length > 0))),
          weeks: Array.from(new Set((time.weeks ?? []).map((value) => value.trim()).filter((value): value is string => value.length > 0))),
          dayPeriods: Array.from(new Set((time.dayPeriods ?? []).filter((value): value is TimePreferences["dayPeriods"][number] => Boolean(value)))),
          specificHours: Array.from(new Set((time.specificHours ?? []).map((value) => value.trim()).filter((value): value is string => value.length > 0)))
        }
      : undefined;

    let inferredDistrict: GalleryDistrict | null | undefined;
    if (district !== undefined) {
      if (district === null) {
        inferredDistrict = null;
      } else if (typeof district === "string") {
        const normalized = district.trim().toLowerCase();
        inferredDistrict = galleryDistrictValues.find(value => value.toLowerCase() === normalized) ?? currentRequirements.district;
      } else {
        inferredDistrict = district;
      }
    }

    const updatedRequirements: UserRequirements = {
      district: inferredDistrict !== undefined ? inferredDistrict : currentRequirements.district,
      artists: normalizedArtists !== undefined ? normalizedArtists : currentRequirements.artists,
      aesthetics: normalizedAesthetics !== undefined ? normalizedAesthetics : currentRequirements.aesthetics,
      mood: normalizedMood !== undefined ? normalizedMood : currentRequirements.mood,
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

export const tools = {
  match_gallery: matchGallery,
  match_event: matchEvent,
  update_user_requirements: updateUserRequirements
} satisfies ToolSet;

export const executions = {} as const;
