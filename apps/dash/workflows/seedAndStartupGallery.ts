import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import {
    extractOpeningHoursFromText,
    getServiceClient,
    normalizeUrl,
    selectPagesByGallery,
    upsertGallery,
    upsertGalleryInfo,
    upsertGalleryPage,
    upsertGalleryHours,
    type GalleryHoursInsert,
    type GalleryInsert,
    type GalleryInfoInsert,
    type PageInsert
} from "@shared";

type Params = {
    mainUrl: string;
    aboutUrl?: string | null;
    eventsUrl?: string | null;
    name?: string | null;
    address?: string | null;
    instagram?: string | null;
    googleMapsUrl?: string | null;
    openingHours?: string | null;
};

/**
 * Orchestrates the full gallery startup process by chaining existing workflows:
 * 1. Seeds the gallery (creates records, triggers scraping, discovers links)
 * 2. Waits for scraping to complete
 * 3. Extracts gallery information (which automatically triggers embedding)
 * 4. Extracts opening hours if provided
 */
export class SeedAndStartupGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl, eventsUrl, name, address, instagram, googleMapsUrl, openingHours } = event.payload;

        console.log(`[SeedAndStartupGallery] Starting full gallery startup - name: ${name ?? 'none'}, main: ${mainUrl}`);

        const supabase = getServiceClient(this.env);

        // STEP 1: Upsert gallery and create pages (inlined from SeedGallery)
        const normalizedMainUrl = normalizeUrl(mainUrl);
        const normalizedAboutUrl = aboutUrl ? normalizeUrl(aboutUrl) : null;
        const normalizedEventsUrl = eventsUrl ? normalizeUrl(eventsUrl) : null;
        const pagesToScrape: string[] = [];
        const seededPages: Array<{ pageId: string; url: string }> = [];
        const seenNormalized = new Set<string>();

        const galleryId = await step.do("upsert-gallery", async () => {
            const galleryRecord: GalleryInsert = {
                main_url: mainUrl,
                about_url: aboutUrl ?? null,
                events_page: eventsUrl ?? null,
                normalized_main_url: normalizedMainUrl,
            };
            const gallery = await upsertGallery(supabase, galleryRecord);
            console.log(`[SeedAndStartupGallery] Gallery created/updated: ${gallery.id}`);
            return gallery.id;
        });

        await step.do("upsert-gallery-info", async () => {
            const galleryInfoRecord: GalleryInfoInsert = {
                gallery_id: galleryId,
                name: name ?? null,
                address: address ?? null,
                instagram: instagram ?? null,
                google_maps_url: googleMapsUrl ?? null,
                data: {},
            };
            await upsertGalleryInfo(supabase, galleryInfoRecord);
            console.log(`[SeedAndStartupGallery] Gallery info created/updated`);
        });

        // Create page records
        const pageDefinitions: Array<{ label: string; inputUrl: string; normalized: string | null; kind: PageInsert["kind"] }> = [
            { label: "main", inputUrl: mainUrl, normalized: normalizedMainUrl, kind: "gallery_main" },
        ];

        if (aboutUrl && normalizedAboutUrl) {
            pageDefinitions.push({ label: "about", inputUrl: aboutUrl, normalized: normalizedAboutUrl, kind: "gallery_about" });
        }
        if (eventsUrl && normalizedEventsUrl) {
            pageDefinitions.push({ label: "events", inputUrl: eventsUrl, normalized: normalizedEventsUrl, kind: "event_list" });
        }

        for (const definition of pageDefinitions) {
            if (!definition.normalized) continue;
            if (seenNormalized.has(definition.normalized)) {
                console.log(`[SeedAndStartupGallery] Skipping ${definition.label} page - already processed`);
                continue;
            }
            seenNormalized.add(definition.normalized);

            const pageId = await step.do(`upsert-page-${definition.label}`, async () => {
                const page: PageInsert = {
                    gallery_id: galleryId,
                    url: definition.inputUrl,
                    normalized_url: definition.normalized!,
                    kind: definition.kind,
                    fetch_status: "never",
                };
                const pageId = await upsertGalleryPage(supabase, page);
                console.log(`[SeedAndStartupGallery] Upserted ${definition.label} page: ${pageId}`);
                return pageId ?? null;
            });

            if (pageId) {
                pagesToScrape.push(pageId);
                seededPages.push({ pageId, url: definition.inputUrl });
            }
        }

        // Trigger scraping and link discovery
        if (pagesToScrape.length > 0) {
            await step.do("trigger-scrape-pages", async () => {
                console.log(`[SeedAndStartupGallery] Triggering scrape for ${pagesToScrape.length} pages`);
                await this.env.SCRAPE_PAGES.create({ params: { pageIds: pagesToScrape } });
            });

            await step.do("trigger-discover-links", async () => {
                const seedUrls = Array.from(new Set(seededPages.map(entry => entry.url)));
                if (seedUrls.length === 0) {
                    console.log("[SeedAndStartupGallery] No seed URLs for discovery");
                    return;
                }
                console.log(`[SeedAndStartupGallery] Triggering DiscoverLinks with ${seedUrls.length} URLs`);
                await this.env.DISCOVER_LINKS.create({ params: { galleryId, listUrls: seedUrls } });
            });
        }

        // STEP 2: Wait for pages to scrape (best effort - don't block on failures)
        const scrapingResult = await step.do("await-gallery-scrape", async () => {
            const maxAttempts = 24;
            let pendingKinds: Set<"gallery_main" | "gallery_about"> | null = null;
            const failures: string[] = [];

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const pages = await selectPagesByGallery(supabase, galleryId);
                const galleryPages = pages.filter(p => p.kind === "gallery_main" || p.kind === "gallery_about");

                if (!galleryPages.length) {
                    await step.sleep(`wait-gallery-scrape-${attempt}`, "5 seconds");
                    continue;
                }

                if (!pendingKinds) {
                    pendingKinds = new Set(galleryPages.map(page => page.kind as "gallery_main" | "gallery_about"));
                }

                // Track failures but don't throw - we'll try extraction with whatever we have
                galleryPages.forEach(page => {
                    if (page.fetch_status === "error") {
                        const failureKey = `${page.kind}:${page.id}`;
                        if (!failures.includes(failureKey)) {
                            failures.push(failureKey);
                            console.log(`[SeedAndStartupGallery] Page scrape failed: ${page.kind} (${page.id})`);
                        }
                    } else if (page.fetch_status === "ok") {
                        pendingKinds?.delete(page.kind as "gallery_main" | "gallery_about");
                    }
                });

                // Success: all pages scraped
                if (pendingKinds && pendingKinds.size === 0) {
                    console.log("[SeedAndStartupGallery] All gallery pages scraped successfully");
                    return { success: true, failures: [] };
                }

                await step.sleep(`wait-gallery-scrape-${attempt}`, "5 seconds");
            }

            // Timeout or partial failure - proceed anyway with what we have
            const message = failures.length > 0
                ? `Some pages failed: ${failures.join(", ")}`
                : "Timed out waiting for pages";
            console.log(`[SeedAndStartupGallery] ${message} - proceeding with extraction anyway`);
            return { success: false, failures, message };
        });

        // STEP 4: Trigger ExtractGallery workflow
        // This will extract gallery info and automatically trigger embedding
        await step.do("trigger-extract-gallery", async () => {
            console.log(`[SeedAndStartupGallery] Triggering ExtractGallery for gallery ${galleryId}`);
            const run = await this.env.EXTRACT_GALLERY.create({
                params: { galleryId }
            });
            console.log(`[SeedAndStartupGallery] ExtractGallery workflow triggered: ${run.id ?? run}`);
            return run.id ?? run;
        });

        // STEP 5: Extract and save opening hours if provided (best effort - don't fail workflow)
        let hoursExtracted = false;
        let hoursError: string | null = null;
        if (openingHours?.trim()) {
            const hoursResult = await step.do("extract-opening-hours", async () => {
                try {
                    console.log(`[SeedAndStartupGallery] Extracting opening hours for gallery ${galleryId}`);
                    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

                    const extracted = await extractOpeningHoursFromText(openai, openingHours);
                    console.log(`[SeedAndStartupGallery] Extracted ${extracted.hours.length} days of hours`);

                    const hoursToInsert: GalleryHoursInsert[] = extracted.hours.map(day => ({
                        gallery_id: galleryId,
                        weekday: day.weekday,
                        open_minutes: day.open_minutes
                    }));

                    await upsertGalleryHours(supabase, hoursToInsert);
                    console.log(`[SeedAndStartupGallery] Successfully saved opening hours for gallery ${galleryId}`);

                    return { success: true, error: null };
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`[SeedAndStartupGallery] Failed to extract hours: ${errorMsg}`);
                    return { success: false, error: errorMsg };
                }
            });
            hoursExtracted = hoursResult.success;
            hoursError = hoursResult.error;
        }

        const resultMessage = [
            'seeded',
            'extracted',
            'embedding triggered',
            hoursExtracted ? 'hours extracted' : (hoursError ? `hours failed: ${hoursError}` : null)
        ].filter(Boolean).join(', ');

        console.log(`[SeedAndStartupGallery] Complete - gallery ${galleryId}: ${resultMessage}`);

        return {
            galleryId,
            extracted: true,
            hoursExtracted,
            scrapingSuccess: scrapingResult.success,
            scrapingFailures: scrapingResult.failures
        };
    }
}
