import { describe, expect, it } from "vitest";
import { observationExtractionSchema } from "../src/schemas";

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
});
