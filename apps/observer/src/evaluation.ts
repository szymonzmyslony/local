import {
  AI_CONFIG,
  createZineProvider
} from "@gallery-agents/shared";
import { generateText, Output } from "ai";
import { fetchSource } from "./fetching";
import { observerDatabase } from "./repository";
import { observationExtractionSchema } from "./schemas";
import type { LondonFixture } from "./london-fixtures";

export async function evaluateFixture(
  env: Env,
  fixture: LondonFixture,
  technique: "browser_markdown" | "http_html"
) {
  const started = Date.now();
  try {
    const snapshot = await fetchSource(env.BROWSER, {
      id: "00000000-0000-0000-0000-000000000000",
      url: fixture.eventsUrl,
      normalizedUrl: fixture.eventsUrl,
      kind: "events",
      strategy: technique,
      enabled: true
    });
    const provider = createZineProvider(env.OPENROUTER_API_KEY);
    const { output, usage } = await generateText({
      model: provider(AI_CONFIG.CHAT_MODEL),
      output: Output.object({ schema: observationExtractionSchema }),
      maxRetries: 1,
      prompt: [
        `Evaluate event extraction for ${fixture.name} in London.`,
        "Extract current or upcoming exhibitions and public art events only.",
        "Use null for unsupported facts. Include short evidence for every event.",
        `Official URL: ${fixture.eventsUrl}`,
        `Captured at: ${new Date().toISOString()}`,
        "---",
        snapshot.content.slice(0, 75_000)
      ].join("\n")
    });
    const validItems = output.events.filter(
      (event) => event.title.trim() && event.evidence.length > 0
    ).length;
    const structuralScore = output.events.length
      ? validItems / output.events.length
      : fixture.expectedMinimumItems === 0
        ? 1
        : 0;
    const success =
      output.events.length >= fixture.expectedMinimumItems && structuralScore >= 0.8;
    const result = {
      fixtureId: fixture.id,
      technique,
      success,
      eventCount: output.events.length,
      structuralScore,
      durationMs: Date.now() - started,
      usage,
      output
    };
    await observerDatabase(env).from("extraction_evaluations").insert({
      fixture_id: fixture.id,
      source_url: fixture.eventsUrl,
      technique,
      model: AI_CONFIG.CHAT_MODEL,
      success,
      field_accuracy: structuralScore,
      duration_ms: result.durationMs,
      token_usage: usage,
      result: output
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await observerDatabase(env).from("extraction_evaluations").insert({
      fixture_id: fixture.id,
      source_url: fixture.eventsUrl,
      technique,
      model: AI_CONFIG.CHAT_MODEL,
      success: false,
      duration_ms: Date.now() - started,
      result: {},
      error: message.slice(0, 4000)
    });
    return {
      fixtureId: fixture.id,
      technique,
      success: false,
      durationMs: Date.now() - started,
      error: message
    };
  }
}
