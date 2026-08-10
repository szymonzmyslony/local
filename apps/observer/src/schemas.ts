import { z } from "zod";

export const sourceKindSchema = z.enum([
  "home",
  "about",
  "events",
  "calendar",
  "feed",
  "other"
]);

export const fetchStrategySchema = z.enum(["browser_markdown", "http_html"]);

export const gallerySourceSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  normalizedUrl: z.string().url(),
  kind: sourceKindSchema,
  strategy: fetchStrategySchema,
  enabled: z.boolean()
});

export const galleryObserverStateSchema = z.object({
  configured: z.boolean(),
  galleryId: z.string().uuid().nullable(),
  name: z.string().nullable(),
  market: z.literal("ldn"),
  timezone: z.literal("Europe/London"),
  status: z.enum(["active", "paused", "failing", "archived"]),
  sources: z.array(gallerySourceSchema),
  lastWorkflowId: z.string().nullable(),
  lastObservedAt: z.string().nullable()
});

export type GallerySource = z.infer<typeof gallerySourceSchema>;
export type GalleryObserverState = z.infer<typeof galleryObserverStateSchema>;

const extractedEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  status: z.enum(["scheduled", "cancelled", "postponed", "rescheduled", "unknown"]),
  ticket_url: z.string().nullable(),
  event_url: z.string().nullable(),
  artists: z.array(z.string()),
  tags: z.array(z.string()),
  images: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string())
});

export const observationExtractionSchema = z.object({
  page_kind: z.enum(["events", "event", "calendar", "other"]),
  gallery_name: z.string().nullable(),
  gallery_area: z.string().nullable(),
  events: z.array(extractedEventSchema),
  discovered_sources: z.array(
    z.object({
      url: z.string(),
      kind: sourceKindSchema,
      confidence: z.number().min(0).max(1)
    })
  ),
  notes: z.array(z.string())
});

export type ObservationExtraction = z.infer<typeof observationExtractionSchema>;
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

export const registerGallerySchema = z.object({
  mainUrl: z.string().url(),
  name: z.string().min(1),
  eventsUrl: z.string().url().nullable().optional(),
  aboutUrl: z.string().url().nullable().optional(),
  address: z.string().nullable().optional(),
  area: z.string().nullable().optional()
});

export const observeRequestSchema = z.object({
  galleryId: z.string().uuid(),
  force: z.boolean().default(false)
});
