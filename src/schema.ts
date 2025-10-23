import { z } from "zod";

/**
 * Schema definitions for gallery agents
 *
 * ENUMS:
 * - D1: Enforced via CHECK constraints in SQL
 * - Vectorize: Stored as strings, filterable using $eq/$in operators
 * - Example: filter: { eventType: { $in: ["opening", "exhibition"] } }
 */

// ============================================
// ENUM CONSTANTS (for use in code and Vectorize filters)
// ============================================

export const GALLERY_TYPES = [
  "commercial",
  "non-profit",
  "museum",
  "artist-run",
  "project-space"
] as const;
export const EVENT_TYPES = [
  "opening",
  "reception",
  "talk",
  "workshop",
  "exhibition"
] as const;
export const EVENT_CATEGORIES = [
  "contemporary",
  "modern",
  "photography",
  "design_architecture",
  "digital_new_media",
  "performance_live_art",
  "social_critical_art",
  "emerging_artists"
] as const;

// ============================================
// CORE ZOD SCHEMAS - Single source of truth
// ============================================

// Gallery schema (matches database exactly)
export const GallerySchema = z.object({
  id: z.string(),
  name: z.string().describe("Full name of the gallery or art space"),
  website: z.string().url().describe("Gallery website URL"),
  galleryType: z
    .enum(GALLERY_TYPES)
    .nullable()
    .describe(
      "Type of gallery: commercial, non-profit, museum, artist-run, project-space"
    ),
  city: z.string().describe("City where the gallery is located"),
  neighborhood: z
    .string()
    .nullable()
    .describe("Neighborhood or district within the city"),
  tz: z
    .string()
    .default("Europe/Warsaw")
    .describe(
      "Timezone in IANA format (e.g., 'Europe/Warsaw', 'Europe/Berlin')"
    ),
  createdAt: z.number(),
  updatedAt: z.number()
});

// Scraped page metadata schema
export const ScrapedPageMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string(),
  language: z.string(),
  statusCode: z.number()
});

// Scraped page schema
export const ScrapedPageSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  galleryId: z.string(),
  markdown: z.string(),
  metadata: ScrapedPageMetadataSchema,
  scrapedAt: z.number()
});

// Artist schema (matches database exactly)
export const ArtistSchema = z.object({
  id: z.string(),
  name: z.string().describe("Artist full name"),
  bio: z
    .string()
    .nullable()
    .describe("Brief biography or description of the artist's work"),
  website: z
    .string()
    .url()
    .nullable()
    .describe("Artist's personal website or portfolio"),
  createdAt: z.number(),
  updatedAt: z.number()
});

// Event schema (matches database exactly)
export const EventSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  title: z.string().describe("Event title"),
  description: z
    .string()
    .describe("Detailed description of the event, exhibition, or activity"),
  eventType: z
    .enum(EVENT_TYPES)
    .describe(
      "Type: opening (wernisaż), reception, talk (rozmowa/dyskusja), workshop (warsztat), exhibition (wystawa)"
    ),
  category: z
    .enum(EVENT_CATEGORIES)
    .describe(
      "Art category: contemporary (współczesna), modern (modernistyczna), photography (fotografia), design_architecture, digital_new_media, performance_live_art, social_critical_art, emerging_artists (młoda scena)"
    ),
  tags: z
    .array(z.string())
    .describe(
      "Mood, themes, or descriptive tags (e.g., 'experimental', 'intimate', 'political', 'multimedia')"
    ),
  start: z
    .string()
    .describe(
      "Start date/time in ISO 8601 format with timezone (e.g., '2025-01-15T18:00:00+01:00')"
    ),
  end: z
    .string()
    .describe(
      "End date/time in ISO 8601 format with timezone (e.g., '2025-03-15T20:00:00+01:00')"
    ),
  price: z
    .number()
    .describe(
      "Entry price in local currency. Use 0 if free (darmowy/bezpłatny)"
    ),
  createdAt: z.number(),
  updatedAt: z.number()
});

// ============================================
// AI EXTRACTION SCHEMAS
// ============================================

// Gallery extraction = Gallery without metadata fields
export const GalleryExtractionSchema = GallerySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Artist extraction = Artist without metadata fields
export const ArtistExtractionSchema = ArtistSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Event extraction = Event without metadata fields + add artistNames
export const EventExtractionSchema = EventSchema.omit({
  id: true,
  galleryId: true,
  createdAt: true,
  updatedAt: true
}).extend({
  artistNames: z
    .array(z.string())
    .describe(
      "List of all participating artist names (use exact names as they appear in the artists array)"
    )
});

// Main extraction result schema
export const GalleryDataExtractionSchema = z.object({
  gallery: GalleryExtractionSchema,
  events: z.array(EventExtractionSchema),
  artists: z.array(ArtistExtractionSchema)
});

// ============================================
// TYPESCRIPT TYPES - Inferred from Zod
// ============================================

export type Gallery = z.infer<typeof GallerySchema>;
export type ScrapedPageMetadata = z.infer<typeof ScrapedPageMetadataSchema>;
export type ScrapedPage = z.infer<typeof ScrapedPageSchema>;
export type Artist = z.infer<typeof ArtistSchema>;
export type Event = z.infer<typeof EventSchema>;

export type GalleryExtraction = z.infer<typeof GalleryExtractionSchema>;
export type ArtistExtraction = z.infer<typeof ArtistExtractionSchema>;
export type EventExtraction = z.infer<typeof EventExtractionSchema>;
export type GalleryDataExtraction = z.infer<typeof GalleryDataExtractionSchema>;
