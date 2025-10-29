import { generateObject } from "ai";
import { z } from "zod";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { AI_CONFIG } from "./config/ai";
import {
    galleryExtractionSchema,
    pageExtractionSchema,
    eventExtractionSchema,
    type GalleryExtraction,
    type PageExtraction,
    type EventExtraction
} from "./schema";

const MAX_MD_LENGTH = 50_000;

const pageKindSchema = z.object({
    kind: z.enum(["gallery_main", "gallery_about", "event_list", "event_detail", "other", "event_candidate"]).describe("Predicted page_kind classification")
});

export async function classifyPageKindFromMarkdown(openai: OpenAIProvider, md: string, url: string): Promise<z.infer<typeof pageKindSchema>["kind"]> {
    const { object } = await generateObject({
        model: openai(AI_CONFIG.CHAT_MODEL),
        schema: pageKindSchema,
        prompt: [
            "Classify the Markdown content below into one of the following page kinds:",
            "- gallery_main (home/landing page for the gallery)",
            "- gallery_about (about/biography page for the gallery)",
            "- event_list (lists multiple events or programs)",
            "- event_detail (describes a single event in detail)",
            "- other (any other supporting page)",
            "- event_candidate (unclear, likely contains navigation or needs manual review)",
            "",
            "Return ONLY the classification string in the schema.",
            "",
            `URL: ${url}`,
            "---",
            md.slice(0, MAX_MD_LENGTH)
        ].join("\n")
    });

    return object.kind;
}

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
            schema: eventExtractionSchema,
            prompt: [
                "You are given Markdown content for a page that describes a *single* event.",
                "Extract structured event information matching the event extraction schema.",
                "Only include facts explicitly present in the content.",
                "",
                `URL: ${url}`,
                "---",
                md.slice(0, MAX_MD_LENGTH)
            ].join("\n")
        });

        return { type: "event_detail", payload: object };
    } catch (error) {
        console.error("[extractPageContentFromMarkdown] Failed to generate object", {
            url,
            markdownLength: md.length,
            error
        });
        throw error;
    }
}
