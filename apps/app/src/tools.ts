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
  EventToolResult
} from "./types/tool-results";
import type {
  UserRequirements,
  GalleryDistrict
} from "./types/chat-state";
import { Zine } from "./server";

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
    "Use this tool when the user wants additional gallery suggestions — either because match_event returned no events or they ask for more options without changing their preferences. Share 1–3 galleries in plain text with a short why-it-fits note. Galleries are never shown as cards.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    matchCount,
  }): Promise<GalleryToolResult> => {
    console.log("[match_gallery] Function called");
    const startTime = performance.now();
    console.log("[match_gallery] Starting query:", {
      query,
      matchCount: matchCount ?? 3,
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
    });

    const supabase = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    const embeddingStart = performance.now();
    const vector = await embedder(query);
    const embeddingTime = performance.now() - embeddingStart;
    console.log(`[match_event] Embedding generated in ${embeddingTime.toFixed(2)}ms`);

 

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("match_events_with_data", {
      match_count: matchCount ?? 5,
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

export const tools = {
  match_gallery: matchGallery,
  match_event: matchEvent,
  update_user_requirements: updateUserRequirements
} satisfies ToolSet;

export const executions = {} as const;
