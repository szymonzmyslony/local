import { describe, expect, it } from "vitest";
import { isSourceDue, mergeObservedEventInfo } from "../src/repository";

describe("source polling windows", () => {
  it("treats sources due within an hour as ready for a fixed daily alarm", () => {
    const now = Date.parse("2026-08-20T04:00:00Z");
    expect(isSourceDue("2026-08-20T04:45:00Z", now)).toBe(true);
    expect(isSourceDue("2026-08-20T05:01:00Z", now)).toBe(false);
    expect(isSourceDue("not-a-date", now)).toBe(false);
  });
});

describe("observed event information merge", () => {
  it("does not let a thin listing erase a richer event page", () => {
    const merged = mergeObservedEventInfo(
      {
        description:
          "A detailed curatorial description of the exhibition and the artist's practice.",
        artists: ["Ada Artist"],
        tags: ["installation"],
        images: ["https://gallery.example/image.jpg"],
        data: {
          evidence: ["Long official evidence"],
          source: "https://gallery.example/events/ada"
        }
      },
      {
        description: null,
        artists: [],
        tags: ["Exhibition"],
        images: [],
        evidence: ["12 August - 20 September"],
        source: "https://gallery.example/events"
      }
    );

    expect(merged.description).toContain("detailed curatorial description");
    expect(merged.artists).toEqual(["Ada Artist"]);
    expect(merged.images).toEqual(["https://gallery.example/image.jpg"]);
    expect(merged.tags).toEqual(["installation", "Exhibition"]);
    expect(merged.data).toEqual({
      evidence: ["Long official evidence", "12 August - 20 September"],
      source: "https://gallery.example/events",
      sources: [
        "https://gallery.example/events/ada",
        "https://gallery.example/events"
      ]
    });
  });

  it("promotes a richer newly discovered description and unions metadata", () => {
    const merged = mergeObservedEventInfo(
      {
        description: "Short description.",
        artists: ["Ada Artist"],
        tags: [],
        images: [],
        data: { evidence: [], sources: [] }
      },
      {
        description:
          "A longer description taken from the official event detail page with useful context.",
        artists: ["ada artist", "Bob Artist"],
        tags: ["Sculpture"],
        images: ["https://gallery.example/detail.jpg"],
        evidence: ["Official event page"],
        source: "https://gallery.example/events/detail"
      }
    );

    expect(merged.description).toContain("longer description");
    expect(merged.artists).toEqual(["Ada Artist", "Bob Artist"]);
    expect(merged.tags).toEqual(["Sculpture"]);
  });
});
