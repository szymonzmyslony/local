import { describe, expect, it } from "vitest";
import { getZineSystemPrompt } from "../src/prompts";
import {
  deduplicateEvents,
  eventMatchesTiming,
  getEventSearchStart
} from "../src/services/event-search";
import type { EventSearchResult } from "../src/services/event-search";

describe("Zine channel prompts", () => {
  it("adds WhatsApp-specific concise formatting guidance", () => {
    const prompt = getZineSystemPrompt("whatsapp");

    expect(prompt).toContain("Channel: WhatsApp");
    expect(prompt).toContain("WhatsApp bold (*text*)");
    expect(prompt).toContain("maps.google.com");
  });

  it("keeps visual card guidance on the web channel", () => {
    const prompt = getZineSystemPrompt("web");

    expect(prompt).toContain("Channel: Web");
    expect(prompt).toContain("visual cards automatically");
    expect(prompt).toContain("Never invent or infer an address");
  });
});

describe("event search cutoff", () => {
  it("uses the current instant instead of a fixed historical date", () => {
    const now = new Date("2026-08-09T12:34:56.000Z");

    expect(getEventSearchStart(now)).toBe("2026-08-09T12:34:56.000Z");
  });

  it("keeps an exhibition that started earlier but is still running", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");

    expect(
      eventMatchesTiming(
        {
          start_at: "2026-07-01T09:00:00.000Z",
          end_at: "2026-09-01T17:00:00.000Z"
        },
        { kind: "current_and_upcoming" },
        now
      )
    ).toBe(true);
  });

  it("matches exhibitions overlapping a requested London date", () => {
    expect(
      eventMatchesTiming(
        {
          start_at: "2026-08-01T09:00:00.000Z",
          end_at: "2026-08-20T17:00:00.000Z"
        },
        { kind: "on_date", date: "2026-08-10" }
      )
    ).toBe(true);
  });

  it("deduplicates equivalent event rows before rendering", () => {
    const event: EventSearchResult = {
      event_id: "event-1",
      title: "Japanese Women Photographers: From 1950s to Now",
      description: null,
      start_at: "2026-06-24T00:00:00.000Z",
      end_at: "2026-09-27T00:00:00.000Z",
      timezone: "Europe/London",
      status: "scheduled",
      ticket_url: null,
      source_url: null,
      artists: [],
      tags: [],
      images: [],
      gallery_id: "gallery-1",
      gallery_name: "The Photographers' Gallery",
      gallery_main_url: "https://example.com",
      gallery_district: "Soho",
      gallery_address: null
    };

    const duplicate = { ...event, event_id: "event-2" };
    expect(deduplicateEvents([event, duplicate])).toEqual([event]);
  });
});
