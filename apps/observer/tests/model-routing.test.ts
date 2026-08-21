import {
  AI_CONFIG,
  createBatchEmbedder,
  createZineLanguageModel
} from "@gallery-agents/shared";
import { describe, expect, it } from "vitest";

describe("OpenRouter model routing", () => {
  it("uses Ox Alpha first and Luna as the explicit fallback", () => {
    const model = createZineLanguageModel("test-api-key") as unknown as {
      modelId: string;
      settings: { models?: string[]; plugins?: Array<{ id: string }> };
    };

    expect(AI_CONFIG.CHAT_MODEL).toBe("stealth/ox-alpha");
    expect(AI_CONFIG.CHAT_FALLBACK_MODELS).toEqual([
      "openai/gpt-5.6-luna"
    ]);
    expect(model.modelId).toBe(AI_CONFIG.CHAT_MODEL);
    expect(model.settings.models).toEqual([
      AI_CONFIG.CHAT_MODEL,
      ...AI_CONFIG.CHAT_FALLBACK_MODELS
    ]);
    expect(model.settings.plugins).toEqual([{ id: "response-healing" }]);
  });

  it("preserves empty positions without making an embedding request", async () => {
    await expect(createBatchEmbedder("test-api-key")(["", "  "])).resolves.toEqual([
      [],
      []
    ]);
  });
});
