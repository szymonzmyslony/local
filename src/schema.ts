import { z } from "zod";
import type { Tables } from "./types/database_types";
import { Constants } from "./types/database_types";


/**
 * Enum constants for Zod and runtime use
 */
export const GalleryTypeSchema = z.enum(Constants.public.Enums.gallery_type);
export const EventTypeSchema = z.enum(Constants.public.Enums.event_type);
export const EventCategorySchema = z.enum(Constants.public.Enums.event_category);
export const PageClassificationSchema = z.enum(Constants.public.Enums.page_classification);


export type GalleryType = z.infer<typeof GalleryTypeSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type EventCategory = z.infer<typeof EventCategorySchema>;
export type PageClassification = z.infer<typeof PageClassificationSchema>;

/**
 * Database table row types (from auto-generated types)
 * Use these for reading from the database
 */
export type Gallery = Tables<"galleries">;
export type Artist = Tables<"artists">;
export type Event = Tables<"events">;
export type ScrapedPage = Tables<"scraped_pages">;

/**
 * Zod schemas for validation and AI extraction
 */

// Metadata for scraped pages (not a table, just JSON)
export const ScrapedPageMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string(),
  language: z.string(),
  statusCode: z.number()
});
export type ScrapedPageMetadata = z.infer<typeof ScrapedPageMetadataSchema>;

// Gallery extraction schema (for AI to extract from content)
export const GalleryExtractionSchema = z.object({
  name: z.string(),
  website: z.string(),
  galleryType: GalleryTypeSchema,
  city: z.string(),
  tz: z.string().default("Europe/Warsaw")
});
export type GalleryExtraction = z.infer<typeof GalleryExtractionSchema>;

// Artist extraction schema (for AI to extract from content)
export const ArtistExtractionSchema = z.object({
  name: z.string(),
  bio: z.string().optional(),
  website: z.string().url().optional()
});
export type ArtistExtraction = z.infer<typeof ArtistExtractionSchema>;

// Event extraction schema (for AI to extract from content)
export const EventExtractionSchema = z.object({
  title: z.string(),
  description: z.string(),
  eventType: EventTypeSchema,
  category: EventCategorySchema,
  tags: z.array(z.string()).default([]),
  start: z.number().optional(),
  end: z.number().optional(),
  price: z.number().optional().default(0),
  artistNames: z.array(z.string()).default([])
});
export type EventExtraction = z.infer<typeof EventExtractionSchema>;


