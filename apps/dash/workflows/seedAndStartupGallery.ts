import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

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
        const galleryId = await step.do("trigger-seed-gallery", async () => {
            console.log("[SeedAndStartupGallery] Triggering SeedGallery workflow");
            const run = await this.env.SEED_GALLERY.create({
                params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram }
            });
            const id = run.id ?? run;
            console.log(`[SeedAndStartupGallery] SeedGallery workflow triggered: ${id}`);
            return id;
        });

        // STEP 2: Wait for scraping to complete
        // SeedGallery triggers SCRAPE_PAGES, so we give it time to finish
        await step.sleep("wait-for-scraping", "45 seconds");

        // STEP 3: Trigger ExtractGallery workflow
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
        return { galleryId };
    }
}
