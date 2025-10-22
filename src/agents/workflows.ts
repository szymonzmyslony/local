import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import Cloudflare from "cloudflare";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { PageClassificationSchema, GallerySchema, EventSchema, type PageClassification, type Gallery, type Event } from "../schema";

type CorrectScrapeResponseItem = {
    selector: string;
    results: Array<{
        html: string;
        text: string;
        attributes: Array<{ name: string; value: string }>;
        height: number;
        width: number;
        top: number;
        left: number;
    }>;
};

type CorrectScrapeResponse = CorrectScrapeResponseItem[];

export interface ScrapeParams {
    galleryId: string;
    url: string;
    maxDepth?: number;
    concurrency?: number;
}

interface CrawledPage {
    url: string;
    depth: number;
    links: string[];
}

interface ClassifiedPage extends CrawledPage {
    classification: PageClassification;
    content: string;
}

export class ScrapeWorkflow extends WorkflowEntrypoint<Env> {
    private client: Cloudflare;

    constructor(ctx: ExecutionContext, env: Env) {
        super(ctx, env);
        this.client = new Cloudflare();
    }

    async run(event: WorkflowEvent<ScrapeParams>, step: WorkflowStep) {
        const { galleryId, url, maxDepth = 2, concurrency = 50 } = event.payload;

        console.log(`[ScrapeWorkflow:${event.instanceId}] Starting scrape for gallery: ${galleryId}`);
        console.log(`[ScrapeWorkflow:${event.instanceId}] URL: ${url}, maxDepth: ${maxDepth}, concurrency: ${concurrency}`);

        const crawlResults = await step.do("crawl-links", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Step 1: Crawling links...`);
            const results = await this.crawlRecursive(url, maxDepth, concurrency);
            console.log(`[ScrapeWorkflow:${event.instanceId}] Found ${results.size} unique URLs`);
            return results;
        });

        const classified = await step.do("classify-pages", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Step 2: Classifying ${crawlResults.size} pages...`);
            const results = await this.classifyPages(crawlResults, concurrency);
            const eventPages = Array.from(results.values()).filter(r => r.classification === 'event').length;
            const generalPages = Array.from(results.values()).filter(r => r.classification === 'general').length;
            const otherPages = Array.from(results.values()).filter(r => r.classification === 'other').length;
            console.log(`[ScrapeWorkflow:${event.instanceId}] Classification: ${eventPages} event, ${generalPages} general, ${otherPages} other`);
            return results;
        });

        const extracted = await step.do("extract-data", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Step 3: Extracting structured data...`);
            const results = await this.extractGalleryData(classified);
            console.log(`[ScrapeWorkflow:${event.instanceId}] Extracted gallery:`, JSON.stringify(results.gallery, null, 2));
            console.log(`[ScrapeWorkflow:${event.instanceId}] Extracted ${results.events.length} events`);
            results.events.forEach((event, i) => {
                console.log(`[ScrapeWorkflow:] Event ${i + 1}:`, JSON.stringify(event, null, 2));
            });
            return results;
        });

        await step.do("update-agent", async () => {
            console.log(`[ScrapeWorkflow:${event.instanceId}] Step 4: Updating agent state...`);
            const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);
            await galleryAgent.updateScrapingResult({
                gallery: extracted.gallery,
                events: extracted.events,
                timestamp: Date.now()
            });
            console.log(`[ScrapeWorkflow:${event.instanceId}] Agent state updated`);
        });

        console.log(`[ScrapeWorkflow:${event.instanceId}] Workflow completed successfully`);

        return {
            galleryId,
            url,
            ok: true,
            gallery: extracted.gallery,
            events: extracted.events,
            pagesScraped: crawlResults.size,
            completedAt: Date.now()
        };
    }

    async crawlRecursive(startUrl: string, maxDepth: number, concurrency: number): Promise<Map<string, CrawledPage>> {
        const visited = new Set<string>();
        const results = new Map<string, CrawledPage>();
        const queue = [{ url: startUrl, depth: 0 }];

        console.log(`[Crawl] Starting from: ${startUrl}`);

        while (queue.length > 0) {
            const batch = queue.splice(0, concurrency);
            console.log(`[Crawl] Processing batch of ${batch.length} URLs, ${queue.length} remaining in queue`);

            await Promise.all(batch.map(async ({ url, depth }) => {
                if (visited.has(url)) return;
                visited.add(url);

                console.log(`[Crawl] Depth ${depth}: Fetching links from ${url}`);

                const links = await this.client.browserRendering.links.create({
                    account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
                    url: url,
                    excludeExternalLinks: true,
                    visibleLinksOnly: true
                });

                console.log(`[Crawl] Found ${links.length} links at ${url}`);

                results.set(url, { url, depth, links });

                if (depth < maxDepth) {
                    for (const link of links) {
                        if (!visited.has(link)) {
                            queue.push({ url: link, depth: depth + 1 });
                        }
                    }
                }
            }));
        }

        console.log(`[Crawl] Completed: ${results.size} total URLs discovered`);
        return results;
    }

    async classifyPages(crawlResults: Map<string, CrawledPage>, concurrency: number): Promise<Map<string, ClassifiedPage>> {
        const urls = Array.from(crawlResults.keys());
        const classified = new Map<string, ClassifiedPage>();
        console.log(`[Classify] Starting classification for ${urls.length} pages`);

        for (let i = 0; i < urls.length; i += concurrency) {
            const chunk = urls.slice(i, i + concurrency);
            console.log(`[Classify] Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(urls.length / concurrency)} (${chunk.length} pages)`);

            await Promise.all(chunk.map(async (url) => {
                const crawled = crawlResults.get(url)!;

                console.log(`[Classify] Scraping content for: ${url}`);
                const scraped = await this.client.browserRendering.scrape.create({
                    account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
                    url: url,
                    elements: [
                        { selector: 'main' },
                        { selector: 'article' },
                        { selector: 'section' },
                        { selector: 'nav' },
                        { selector: 'h1, h2, h3' },
                        { selector: 'time, [datetime]' },
                        { selector: '[class*="event"]' },
                        { selector: '[class*="exhibition"]' },
                        { selector: '[class*="show"]' },
                        { selector: '[class*="gallery"]' }
                    ]
                }) as unknown as CorrectScrapeResponse;

                const content = scraped
                    .flatMap(item => item.results)
                    .map(r => r.html || r.text)
                    .join('\n\n');

                console.log(`[Classify] Content scraped (${content.length} chars), classifying...`);
                const { object } = await generateObject({
                    model: openai('gpt-5'),
                    schema: PageClassificationSchema,
                    prompt: `Classify this webpage content from a gallery website.

URL: ${url}
Content preview: ${content.substring(0, 2000)}

Classify as:
- "event": Pages about specific exhibitions, openings, receptions, talks, or workshops
- "general": General gallery information (about, contact, artists, etc.)
- "other": Anything else (press, shop, etc.)`,
                });

                console.log(`[Classify] ${url} -> ${object.classification}`);

                classified.set(url, {
                    ...crawled,
                    classification: object.classification,
                    content
                });
            }));
        }

        console.log(`[Classify] Classification complete`);
        return classified;
    }

    async extractGalleryData(classified: Map<string, ClassifiedPage>): Promise<{
        gallery: Gallery;
        events: Event[];
    }> {
        const generalPages = Array.from(classified.values())
            .filter(r => r.classification === 'general')
            .sort((a, b) => a.depth - b.depth);

        console.log(`[Extract] Found ${generalPages.length} general pages for gallery info extraction`);

        const concatenatedContent = generalPages
            .map(page => `=== ${page.url} ===\n${page.content.substring(0, 10000)}`)
            .join('\n\n');

        console.log(`[Extract] Extracting gallery info from ${generalPages.length} general pages (total content: ${concatenatedContent.length} chars)`);
        const galleryStartTime = Date.now();
        const { object: gallery } = await generateObject({
            model: openai('gpt-5'),
            schema: GallerySchema,
            prompt: `Extract gallery information from these gallery pages:\n\n${concatenatedContent}`
        });
        const galleryDuration = Date.now() - galleryStartTime;
        console.log(`[Extract] Gallery extracted: ${gallery.name || 'unnamed'} (took ${galleryDuration}ms)`);

        const eventPages = Array.from(classified.values())
            .filter(r => r.classification === 'event');

        console.log(`[Extract] Found ${eventPages.length} event pages for event extraction`);

        const events: Event[] = [];
        for (const page of eventPages) {
            const contentLength = page.content.length;
            const truncatedLength = Math.min(contentLength, 50000);
            console.log(`[Extract] Extracting events from: ${page.url} (content: ${contentLength} chars, using: ${truncatedLength} chars)`);

            const startTime = Date.now();
            const { object } = await generateObject({
                model: openai('gpt-5'),
                schema: z.object({ events: z.array(EventSchema) }),
                prompt: `Extract all events from this gallery page content. Include exhibitions, openings, receptions, talks, and workshops:\n\n${page.content.substring(0, 50000)}`
            });
            const duration = Date.now() - startTime;

            console.log(`[Extract] Extracted ${object.events.length} events from ${page.url} (took ${duration}ms)`);
            events.push(...object.events);
        }

        console.log(`[Extract] Total events extracted: ${events.length}`);
        return { gallery, events };
    }
}
