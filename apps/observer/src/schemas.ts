import { z } from "zod";

export const marketCodeSchema = z.enum(["ldn", "waw"]);

export const marketIdentitySchema = z.discriminatedUnion("market", [
  z
    .object({
      market: z.literal("ldn"),
      city: z.literal("London"),
      countryCode: z.literal("GB"),
      timezone: z.literal("Europe/London"),
      locale: z.literal("en-GB"),
      language: z.literal("English")
    })
    .strict(),
  z
    .object({
      market: z.literal("waw"),
      city: z.literal("Warsaw"),
      countryCode: z.literal("PL"),
      timezone: z.literal("Europe/Warsaw"),
      locale: z.literal("pl-PL"),
      language: z.literal("Polish")
    })
    .strict()
]);

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

const workflowStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }).strict(),
  z.object({ kind: z.literal("started"), workflowId: z.string() }).strict()
]);

const observationStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never") }).strict(),
  z.object({ kind: z.literal("observed"), observedAt: z.string() }).strict()
]);

export const galleryObserverStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unconfigured") }).strict(),
  z
    .object({
      kind: z.literal("configured"),
      galleryId: z.string().uuid(),
      name: z.string().min(1),
      market: marketIdentitySchema,
      status: z.enum(["active", "paused", "failing", "archived"]),
      sources: z.array(gallerySourceSchema),
      workflow: workflowStateSchema,
      observation: observationStateSchema
    })
    .strict()
]);

export type GallerySource = z.infer<typeof gallerySourceSchema>;
export type GalleryObserverState = z.infer<typeof galleryObserverStateSchema>;
export type ConfiguredGalleryObserverState = Extract<
  GalleryObserverState,
  { kind: "configured" }
>;
export type MarketIdentity = z.infer<typeof marketIdentitySchema>;

const eventVenueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("market_or_gallery"),
      evidence: z.string().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("outside_market"),
      venue: z.string().min(1),
      evidence: z.string().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal("unknown"),
      reason: z.string().min(1)
    })
    .strict()
]);

const extractedEventSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable(),
    start_at: z.string().nullable(),
    end_at: z.string().nullable(),
    status: z.enum([
      "scheduled",
      "cancelled",
      "postponed",
      "rescheduled",
      "unknown"
    ]),
    venue: eventVenueSchema,
    ticket_url: z.string().nullable(),
    event_url: z.string().nullable(),
    artists: z.array(z.string()),
    tags: z.array(z.string()),
    images: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string())
  })
  .strict();

const fallbackExtractedEventSchema = extractedEventSchema
  .omit({ venue: true })
  .extend({
    venue_scope: z.enum(["market_or_gallery", "outside_market", "unknown"]),
    venue_detail: z.string(),
    venue_evidence: z.string()
  })
  .strict();

export const observationExtractionSchema = z
  .object({
    page_kind: z.enum(["events", "event", "calendar", "other"]),
    gallery_name: z.string().nullable(),
    gallery_area: z.string().nullable(),
    events: z.array(extractedEventSchema),
    discovered_sources: z
      .array(
        z
          .object({
            url: z.string(),
            kind: sourceKindSchema,
            confidence: z.number().min(0).max(1)
          })
          .strict()
      )
      .max(40),
    notes: z.array(z.string())
  })
  .strict();

export const fallbackObservationExtractionSchema = observationExtractionSchema
  .extend({ events: z.array(fallbackExtractedEventSchema) })
  .strict();

export function fromFallbackObservationExtraction(
  fallback: z.infer<typeof fallbackObservationExtractionSchema>
): ObservationExtraction {
  return observationExtractionSchema.parse({
    ...fallback,
    events: fallback.events.map(
      ({ venue_scope, venue_detail, venue_evidence, ...event }) => ({
        ...event,
        venue:
          venue_scope === "market_or_gallery"
            ? {
                kind: "market_or_gallery" as const,
                evidence:
                  venue_evidence || venue_detail || "Official gallery context"
              }
            : venue_scope === "outside_market"
              ? {
                  kind: "outside_market" as const,
                  venue: venue_detail || "Outside selected market",
                  evidence:
                    venue_evidence || "Official source identifies another venue"
                }
              : {
                  kind: "unknown" as const,
                  reason:
                    venue_evidence ||
                    venue_detail ||
                    "Venue could not be verified"
                }
      })
    )
  });
}

export type ObservationExtraction = z.infer<typeof observationExtractionSchema>;
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

const gallerySourceSetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("homepage"), mainUrl: z.string().url() }).strict(),
  z
    .object({
      kind: z.literal("homepage_and_events"),
      mainUrl: z.string().url(),
      eventsUrl: z.string().url()
    })
    .strict(),
  z
    .object({
      kind: z.literal("homepage_and_about"),
      mainUrl: z.string().url(),
      aboutUrl: z.string().url()
    })
    .strict(),
  z
    .object({
      kind: z.literal("homepage_events_and_about"),
      mainUrl: z.string().url(),
      eventsUrl: z.string().url(),
      aboutUrl: z.string().url()
    })
    .strict()
]);

const galleryLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }).strict(),
  z.object({ kind: z.literal("area_only"), area: z.string().min(1) }).strict(),
  z
    .object({ kind: z.literal("address_only"), address: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("known"),
      address: z.string().min(1),
      area: z.string().min(1)
    })
    .strict()
]);

const registerGalleryShape = {
  name: z.string().min(1),
  sources: gallerySourceSetSchema,
  location: galleryLocationSchema
};

export const registerGallerySchema = z.discriminatedUnion("market", [
  z.object({ market: z.literal("ldn"), ...registerGalleryShape }).strict(),
  z.object({ market: z.literal("waw"), ...registerGalleryShape }).strict()
]);
export type RegisterGalleryInput = z.infer<typeof registerGallerySchema>;

export const bootstrapRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("market"), market: marketCodeSchema }).strict(),
  z.object({ mode: z.literal("all_markets") }).strict()
]);

export const evaluationRequestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("default"),
      market: marketCodeSchema
    })
    .strict(),
  z
    .object({
      mode: z.literal("selected"),
      market: marketCodeSchema,
      fixtureIds: z.array(z.string().min(1)).min(1),
      techniques: z.array(fetchStrategySchema).min(1)
    })
    .strict()
]);

export const observeRequestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("change_only"),
      galleryId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      mode: z.literal("force_extract"),
      galleryId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      mode: z.literal("unchecked_only"),
      galleryId: z.string().uuid()
    })
    .strict()
]);
