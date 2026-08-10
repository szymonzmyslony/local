import { describe, expect, it } from "vitest";
import {
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
