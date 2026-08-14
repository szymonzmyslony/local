import { getMarketConfig } from "@shared";
import { describe, expect, it } from "vitest";
import { resolveMarket } from "../src/market";
import { getZineSystemPrompt } from "../src/prompts";
import type { EventSearchResult } from "../src/services/event-search";
import {
  deduplicateEvents,
  diversifyEvents,
  eventMatchesAttendance,
  eventMatchesTiming,
  getEventSearchStart,
  getEventSearchWindow
} from "../src/services/event-search";
import { matchesMarketArea } from "../src/services/market-area";

describe("Zine channel prompts", () => {
  it("adds WhatsApp-specific concise formatting guidance", () => {
    const prompt = getZineSystemPrompt("whatsapp", getMarketConfig("ldn"));

    expect(prompt).toContain("Channel: WhatsApp");
    expect(prompt).toContain("WhatsApp bold (*text*)");
    expect(prompt).toContain("maps.google.com");
  });

  it("keeps visual card guidance on the web channel", () => {
    const prompt = getZineSystemPrompt("web", getMarketConfig("ldn"));

    expect(prompt).toContain("Channel: Web");
    expect(prompt).toContain("visual cards automatically");
    expect(prompt).toContain("Never invent or infer an address");
    expect(prompt).toContain('results { kind: "limited", count: N }');
    expect(prompt).toContain("at most two short sentences");
    expect(prompt).toContain("multiple dates");
  });

  it("builds Warsaw guidance from the closed market configuration", () => {
    const prompt = getZineSystemPrompt("web", getMarketConfig("waw"));

    expect(prompt).toContain("events in Warsaw");
    expect(prompt).toContain("Europe/Warsaw");
    expect(prompt).toContain("Polish source material");
    expect(prompt).not.toContain("events in London");
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

  it("uses London civil-day boundaries across daylight saving time", () => {
    expect(
      getEventSearchWindow(
        { kind: "on_date", date: "2026-08-10" },
        "Europe/London"
      )
    ).toEqual({
      start: "2026-08-09T23:00:00.000Z",
      end: "2026-08-10T23:00:00.000Z"
    });
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

  it("shows distinct galleries before repeated event sessions", () => {
    const base: EventSearchResult = {
      event_id: "event-1",
      title: "Curator Tour",
      description: null,
      start_at: "2026-08-11T12:00:00.000Z",
      end_at: null,
      timezone: "Europe/London",
      status: "scheduled",
      ticket_url: null,
      source_url: null,
      artists: [],
      tags: [],
      images: [],
      gallery_id: "gallery-1",
      gallery_name: "One",
      gallery_main_url: "https://one.example",
      gallery_district: "Bankside",
      gallery_address: null
    };
    const repeated = {
      ...base,
      event_id: "event-2",
      start_at: "2026-08-12T12:00:00.000Z"
    };
    const another = {
      ...base,
      event_id: "event-3",
      title: "New Exhibition",
      gallery_id: "gallery-2",
      gallery_name: "Two",
      gallery_main_url: "https://two.example"
    };

    expect(diversifyEvents([base, repeated, another]).map((event) => event.event_id)).toEqual([
      "event-1",
      "event-3",
      "event-2"
    ]);
  });

  it("keeps online-only events out of in-person area searches", () => {
    expect(
      eventMatchesAttendance(
        {
          title: "Ghost in the loop",
          description: "An online exhibition.",
          tags: []
        },
        { kind: "in_person" }
      )
    ).toBe(false);
  });
});

describe("market routing", () => {
  it("keeps London as the default and gives Warsaw an isolated path", () => {
    expect(
      resolveMarket({
        hostname: "chat.zinelocal.com",
        pathname: "/",
        search: ""
      })
    ).toBe("ldn");
    expect(
      resolveMarket({
        hostname: "chat.zinelocal.com",
        pathname: "/warsaw",
        search: ""
      })
    ).toBe("waw");
  });

  it("normalizes Polish district names and aliases", () => {
    expect(matchesMarketArea("Srodmiescie", "Śródmieście", "waw")).toBe(true);
    expect(matchesMarketArea("Srodmiescie", "centrum", "waw")).toBe(true);
    expect(matchesMarketArea("Praga", "Praga-Północ", "waw")).toBe(true);
  });
});
