import { describe, expect, it } from "vitest";
import {
  fetchSource,
  prepareContentForExtraction,
  selectProfileSourceUrls
} from "../src/fetching";

describe("source content preparation", () => {
  it("removes inline image payloads without removing article text", () => {
    const prepared = prepareContentForExtraction(
      [
        "![logo](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA==)",
        "# Exhibition title",
        "A useful curatorial description stays visible.",
        "![remote](https://gallery.example/work.jpg)"
      ].join("\n")
    );

    expect(prepared).not.toContain("iVBORw0KGgo");
    expect(prepared).toContain("[inline image omitted]");
    expect(prepared).toContain(
      "A useful curatorial description stays visible."
    );
    expect(prepared).toContain("https://gallery.example/work.jpg");
  });

  it("safely truncates oversized raw HTML instead of entering a failure loop", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(`useful-prefix${"x".repeat(2_100_000)}`, {
        headers: { "content-type": "text/html" }
      });
    try {
      const snapshot = await fetchSource({} as BrowserRun, {
        id: "3cb3455f-4ed8-41f6-aa50-34eab13e4611",
        url: "https://gallery.example/large-event",
        normalizedUrl: "https://gallery.example/large-event",
        kind: "other",
        purpose: "detail",
        strategy: "http_html",
        enabled: true,
        polling: { kind: "due" }
      });
      expect(snapshot.content.startsWith("useful-prefix")).toBe(true);
      expect(snapshot.content.length).toBe(90_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("profile source discovery", () => {
  it("prioritizes same-origin hours, visit, and contact pages", () => {
    expect(
      selectProfileSourceUrls(
        [
          "/about",
          "/events/current",
          "/contact",
          "/visit/opening-hours",
          "https://other.example/opening-hours"
        ],
        "https://gallery.example/"
      )
    ).toEqual([
      "https://gallery.example/visit/opening-hours",
      "https://gallery.example/contact",
      "https://gallery.example/about"
    ]);
  });
});
