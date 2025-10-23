import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  GalleryDataExtractionSchema,
  type GalleryDataExtraction
} from "../schema";
import { AI_CONFIG } from "../config/ai";

/**
 * Calculate default end time when not provided
 * - Talks/workshops/openings: +2 hours
 * - Exhibitions: +3 months (typical exhibition duration)
 */
export function calculateDefaultEnd(start: string, eventType: string): string {
  const startDate = new Date(start);

  if (eventType === "exhibition") {
    // Exhibitions typically run for months
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 3);
    return endDate.toISOString();
  }

  // Openings, receptions, talks, workshops: +2 hours
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  return endDate.toISOString();
}

/**
 * Extract all gallery data (gallery info + events + artists) in a single LLM call
 *
 * @param allPages - All crawled pages with markdown content
 * @param currentDate - Current date in ISO format for filtering past events
 * @returns Complete gallery data extraction
 */
export async function extractGalleryData(
  allPages: Array<{ url: string; markdown: string }>,
  currentDate: string
): Promise<GalleryDataExtraction> {
  // Concatenate ALL markdown from all pages
  const fullContent = allPages
    .map((p) => `=== ${p.url} ===\n${p.markdown}`)
    .join("\n\n");

  console.log(
    `[extractGalleryData] Processing ${allPages.length} pages, total content length: ${fullContent.length} chars`
  );

  const { object } = await generateObject({
    model: openai(AI_CONFIG.CHAT_MODEL),
    schema: GalleryDataExtractionSchema,
    prompt: `Extract complete information from this gallery website.

Current date: ${currentDate}

INSTRUCTIONS:
1. Extract gallery information (name, location, type, etc.)
2. Extract ALL artists mentioned anywhere on the site (with bios and websites if available)
3. Extract ALL upcoming or current events (skip events that have already ended)
   - For each event, reference artists by their exact names from the artists array
   - Include exhibitions, openings, receptions, talks, workshops

IMPORTANT:
- Only extract events with end dates >= current date
- Use consistent artist names across events and artist list
- If event doesn't have explicit end date, leave it empty (we'll calculate default)
- Default price to 0 if free or not mentioned

Complete website content:
${fullContent}`
  });

  console.log(
    `[extractGalleryData] Extracted: gallery="${object.gallery.name}", ${object.events.length} events, ${object.artists.length} artists`
  );

  return object;
}
