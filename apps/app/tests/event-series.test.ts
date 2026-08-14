import { describe, expect, it } from "vitest";
import {
  type EventSeriesInput,
  groupEventSeries,
  visibleEventSeries
} from "../src/services/event-series";

const TOUR_LATER: EventSeriesInput = {
  event_id: "tour-2",
  title: "Oprowadzanie po aktualnych wystawach",
  description: null,
  start_at: "2026-08-16T10:30:00.000Z",
  end_at: null,
  timezone: "Europe/Warsaw",
  status: "scheduled",
  ticket_url: null,
  source_url: "https://example.com/tour-2",
  artists: [],
  tags: ["tour"],
  images: [],
  gallery: {
    id: "gallery-msn",
    name: "Muzeum Sztuki Nowoczesnej",
    main_url: "https://example.com",
    area: "Śródmieście",
    address: "Marszałkowska 103"
  }
};

const TOUR_EARLIER: EventSeriesInput = {
  ...TOUR_LATER,
  event_id: "tour-1",
  description: "Guided visit through the museum's current exhibitions.",
  start_at: "2026-08-15T10:30:00.000Z",
  source_url: "https://example.com/tour-1"
};

const EXHIBITION: EventSeriesInput = {
  ...TOUR_LATER,
  event_id: "exhibition-1",
  title: "A separate exhibition",
  start_at: "2026-08-15T12:00:00.000Z",
  source_url: "https://example.com/exhibition"
};

describe("event occurrence grouping", () => {
  it("renders repeated gallery/title sessions as one event with sorted dates", () => {
    const grouped = groupEventSeries([
      TOUR_LATER,
      EXHIBITION,
      TOUR_EARLIER
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      event_id: "tour-1",
      title: "Oprowadzanie po aktualnych wystawach",
      description: "Guided visit through the museum's current exhibitions.",
      schedule: { kind: "multiple" }
    });
    if (grouped[0].schedule.kind !== "multiple") {
      throw new Error("Expected a multiple-date schedule");
    }
    expect(
      grouped[0].schedule.occurrences.map((occurrence) => occurrence.event_id)
    ).toEqual(["tour-1", "tour-2"]);
  });

  it("does not merge the same title across galleries", () => {
    const anotherGallery = {
      ...TOUR_EARLIER,
      event_id: "other-gallery-tour",
      gallery: {
        ...TOUR_EARLIER.gallery,
        id: "gallery-other",
        name: "Another gallery"
      }
    };

    expect(groupEventSeries([TOUR_EARLIER, anotherGallery])).toHaveLength(2);
  });

  it("shows five groups initially and all groups after expansion", () => {
    const events = groupEventSeries(
      Array.from({ length: 7 }, (_, index) => ({
        ...EXHIBITION,
        event_id: `event-${index}`,
        title: `Exhibition ${index}`
      }))
    );
    const display = { kind: "progressive", initialCount: 5 } as const;

    expect(visibleEventSeries(events, display, false)).toHaveLength(5);
    expect(visibleEventSeries(events, display, true)).toHaveLength(7);
    expect(
      visibleEventSeries(events, { kind: "complete" }, false)
    ).toHaveLength(7);
  });
});
