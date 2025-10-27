import { generateObject } from 'ai';
import { type OpenAIProvider } from '@ai-sdk/openai';
import { AI_CONFIG } from './config/ai';
import { PageExtractZ, type PageExtract } from './schema';

// Uses the AI SDK with OpenAI; swap model/provider if you prefer.
export async function extractFromMarkdown(openai: OpenAIProvider, md: string, url: string): Promise<PageExtract> {
    const { object } = await generateObject({
        model: openai(AI_CONFIG.CHAT_MODEL),
        schema: PageExtractZ,
        prompt:
            `Extract artists (people), galleries/institutions, and events from the Markdown below.
Only include facts explicitly present. Use ISO 8601 for any dates.

URL: ${url}
---
${md.slice(0, 50000)}`
    });

    return object;
}
