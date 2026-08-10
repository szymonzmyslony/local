import { describe, expect, it } from "vitest";
import { getToolPresentation } from "../src/components/messages/tool-call-display";
import { sanitizeEventUrl } from "../src/components/messages/event-cards";
import { getMarketConfig } from "@shared";

describe("human-readable tool activity", () => {
  it("describes a gallery search without exposing function arguments", () => {
    const presentation = getToolPresentation(
      "retrieve_galleries",
      {
        mode: "search",
        criteria: {
          kind: "semantic_in_area_open_at",
          searchQuery: "experimental art",
          area: "East London",
          openAt: {
            precision: "exact_time",
            weekday: 1,
            timeMinutes: 720
          }
        }
      },
      { found: 4 }
    );

    expect(presentation.complete).toBe("Checked 4 galleries");
    expect(presentation.details).toEqual([
      "Experimental Art",
      "East London",
      "Monday · 12:00"
    ]);
  });

  it("makes an unfiltered request read as the full London catalogue", () => {
    const presentation = getToolPresentation(
      "retrieve_galleries",
      { mode: "all" },
      { found: 20 }
    );

    expect(presentation.loading).toBe("Loading the London gallery catalogue…");
    expect(presentation.complete).toBe("Checked 20 galleries");
    expect(presentation.details).toEqual(["All London galleries"]);
  });

  it("renders event subject, location, and date as useful filters", () => {
    const presentation = getToolPresentation(
      "search_events",
      {
        mode: "discover",
        subject: { kind: "semantic", searchQuery: "experimental sculpture" },
        location: { kind: "area", area: "East London" },
        timing: { kind: "on_date", date: "2026-08-15" },
        attendance: { kind: "in_person" },
        results: { kind: "limited", count: 6 }
      },
      { found: 6 }
    );

    expect(presentation.complete).toBe("Found 6 events");
    expect(presentation.details).toEqual([
      "Experimental Sculpture",
      "East London",
      "2026-08-15",
      "In person",
      "6 results"
    ]);
  });

  it("renders Warsaw activity without leaking London labels", () => {
    const presentation = getToolPresentation(
      "search_events",
      {
        mode: "discover",
        subject: { kind: "any" },
        location: { kind: "anywhere_in_market" },
        timing: { kind: "current_and_upcoming" },
        attendance: { kind: "in_person" },
        results: { kind: "standard" }
      },
      { found: 3, city: "Warsaw" },
      getMarketConfig("waw")
    );

    expect(presentation.loading).toBe("Searching Warsaw events…");
    expect(presentation.details).toContain("Warsaw");
  });
});

describe("event card links", () => {
  it("removes browser labels accidentally appended to extracted URLs", () => {
    expect(
      sanitizeEventUrl(
        "https://example.com/show%20%22Open%20Example%20Exhibition%22"
      )
    ).toBe("https://example.com/show");
  });
});
