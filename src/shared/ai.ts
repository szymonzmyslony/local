import { generateObject } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { AI_CONFIG } from "./config/ai";
import {
    galleryExtractionSchema,
    pageExtractionSchema,
    type GalleryExtraction,
    type PageExtraction
} from "./schema";

const MAX_MD_LENGTH = 50_000;

export async function extractGalleryInfoFromMarkdown(openai: OpenAIProvider, md: string, url: string): Promise<GalleryExtraction> {
    try {
        const { object } = await generateObject({
            model: openai(AI_CONFIG.CHAT_MODEL),
            schema: galleryExtractionSchema,
            prompt: [
                "Extract gallery information (name, about, address, timezone, contacts, socials, tags, weekly hours and exceptions if present) from the Markdown below.",
                "Return a JSON object matching the gallery extraction schema.",
                "Only include facts explicitly present in the content.",
                "",
                `URL: ${url}`,
                "---",
                md.slice(0, MAX_MD_LENGTH)
            ].join("\n")
        });

        return object;
    } catch (error) {
        console.error("[extractGalleryInfoFromMarkdown] Failed to generate object", {
            url,
            markdownLength: md.length,
            error
        });
        throw error;
    }
}

export async function extractPageContentFromMarkdown(openai: OpenAIProvider, md: string, url: string): Promise<PageExtraction> {
    try {
        const { object } = await generateObject({
            model: openai(AI_CONFIG.CHAT_MODEL),
            schema: pageExtractionSchema,
            prompt: [
                "Analyse the Markdown content below and determine what type of gallery page it represents.",
                "Classify it as one of: gallery_main, gallery_about, event_list, event_detail, other.",
                "If it is an event detail page, extract the full event payload using the provided schema.",
                "Return a JSON object that strictly matches the page extraction schema.",
                "Only include facts explicitly present in the content.",
                "",
                `URL: ${url}`,
                "---",
                md.slice(0, MAX_MD_LENGTH)
            ].join("\n")
        });

        return object;
    } catch (error) {
        const schemaDef = (pageExtractionSchema as unknown as { _def?: { options?: unknown[] } })._def;
        const schemaCandidates = schemaDef?.options?.map(option => {
            const asAny = option as { shape?: Record<string, { value?: string }> };
            return asAny?.shape?.type?.value ?? "unknown";
        }) ?? [];

        console.error("[extractPageContentFromMarkdown] Failed to generate object", {
            url,
            markdownLength: md.length,
            allowedTypes: schemaCandidates,
            error
        });
        throw error;
    }
}
