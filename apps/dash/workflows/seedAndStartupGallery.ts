import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient, normalizeUrl, selectPagesByGallery } from "@shared";

type Params = {
    mainUrl: string;
    aboutUrl?: string | null;
    eventsUrl?: string | null;
    name?: string | null;
    address?: string | null;
    instagram?: string | null;
};

/**
 * Orchestrates the full gallery startup process by chaining existing workflows:
 * 1. Seeds the gallery (creates records, triggers scraping, discovers links)
 * 2. Waits for scraping to complete
 * 3. Extracts gallery information (which automatically triggers embedding)
 */
export class SeedAndStartupGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl, eventsUrl, name, address, instagram } = event.payload;

        console.log(`[SeedAndStartupGallery] Starting full gallery startup - name: ${name ?? 'none'}, main: ${mainUrl}`);

        // STEP 1: Trigger SeedGallery workflow
        await step.do("trigger-seed-gallery", async () => {
            console.log("[SeedAndStartupGallery] Triggering SeedGallery workflow");
            const run = await this.env.SEED_GALLERY.create({
                params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram }
            });
            const workflowId = run.id ?? run;
            console.log(`[SeedAndStartupGallery] SeedGallery workflow triggered: ${workflowId}`);
            return workflowId;
        });

        // STEP 2: Look up the gallery ID from the database
        const supabase = getServiceClient(this.env);
        const galleryId = await step.do("lookup-gallery-id", async () => {
            const normalizedUrl = normalizeUrl(mainUrl);
            const { data, error } = await supabase
                .from("galleries")
                .select("id")
                .eq("normalized_main_url", normalizedUrl)
                .maybeSingle();

            if (error || !data) {
                throw new Error(`Failed to find gallery with URL ${normalizedUrl}: ${error?.message ?? 'not found'}`);
            }

            console.log(`[SeedAndStartupGallery] Found gallery ID: ${data.id} for URL ${normalizedUrl}`);
            return data.id;
        });

        // STEP 3: Wait for scraping to complete
        // SeedGallery triggers SCRAPE_PAGES, so we give it time to finish
        await step.sleep("wait-for-scraping", "60 seconds");

        // STEP 4: Check if any pages were successfully scraped
        const scrapedPages = await step.do("check-scraping-status", async () => {
            const pages = await selectPagesByGallery(supabase, galleryId);
            const galleryPages = pages.filter(p => p.kind === "gallery_main" || p.kind === "gallery_about");
            const successfulPages = galleryPages.filter(p => p.fetch_status === "ok");

            console.log(`[SeedAndStartupGallery] Gallery pages: ${galleryPages.length}, Successfully scraped: ${successfulPages.length}`);
            galleryPages.forEach(p => {
                console.log(`[SeedAndStartupGallery] Page ${p.id} kind=${p.kind} status=${p.fetch_status} url=${p.url ?? p.normalized_url}`);
            });

            return successfulPages;
        });

        if (scrapedPages.length === 0) {
            console.log(`[SeedAndStartupGallery] No pages were successfully scraped for gallery ${galleryId}, skipping extraction`);
            return { galleryId, extracted: false, reason: "No pages scraped successfully" };
        }

        // STEP 5: Trigger ExtractGallery workflow
        // This will extract gallery info and automatically trigger embedding
        await step.do("trigger-extract-gallery", async () => {
            console.log(`[SeedAndStartupGallery] Triggering ExtractGallery for gallery ${galleryId}`);
            const run = await this.env.EXTRACT_GALLERY.create({
                params: { galleryId }
            });
            console.log(`[SeedAndStartupGallery] ExtractGallery workflow triggered: ${run.id ?? run}`);
            return run.id ?? run;
        });

        console.log(`[SeedAndStartupGallery] Complete - gallery ${galleryId} seeded, extracted, and embedding triggered`);
        return { galleryId, extracted: true };
    }
}
