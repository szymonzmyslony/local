import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  GalleryDataExtractionSchema,
  ClassificationSchema,
  type GalleryDataExtraction,
  EventExtractionSchema,
  ArtistExtractionSchema
} from "../schema";
import { AI_CONFIG } from "../config/ai";

/**
 * Defaults for missing end date (Unix timestamps in seconds):
 * - Exhibitions: +3 months (~90 days)
 * - Others: +2 hours
 */
export function calculateDefaultEnd(start: number, eventType: string): number {
  if (eventType === "exhibition") {
    return start + (90 * 24 * 60 * 60); // 90 days in seconds
  }
  return start + (2 * 60 * 60); // 2 hours in seconds
}

/**
 * Classify pages by content type. Returns pages enriched with classification.
 */
export async function classifyPages<T extends { url: string; markdown: string }>(
  pages: Array<T>,
  currentDate: string
): Promise<Array<T & { classification: string }>> {
  const promises = pages.map(async (page, index) => {
    try {
      const { object } = await generateObject({
        model: openai(AI_CONFIG.CHAT_MODEL),
        schema: ClassificationSchema,
        prompt: `Classify this page from a gallery website.

Current date: ${currentDate}
URL: ${page.url}

CONTENT (first 2000 chars):
${page.markdown.substring(0, 2000)}

CLASSIFICATION TYPES:
- "event": Current or upcoming events
- "historical_event": Past events
- "creator_info": Gallery info, mission, contact
- "artists": Artist bios, portfolios
- "other": News, press, general info`
      });

      return { ...page, classification: object.classification };
    } catch (error) {
      console.error("[ai] classifyPages error for page", {
        index,
        url: page.url,
        markdownLength: page.markdown.length,
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error
      });
      // Continue processing other pages, fallback to "other"
      return { ...page, classification: "other" };
    }
  });

  return await Promise.all(promises);
}

/**
 * Extract ONLY gallery info from creator_info pages
 */
const GalleryInfoOnlySchema = z.object({
  gallery: z.object({
    name: z.string(),
    website: z.string().url(),
    galleryType: z.enum(["commercial", "non-profit", "museum", "artist-run", "project-space"]).nullable(),
    city: z.string(),
    neighborhood: z.string().nullable(),
    tz: z.string().default("Europe/Warsaw")
  })
});

export async function extractGalleryInfoOnly(
  pages: Array<{ url: string; markdown: string }>,
  currentDate: string
): Promise<{ name: string; website: string; galleryType: "commercial" | "non-profit" | "museum" | "artist-run" | "project-space" | null; city: string; neighborhood: string | null; tz: string }> {
  const fullContent = pages.map((p) => `=== ${p.url} ===\n${p.markdown}`).join("\n\n");
  const startTime = Date.now();

  console.log("[ai] extractGalleryInfoOnly start", {
    model: AI_CONFIG.CHAT_MODEL,
    pagesCount: pages.length,
    contentLength: fullContent.length
  });

  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: GalleryInfoOnlySchema,
      prompt: `Extract gallery information from these creator/about pages.

Current date (ISO): ${currentDate}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}

REQUIREMENTS:
1) Extract ONLY gallery basic info: name, website URL, gallery type, city, neighborhood, timezone.
2) Do NOT extract events or artists.
3) Use the gallery types from the provided enum only.`
    });

    const duration = Date.now() - startTime;
    console.log("[ai] extractGalleryInfoOnly success", {
      duration: `${duration}ms`,
      name: object.gallery.name
    });

    return object.gallery;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[ai] extractGalleryInfoOnly error", {
      pagesCount: pages.length,
      duration: `${duration}ms`,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
    throw error;
  }
}

/**
 * Extract ONLY artists from artist pages
 */
const ArtistsOnlySchema = z.object({
  artists: z.array(ArtistExtractionSchema)
});

export async function extractArtistsOnly(
  pages: Array<{ url: string; markdown: string }>,
  currentDate: string
): Promise<Array<{ name: string; bio?: string; website?: string }>> {
  const fullContent = pages.map((p) => `=== ${p.url} ===\n${p.markdown}`).join("\n\n");
  const startTime = Date.now();

  console.log("[ai] extractArtistsOnly start", {
    model: AI_CONFIG.CHAT_MODEL,
    pagesCount: pages.length,
    contentLength: fullContent.length
  });

  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: ArtistsOnlySchema,
      prompt: `Extract artist information from these artist pages.

Current date (ISO): ${currentDate}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}

REQUIREMENTS:
1) Extract ONLY artists: name, bio, website URL.
2) Do NOT extract events or gallery info.
3) Include all artists mentioned across these pages.`
    });

    const duration = Date.now() - startTime;
    console.log("[ai] extractArtistsOnly success", {
      duration: `${duration}ms`,
      count: object.artists.length
    });

    return object.artists;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[ai] extractArtistsOnly error", {
      pagesCount: pages.length,
      duration: `${duration}ms`,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
    throw error;
  }
}

/**
 * Extract ONLY events from event pages
 */
const EventsOnlySchema = z.object({
  events: z.array(EventExtractionSchema)
});

export async function extractEventsOnly(
  pages: Array<{ url: string; markdown: string }>,
  currentTimestamp: number
): Promise<Array<z.infer<typeof EventExtractionSchema>>> {
  const fullContent = pages.map((p) => `=== ${p.url} ===\n${p.markdown}`).join("\n\n");
  const startTime = Date.now();

  console.log("[ai] extractEventsOnly start", {
    model: AI_CONFIG.CHAT_MODEL,
    pagesCount: pages.length,
    contentLength: fullContent.length,
    currentTimestamp
  });

  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: EventsOnlySchema,
      prompt: `Extract event information from these event pages.

Current timestamp (Unix, seconds): ${currentTimestamp}
Current date for reference: ${new Date(currentTimestamp * 1000).toISOString()}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}

CRITICAL DATE FORMAT REQUIREMENTS:
- ALL dates MUST be Unix timestamps in SECONDS (not milliseconds)
- Example: 1729764000 (not 1729764000000)
- To convert: take date and convert to seconds since January 1, 1970 UTC
- Example conversions:
  * "October 24, 2024 10:00 AM CET" → 1729764000
  * "December 31, 2024" → 1735689600
- If time is not specified, use noon (12:00) of that day
- If timezone is not specified, assume Europe/Warsaw timezone

EXTRACTION REQUIREMENTS:
1) Extract ONLY current/upcoming events (end >= currentTimestamp)
2) For each event:
   - start: Unix timestamp in SECONDS
   - end: Unix timestamp in SECONDS (leave empty if not mentioned)
   - artistNames: EXACT artist names mentioned
   - price: default to 0 if not mentioned
3) Use event types and categories from the provided enums only
4) Do NOT extract gallery info or standalone artist bios`
    });

    const duration = Date.now() - startTime;
    console.log("[ai] extractEventsOnly success", {
      duration: `${duration}ms`,
      count: object.events.length
    });

    return object.events;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[ai] extractEventsOnly error", {
      pagesCount: pages.length,
      pageUrls: pages.map(p => p.url),
      duration: `${duration}ms`,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
    throw error;
  }
}

/**
 * Multi-page extractor (LEGACY - kept for gallery info extraction).
 * Extract gallery metadata from multiple pages.
 */
export async function extractGalleryData(
  allPages: Array<{ url: string; markdown: string }>,
  currentDate: string
): Promise<GalleryDataExtraction> {
  const fullContent = allPages.map((p) => `=== ${p.url} ===\n${p.markdown}`).join("\n\n");
  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: GalleryDataExtractionSchema,
      prompt: `You are extracting structured data from a gallery site.

Current date (ISO): ${currentDate}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}

REQUIREMENTS:
1) Extract gallery info.
2) Extract artists (include aliases if mentioned; add artist.sourceUrl = the most relevant page URL).
3) Extract all current/upcoming events (end >= currentDate).
   - For each event:
     • Include event.sourceUrl: pick the single page URL where the info is stated most clearly.
     • Use artistNames with EXACT artist names you produced.
     • If end is missing, leave it empty (we will default).
4) Prefer the gallery's own pages; avoid external press unless there is no gallery page and it's clearly about a concrete event at this gallery.
5) Prices: default to 0 if not mentioned.
6) Use categories/types from the provided enums only.`
    });

    return object;
  } catch (error) {
    console.error("[ai] extractGalleryData error", {
      pagesCount: allPages.length,
      urls: allPages.map(p => p.url),
      contentLength: fullContent.length,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
    throw error;
  }
}