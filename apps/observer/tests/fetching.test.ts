import { describe, expect, it } from "vitest";
import { prepareContentForExtraction } from "../src/fetching";

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
