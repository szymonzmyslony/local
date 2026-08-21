import {
  createOpenRouter,
  type OpenRouterProvider
} from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { AI_CONFIG } from "../config/ai";

export type ZineModelProvider = OpenRouterProvider;

export function createZineProvider(apiKey: string): OpenRouterProvider {
  if (!apiKey.trim()) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  return createOpenRouter({
    apiKey,
    appName: "Zine Local",
    appUrl: "https://zinelocal.com",
    compatibility: "strict"
  });
}

export function createZineLanguageModelFromProvider(
  provider: ZineModelProvider
): LanguageModel {
  return provider(AI_CONFIG.CHAT_MODEL, {
    models: [AI_CONFIG.CHAT_MODEL, ...AI_CONFIG.CHAT_FALLBACK_MODELS],
    plugins: [{ id: "response-healing" }]
  });
}

export function createZineLanguageModel(apiKey: string): LanguageModel {
  return createZineLanguageModelFromProvider(createZineProvider(apiKey));
}

export function createZineFallbackLanguageModel(apiKey: string): LanguageModel {
  return createZineProvider(apiKey)(AI_CONFIG.CHAT_FALLBACK_MODELS[0], {
    plugins: [{ id: "response-healing" }]
  });
}
