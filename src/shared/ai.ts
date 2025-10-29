import { generateObject } from 'ai';
import type { OpenAIProvider } from '@ai-sdk/openai';
import { AI_CONFIG } from './config/ai';
import { eventExtractionSchema, galleryExtractionSchema, type EventExtraction, type GalleryExtraction } from './schema';

export type ExtractionKind = 'event' | 'gallery';

// Uses the AI SDK with OpenAI; validates output against our Zod schemas
export async function extractFromMarkdown(openai: OpenAIProvider, md: string, url: string, kind: 'event'): Promise<EventExtraction>;
export async function extractFromMarkdown(openai: OpenAIProvider, md: string, url: string, kind: 'gallery'): Promise<GalleryExtraction>;
export async function extractFromMarkdown(openai: OpenAIProvider, md: string, url: string, kind: ExtractionKind): Promise<EventExtraction | GalleryExtraction> {
    const schema = kind === 'event' ? eventExtractionSchema : galleryExtractionSchema;

    const prompt = kind === 'event'
        ? `Extract event information from the Markdown below and return a JSON object matching the event extraction schema. Only include facts explicitly present. Use ISO 8601 for any dates.

URL: ${url}
---
${md.slice(0, 50000)}`
        : `Extract gallery information (name, about, address, timezone, contacts, social, tags, weekly hours and exceptions if present) from the Markdown below and return a JSON object matching the gallery extraction schema. Only include facts explicitly present.

URL: ${url}
---
${md.slice(0, 50000)}`;

    const { object } = await generateObject({
        model: openai(AI_CONFIG.CHAT_MODEL),
        schema,
        prompt,
    });

    // `generateObject` already validates against the schema; cast return type by `kind`
    return object as EventExtraction | GalleryExtraction;
}
