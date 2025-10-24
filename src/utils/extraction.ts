import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  GalleryExtractionSchema,
  EventExtractionSchema,
  ArtistExtractionSchema,
  type PageClassification,
  type GalleryType,
  PageClassificationSchema,
  type EventExtraction,
} from "../schema";
import { AI_CONFIG } from "../config/ai";

/**
 * Classify pages by content type. Returns pages enriched with classification.
 */
export async function classifyPages<T extends { url: string; markdown: string }>(
  pages: Array<T>,
  currentDate: string
): Promise<Array<T & { classification: PageClassification }>> {
  const promises: Array<Promise<T & { classification: PageClassification }>> = pages.map(async (page, index) => {
    try {
      const { object } = await generateObject({
        model: openai(AI_CONFIG.CHAT_MODEL),
        schema: z.object({ classification: PageClassificationSchema }),
        prompt: `Classify this page from a gallery website.

Current date: ${currentDate}
URL: ${page.url}

CONTENT (first 2000 chars):
${page.markdown.substring(0, 2000)}

CLASSIFICATION TYPES:
- "event": A SINGLE current or upcoming event page
- "historical_event": A SINGLE past event page
- "multiple_events": Event calendar/listings with MULTIPLE events
- "creator_info": Gallery info, mission, contact, about pages, general information
- "artists": Artist bios, portfolios
- "other": News, press releases, blog posts

IMPORTANT: If a page contains multiple events (calendar, schedule, event list), use "multiple_events" NOT "event".`
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
      return { ...page, classification: "other" as PageClassification };
    }
  });

  return await Promise.all(promises);
}



export async function extractGalleryInfoOnly(
  pages: Array<{ url: string; markdown: string }>,
  currentDate: string
): Promise<{ name: string; website: string; galleryType: GalleryType; city: string; tz: string }> {
  const fullContent = pages.map((p) => `=== ${p.url} ===\n${p.markdown}`).join("\n\n");

  console.log("[ai] extractGalleryInfoOnly start", {
    model: AI_CONFIG.CHAT_MODEL,
    pagesCount: pages.length,
    contentLength: fullContent.length
  });

  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: GalleryExtractionSchema,
      prompt: `Extract gallery information from these creator/about pages.

Current date (ISO): ${currentDate}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}

REQUIREMENTS:
1) Extract ONLY gallery basic info: name, website URL, gallery type, city, neighborhood, timezone.
2) Do NOT extract events or artists.
3) Use the gallery types from the provided enum only.`
    });

    console.log("[ai] extractGalleryInfoOnly success", {
      name: object.name
    });

    return object;
  } catch (error) {
    console.error("[ai] extractGalleryInfoOnly error", {
      pagesCount: pages.length,
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
 * Extract a single event from an event page
 */
export async function extractEventOnly(
  page: { url: string; markdown: string },
  currentTimestamp: number
): Promise<EventExtraction> {
  const startTime = Date.now();

  console.log("[ai] extractEventOnly start", {
    model: AI_CONFIG.CHAT_MODEL,
    url: page.url,
    contentLength: page.markdown.length,
    currentTimestamp
  });

  try {
    const { object } = await generateObject({
      model: openai(AI_CONFIG.CHAT_MODEL),
      schema: EventExtractionSchema,
      prompt: `Extract event information from this event page. This page should contain information about a SINGLE event.

Current timestamp (Unix, seconds): ${currentTimestamp}
Current date for reference: ${new Date(currentTimestamp * 1000).toISOString()}

Page URL: ${page.url}

CONTENT:
${page.markdown}

IMPORTANT:
- Extract information for ONE event only
- eventType must be one of: "opening", "reception", "talk", "workshop", "exhibition"
- category must be one of: "contemporary", "modern", "photography", "design_architecture", "digital_new_media", "performance_live_art", "social_critical_art", "emerging_artists"
- start and end are Unix timestamps in seconds (optional)
- artistNames should be an array of artist names (defaults to empty array if none)
`
    });

    const duration = Date.now() - startTime;
    console.log("[ai] extractEventOnly success", {
      duration: `${duration}ms`,
      url: page.url,
      title: object.title
    });

    return object;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Try to extract raw response for debugging
    let rawResponse = "Unable to capture raw response";
    if (error && typeof error === "object" && "cause" in error) {
      const cause = (error as any).cause;
      if (cause && typeof cause === "object") {
        rawResponse = JSON.stringify(cause, null, 2);
      }
    }

    console.error("[ai] extractEventOnly error", {
      url: page.url,
      contentLength: page.markdown.length,
      duration: `${duration}ms`,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error,
      rawResponse
    });
    throw error;
  }
}

