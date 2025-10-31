import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import {
    classifyPageKindFromMarkdown,
    getServiceClient,
    selectPagesByIds,
    getPageMarkdownBulk,
    updatePageById,
    type PageUpdate
} from "@shared";

type Params = { pageIds: string[] };

export class ClassifyPage extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const uniqueIds = Array.from(new Set(pageIds));

        if (uniqueIds.length === 0) {
            console.log("[ClassifyPage] No page IDs provided");
            return { processed: 0, classified: 0, eventsTriggered: 0 };
        }

        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        // Load pages to check current classification status (idempotency)
        const pages = await step.do("load-pages", async () => {
            const loaded = await selectPagesByIds(supabase, uniqueIds);
            console.log(`[ClassifyPage] Loaded ${loaded.length} pages`);
            return loaded;
        });

        // Queue-based processing: only classify pages with kind="init"
        const pending = new Set(pages.filter(p => p.kind === "init").map(p => p.id));
        const classificationResults = new Map<string, string>();
        const eventPageIds: string[] = [];
        let waitAttempts = 0;

        console.log(`[ClassifyPage] ${pending.size} pages need classification`);

        while (pending.size > 0) {
            // Check which pending pages have markdown available
            const pendingArray = Array.from(pending);
            const markdownMap = await getPageMarkdownBulk(supabase, pendingArray);

            const ready = pendingArray.filter(id => {
                const md = markdownMap.get(id) ?? "";
                return md.trim().length > 0;
            });

            if (!ready.length) {
                waitAttempts += 1;
                if (waitAttempts > 24) {
                    console.log(`[ClassifyPage] Timeout waiting for markdown for: ${Array.from(pending).join(", ")}`);
                    throw new Error(`Scraping did not produce markdown for ${pending.size} pages`);
                }
                await step.sleep(`wait-markdown-${waitAttempts}`, "5 seconds");
                continue;
            }

            waitAttempts = 0;

            // Process each ready page
            for (const pageId of ready) {
                const page = pages.find(p => p.id === pageId);
                if (!page) continue;

                // Classify the page
                const kind = await step.do(`classify-${pageId}`, async () => {
                    const markdown = markdownMap.get(pageId) ?? "";
                    const url = page.url ?? page.normalized_url;

                    console.log(`[ClassifyPage] Classifying page ${pageId} (${url})`);
                    const classification = await classifyPageKindFromMarkdown(openai, markdown, url);
                    console.log(`[ClassifyPage] Page ${pageId} classified as: ${classification}`);

                    return classification;
                });

                // Update page kind in database
                await step.do(`update-kind-${pageId}`, async () => {
                    const update: PageUpdate = {
                        kind,
                        updated_at: new Date().toISOString()
                    };
                    await updatePageById(supabase, pageId, update);
                    console.log(`[ClassifyPage] Updated page ${pageId} kind to ${kind}`);
                });

                classificationResults.set(pageId, kind);

                // If classified as event, trigger extraction workflow
                if (kind === "event") {
                    await step.do(`trigger-extract-${pageId}`, async () => {
                        console.log(`[ClassifyPage] Triggering ExtractAndEmbedEvents for page ${pageId}`);
                        await this.env.EXTRACT_AND_EMBED_EVENTS.create({
                            params: { pageIds: [pageId] }
                        });
                    });
                    eventPageIds.push(pageId);
                }

                pending.delete(pageId);
            }
        }

        console.log(`[ClassifyPage] Workflow complete`, {
            processed: pages.length,
            classified: classificationResults.size,
            eventsTriggered: eventPageIds.length,
            classifications: Object.fromEntries(classificationResults)
        });

        return {
            processed: pages.length,
            classified: classificationResults.size,
            eventsTriggered: eventPageIds.length,
            eventPageIds
        };
    }
}
