import {
  createOpenRouter,
  type OpenRouterProvider
} from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { AI_CONFIG } from "../config/ai";

export type ZineModelProvider = Pick<OpenRouterProvider, "textEmbeddingModel"> &
  ((modelId: string) => ReturnType<OpenRouterProvider>);

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

export function createZineLanguageModel(apiKey: string): LanguageModel {
  return createZineProvider(apiKey)(AI_CONFIG.CHAT_MODEL);
}
