import { describe, expect, it } from "vitest";
import {
  assertAllowedSourceUrl,
  minuteToWallClock,
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

  it("creates deterministic workflow-safe digests", async () => {
    const id = await workflowInstanceId("manual:gallery-id:2026-08-10");
    expect(id).toMatch(/^obs_[a-f0-9]{24}$/);
    expect(id).toBe(await workflowInstanceId("manual:gallery-id:2026-08-10"));
  });
});
