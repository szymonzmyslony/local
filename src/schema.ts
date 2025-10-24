import { z } from "zod";
import type { Enums, Tables } from "./types/database_types";
import { Constants } from "./types/database_types";

/**
 * Database enum types (from auto-generated types)
 * Single source of truth for all enum values
 */
export type GalleryType = Enums<"gallery_type">;
export type EventType = Enums<"event_type">;
export type EventCategory = Enums<"event_category">;
export type PageClassification = Enums<"page_classification">;

/**
 * Enum constants for Zod and runtime use
 */
export const GALLERY_TYPES = Constants.public.Enums.gallery_type;
export const EVENT_TYPES = Constants.public.Enums.event_type;
export const EVENT_CATEGORIES = Constants.public.Enums.event_category;
export const PAGE_CLASSIFICATIONS = Constants.public.Enums.page_classification;

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
  website: z.string().url(),
  galleryType: z.enum(GALLERY_TYPES).nullable(),
  city: z.string(),
  neighborhood: z.string().nullable(),
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
  eventType: z.enum(EVENT_TYPES),
  category: z.enum(EVENT_CATEGORIES),
  tags: z.array(z.string()).default([]),
  start: z.number(),
  end: z.number().optional(),
  price: z.number().optional().default(0),
  artistNames: z.array(z.string())
});
export type EventExtraction = z.infer<typeof EventExtractionSchema>;

// Combined extraction schema (for AI to extract all data from a gallery)
export const GalleryDataExtractionSchema = z.object({
  gallery: GalleryExtractionSchema,
  events: z.array(EventExtractionSchema),
  artists: z.array(ArtistExtractionSchema)
});
export type GalleryDataExtraction = z.infer<typeof GalleryDataExtractionSchema>;

// Classification schema (for AI to classify scraped pages)
export const ClassificationSchema = z.object({
  classification: z.enum(PAGE_CLASSIFICATIONS),
});
export type Classification = z.infer<typeof ClassificationSchema>;
