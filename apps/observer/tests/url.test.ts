import { describe, expect, it } from "vitest";
import {
  assertAllowedSourceUrl,
  minuteToWallClock,
  nextAnchoredCheckAt,
  normalizeSourceUrl,
  stableMinute,
  workflowInstanceId
} from "../src/url";

describe("source URL safety", () => {
  it("normalizes tracking and fragments", () => {
    expect(
      normalizeSourceUrl(
        "https://example.com/events/?utm_source=x&gad_source=1&gbraid=abc&gclid=xyz#today"
      )
    ).toBe("https://example.com/events");
  });

  it("removes browser accessibility labels appended to event URLs", () => {
    expect(
      normalizeSourceUrl(
        "https://example.com/events/show%20%22Open%20Homepage%22"
      )
    ).toBe("https://example.com/events/show");
    expect(
      normalizeSourceUrl(
        "https://example.com/events/show%20%22Open%20Example%20Exhibition%22"
      )
    ).toBe("https://example.com/events/show");
  });

  it("removes any quoted browser link label", () => {
    expect(
      normalizeSourceUrl(
        "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/9327,wydarzenie.html%20%22LATO%20W%20MNW%22"
      )
    ).toBe(
      "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/9327,wydarzenie.html"
    );
  });

  it("canonicalizes MNW Polish-diacritic aliases", () => {
    expect(
      normalizeSourceUrl(
        "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarze%C5%84/9255,wydarzenie.html"
      )
    ).toBe(
      "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/9255,wydarzenie.html"
    );
    expect(
      normalizeSourceUrl(
        "https://www.mnw.art.pl/wystawy/rze%C5%BAba-na-meblo%C5%9Bciank%C4%99,275.html"
      )
    ).toBe(
      "https://www.mnw.art.pl/wystawy/rzezba-na-mebloscianke,275.html"
    );
  });

  it("blocks local and cross-origin URLs", () => {
    expect(() => normalizeSourceUrl("http://127.0.0.1/admin")).toThrow();
    expect(() =>
      assertAllowedSourceUrl("https://evil.example/events", ["https://gallery.example/"])
    ).toThrow();
  });

  it("creates deterministic market observation windows", () => {
    const first = stableMinute("gallery-id");
    expect(first).toBe(stableMinute("gallery-id"));
    expect(first).toBeGreaterThanOrEqual(120);
    expect(first).toBeLessThan(360);
    expect(minuteToWallClock(first)).toMatch(/^0[2-5]:[0-5]\d$/);
  });

  it("anchors daily checks to the next London wall-clock slot", () => {
    expect(
      nextAnchoredCheckAt({
        after: new Date("2026-08-21T15:00:00Z"),
        timezone: "Europe/London",
        minuteOfDay: 150
      })
    ).toBe("2026-08-22T01:30:00.000Z");
  });

  it("anchors weekly checks without completion-time drift", () => {
    expect(
      nextAnchoredCheckAt({
        after: new Date("2026-08-21T15:00:00Z"),
        timezone: "Europe/Warsaw",
        minuteOfDay: 240,
        weekday: 1
      })
    ).toBe("2026-08-24T02:00:00.000Z");
  });

  it("resolves a Warsaw spring DST gap to the first viable hour", () => {
    expect(
      nextAnchoredCheckAt({
        after: new Date("2027-03-27T20:00:00Z"),
        timezone: "Europe/Warsaw",
        minuteOfDay: 150
      })
    ).toBe("2027-03-28T01:30:00.000Z");
  });

  it("creates deterministic workflow-safe digests", async () => {
    const id = await workflowInstanceId("manual:gallery-id:2026-08-10");
    expect(id).toMatch(/^obs_[a-f0-9]{24}$/);
    expect(id).toBe(await workflowInstanceId("manual:gallery-id:2026-08-10"));
  });
});
