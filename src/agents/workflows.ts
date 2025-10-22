import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import Cloudflare from "cloudflare";

export interface ScrapeParams {
    galleryId: string;
    url: string;
}

/**
 * ScrapeWorkflow handles the async scraping task for a single gallery
 * Each GalleryAgent triggers its own instance of this workflow
 */
export class ScrapeWorkflow extends WorkflowEntrypoint<Env> {
    async run(event: WorkflowEvent<ScrapeParams>, step: WorkflowStep) {
        const { galleryId, url } = event.payload;

        console.log(`[ScrapeWorkflow:${event.instanceId}] Starting scrape for gallery: ${galleryId}`);
        console.log(`[ScrapeWorkflow:${event.instanceId}] URL: ${url}`);

        // Step 1: Fetch the HTML content using Browser Rendering Content API
        const fetchResult = await step.do("fetch-html", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Fetching URL with Browser Rendering: ${url}`);

            try {
                // Initialize Cloudflare client
                // API token is automatically picked up from Cloudflare Workers context
                const client = new Cloudflare();

                // Use the Browser Rendering /content endpoint
                // This returns the fully rendered HTML after JavaScript execution
                const content = await client.browserRendering.content.create({
                    account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
                    url: url,
                });

                console.log(`[ScrapeWorkflow:${event.instanceId}] Rendered ${content.length} characters`);

                return {
                    ok: true,
                    html: content,
                    htmlLength: content.length
                };
            } catch (error) {
                console.error(`[ScrapeWorkflow:${event.instanceId}] Browser rendering error:`, error);
                return {
                    ok: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                    html: "",
                    htmlLength: 0
                };
            }
        });

        // Step 2: Update the GalleryAgent with the result
        await step.do("update-agent", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Updating GalleryAgent: ${galleryId}`);

            const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);
            await galleryAgent.updateScrapingResult(
                fetchResult.htmlLength,
                fetchResult.ok ? undefined : fetchResult.error
            );

            return { ok: true };
        });

        // Step 3: (Future) Parse and extract events from HTML
        // This step can be added later for AI-powered extraction
        // const events = await step.do("extract-events", async () => {
        //     if (!fetchResult.ok) return [];
        //     // Use AI to extract events from fetchResult.html
        //     return [];
        // });

        console.log(`[ScrapeWorkflow:${event.instanceId}] Workflow completed`);

        return {
            galleryId,
            url,
            ok: fetchResult.ok,
            htmlLength: fetchResult.htmlLength,
            error: fetchResult.ok ? undefined : fetchResult.error,
            completedAt: Date.now()
        };
    }
}


