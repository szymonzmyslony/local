import { describe, expect, it } from "vitest";
import { getZineSystemPrompt } from "../src/prompts";
import { getEventSearchStart } from "../src/services/event-search";

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
    expect(prompt).toContain("show_recommendations");
  });
});

describe("event search cutoff", () => {
  it("uses the current instant instead of a fixed historical date", () => {
    const now = new Date("2026-08-09T12:34:56.000Z");

    expect(getEventSearchStart(now)).toBe("2026-08-09T12:34:56.000Z");
  });
});
