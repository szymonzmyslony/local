import { describe, expect, it } from "vitest";
import {
  galleryObserverStateSchema,
  fallbackObservationExtractionSchema,
  fromFallbackObservationExtraction,
  observationExtractionSchema,
  observeRequestSchema,
  registerGallerySchema
} from "../src/schemas";

describe("observation extraction boundary", () => {
  it("accepts evidence-backed nullable event fields", () => {
    const parsed = observationExtractionSchema.parse({
      page_kind: "events",
      gallery_name: "Example Gallery",
      gallery_area: "Soho",
      events: [
        {
          title: "A real exhibition",
          description: null,
          start_at: "2026-08-12T18:00:00+01:00",
          end_at: null,
          status: "scheduled",
          venue: {
            kind: "market_or_gallery",
            evidence: "At Example Gallery"
          },
          ticket_url: null,
          event_url: null,
          artists: [],
          tags: ["exhibition"],
          images: [],
          confidence: 0.9,
          evidence: ["12 August 2026, 6pm"]
        }
      ],
      discovered_sources: [],
      notes: []
    });
    expect(parsed.events).toHaveLength(1);
  });

  it("rejects confidence outside the allowed range", () => {
    expect(() =>
      observationExtractionSchema.parse({
        page_kind: "other",
        gallery_name: null,
        gallery_area: null,
        events: [],
        discovered_sources: [
          { url: "https://example.com/events", kind: "events", confidence: 2 }
        ],
        notes: []
      })
    ).toThrow();
  });

  it("requires an explicit venue evidence variant", () => {
    expect(() =>
      observationExtractionSchema.parse({
        page_kind: "events",
        gallery_name: "Example Gallery",
        gallery_area: "Warsaw",
        events: [
          {
            title: "Touring show",
            description: null,
            start_at: "2026-08-12",
            end_at: "2026-09-01",
            status: "scheduled",
            ticket_url: null,
            event_url: null,
            artists: [],
            tags: [],
            images: [],
            confidence: 0.9,
            evidence: ["Shown in Ostrava"]
          }
        ],
        discovered_sources: [],
        notes: []
      })
    ).toThrow();
  });

  it("adapts the provider-compatible flat venue transport into the union", () => {
    const fallback = fallbackObservationExtractionSchema.parse({
      page_kind: "events",
      gallery_name: "Example Gallery",
      gallery_area: "Warsaw",
      events: [
        {
          title: "Touring show",
          description: null,
          start_at: "2026-08-12",
          end_at: "2026-09-01",
          status: "scheduled",
          venue_scope: "outside_market",
          venue_detail: "PLATO, Ostrava",
          venue_evidence: "Presented in Ostrava",
          ticket_url: null,
          event_url: null,
          artists: [],
          tags: [],
          images: [],
          confidence: 0.9,
          evidence: ["Presented in Ostrava"]
        }
      ],
      discovered_sources: [],
      notes: []
    });

    expect(fromFallbackObservationExtraction(fallback).events[0]?.venue).toEqual({
      kind: "outside_market",
      venue: "PLATO, Ostrava",
      evidence: "Presented in Ostrava"
    });
  });
});

describe("multi-market agent boundaries", () => {
  it("accepts a configured Warsaw observer as a closed state variant", () => {
    const state = galleryObserverStateSchema.parse({
      kind: "configured",
      galleryId: "8dc9aeeb-cf7a-4636-9ca6-3ea21a8ba77d",
      name: "Example Warsaw Gallery",
      market: {
        market: "waw",
        city: "Warsaw",
        countryCode: "PL",
        timezone: "Europe/Warsaw",
        locale: "pl-PL",
        language: "Polish"
      },
      status: "active",
      sources: [],
      workflow: { kind: "idle" },
      observation: { kind: "never" }
    });

    expect(state.kind).toBe("configured");
  });

  it("requires explicit source and location variants when registering", () => {
    const gallery = registerGallerySchema.parse({
      market: "waw",
      name: "Example Warsaw Gallery",
      sources: {
        kind: "homepage_and_events",
        mainUrl: "https://example.com",
        eventsUrl: "https://example.com/wystawy"
      },
      location: { kind: "area_only", area: "Srodmiescie" }
    });

    expect(gallery.market).toBe("waw");
    expect(() =>
      registerGallerySchema.parse({
        market: "waw",
        name: "Broken Gallery",
        mainUrl: "https://example.com"
      })
    ).toThrow();
  });

  it("requires an explicit observation execution mode", () => {
    expect(
      observeRequestSchema.parse({
        mode: "force_extract",
        galleryId: "8dc9aeeb-cf7a-4636-9ca6-3ea21a8ba77d"
      }).mode
    ).toBe("force_extract");
    expect(() =>
      observeRequestSchema.parse({
        galleryId: "8dc9aeeb-cf7a-4636-9ca6-3ea21a8ba77d",
        force: true
      })
    ).toThrow();
  });
});
