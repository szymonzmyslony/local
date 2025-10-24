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
 * Extract ONLY events from event pages
 */
const EventsOnlySchema = z.object({
  events: z.array(EventExtractionSchema)
});

export async function extractEventsOnly(
  pages: Array<{ url: string; markdown: string }>,
  currentTimestamp: number
): Promise<Array<EventExtraction>> {
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
      prompt: `Extract events information from these event pages.

Current timestamp (Unix, seconds): ${currentTimestamp}
Current date for reference: ${new Date(currentTimestamp * 1000).toISOString()}

CONTENT (multiple pages; each section starts with "=== URL ==="):
${fullContent}
`
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

