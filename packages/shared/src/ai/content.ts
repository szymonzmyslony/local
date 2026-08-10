import { generateText, Output } from "ai";
import { z } from "zod";
import { AI_CONFIG } from "../config/ai";
import type { ZineModelProvider } from "./provider";
import {
    galleryExtractionSchema,
    eventExtractionSchema,
    openingHoursExtractionSchema,
    type GalleryExtraction,
    type PageExtraction,
    type OpeningHoursExtraction
} from "../schema";
import { Constants } from "../types/database_types";

const MAX_MD_LENGTH = 50_000;

const pageKindSchema = z.object({
    kind: z.enum(Constants.public.Enums.page_kind).describe("Predicted page_kind classification")
});

export async function classifyPageKindFromMarkdown(provider: ZineModelProvider, md: string, url: string): Promise<z.infer<typeof pageKindSchema>["kind"]> {
    const { output } = await generateText({
        model: provider(AI_CONFIG.CHAT_MODEL),
        output: Output.object({ schema: pageKindSchema }),
        prompt: [
            "Classify the Markdown content below into one of the following page kinds:",
            "- gallery_main (home/landing page for the gallery)",
            "- gallery_about (about/biography page for the gallery)",
            "- event (describes a single event in detail)",
            "- event_list (lists multiple events or programs)",
            "- other (any other page)",
            "",
            "Return ONLY the classification string in the schema.",
            "",
            `URL: ${url}`,
            "---",
            md.slice(0, MAX_MD_LENGTH)
        ].join("\n")
    });

    return output.kind;
}

export async function extractGalleryInfoFromMarkdown(provider: ZineModelProvider, md: string, url: string, seededAddress?: string | null): Promise<GalleryExtraction> {
    try {
        const promptParts = [
            "Extract gallery information (name, about, London area, contacts, socials, tags, weekly hours and exceptions if present) from the Markdown below.",
            "Return a JSON object matching the gallery extraction schema.",
            "Only include facts explicitly present in the content.",
            "",
            "For area: extract the London area, borough, or neighbourhood stated in the source.",
        ];

        if (seededAddress) {
            promptParts.push("", `Seeded address (use this to help determine the district): ${seededAddress}`);
        }

        promptParts.push("", `URL: ${url}`, "---", md.slice(0, MAX_MD_LENGTH));

        const { output } = await generateText({
            model: provider(AI_CONFIG.CHAT_MODEL),
            output: Output.object({ schema: galleryExtractionSchema }),
            prompt: promptParts.join("\n")
        });

        return output;
    } catch (error) {
        console.error("[extractGalleryInfoFromMarkdown] Failed to generate object", {
            url,
            markdownLength: md.length,
            error
        });
        throw error;
    }
}

export async function extractPageContentFromMarkdown(provider: ZineModelProvider, md: string, url: string): Promise<PageExtraction> {
    try {
        const { output } = await generateText({
            model: provider(AI_CONFIG.CHAT_MODEL),
            output: Output.object({ schema: eventExtractionSchema }),
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

        return { type: "event", payload: output };
    } catch (error) {
        console.error("[extractPageContentFromMarkdown] Failed to generate object", {
            url,
            markdownLength: md.length,
            error
        });
        throw error;
    }
}

export async function extractOpeningHoursFromText(provider: ZineModelProvider, hoursText: string): Promise<OpeningHoursExtraction> {
    try {
        const { output } = await generateText({
            model: provider(AI_CONFIG.CHAT_MODEL),
            output: Output.object({ schema: openingHoursExtractionSchema }),
            prompt: [
                "You are given text describing gallery/museum opening hours in Polish.",
                "Extract structured opening hours for each day of the week.",
                "",
                "IMPORTANT RULES:",
                "- Weekday numbers: 0=Niedziela (Sunday), 1=Poniedziałek (Monday), 2=Wtorek (Tuesday), 3=Środa (Wednesday), 4=Czwartek (Thursday), 5=Piątek (Friday), 6=Sobota (Saturday)",
                "- Convert times to minutes from midnight (e.g., 12:00 = 720, 19:00 = 1140)",
                "- If a day is closed (\"nieczynne\"), include it with an empty array for open_minutes",
                "- Handle ranges like 'Środa - Piątek' by creating entries for each day in the range",
                "- Handle special notes like 'on appointment' by treating the day as closed (empty array)",
                "- Always include all 7 days of the week in the output",
                "",
                "Opening hours text:",
                hoursText
            ].join("\n")
        });

        return output;
    } catch (error) {
        console.error("[extractOpeningHoursFromText] Failed to generate object", {
            hoursText,
            error
        });
        throw error;
    }
}
