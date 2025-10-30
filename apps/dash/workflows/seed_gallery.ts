import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { normalizeUrl } from "./utils/normalizeUrl";
import {
    getServiceClient,
    upsertGallery,
    upsertGalleryPage
} from "@shared";
import type { GalleryInsert, PageInsert } from "@shared";

type Params = { mainUrl: string; aboutUrl?: string | null; eventsUrl?: string | null };

export class SeedGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl, eventsUrl } = event.payload;
        const normalized_main_url = normalizeUrl(mainUrl);
        const normalized_about_url = aboutUrl ? normalizeUrl(aboutUrl) : null;
        const normalized_events_url = eventsUrl ? normalizeUrl(eventsUrl) : null;
        const supabase = getServiceClient(this.env);
        const pagesToScrape: string[] = [];

        console.log(`[SeedGallery] Starting - main: ${mainUrl}, about: ${aboutUrl ?? 'none'}, events: ${eventsUrl ?? 'none'}`);
        console.log(`[SeedGallery] Normalized main=${normalized_main_url}${normalized_about_url ? ` about=${normalized_about_url}` : ""}${normalized_events_url ? ` events=${normalized_events_url}` : ""}`);

        const g = await step.do("upsert_gallery", async () => {
            const galleryRecord: GalleryInsert = {
                main_url: mainUrl,
                about_url: aboutUrl ?? null,
                events_page: eventsUrl ?? null,
                normalized_main_url,
            };
            const gallery = await upsertGallery(supabase, galleryRecord);
            console.log(`[SeedGallery] Gallery created/updated: ${gallery.id} (about_url=${gallery.about_url ?? "null"}, events_page=${gallery.events_page ?? "null"})`);
            return gallery;
        });

        console.log(`[SeedGallery] Creating/updating pages for gallery ${g.id}`);

        await step.do("upsert_page_main", async () => {
            const page: PageInsert = {
                gallery_id: g.id,
                url: mainUrl,
                normalized_url: normalized_main_url,
                kind: "gallery_main",
                fetch_status: "never",
            };
            const pageId = await upsertGalleryPage(supabase, page);
            console.log(`[SeedGallery] Upserted main page id: ${pageId ?? 'none'} for URL ${mainUrl}`);
            if (pageId) {
                pagesToScrape.push(pageId);
            }
        });
        if (aboutUrl) {
            await step.do("upsert_page_about", async () => {
                const page: PageInsert = {
                    gallery_id: g.id,
                    url: aboutUrl,
                    normalized_url: normalized_about_url!,
                    kind: "gallery_about",
                    fetch_status: "never",
                };
                const pageId = await upsertGalleryPage(supabase, page);
                console.log(`[SeedGallery] Upserted about page id: ${pageId ?? 'none'} for URL ${aboutUrl}`);
                if (pageId) {
                    pagesToScrape.push(pageId);
                }
            });
        }
        if (eventsUrl) {
            await step.do("upsert_page_events", async () => {
                const page: PageInsert = {
                    gallery_id: g.id,
                    url: eventsUrl,
                    normalized_url: normalized_events_url!,
                    kind: "event_list",
                    fetch_status: "never",
                };
                const pageId = await upsertGalleryPage(supabase, page);
                console.log(`[SeedGallery] Upserted events page id: ${pageId ?? 'none'} for URL ${eventsUrl}`);
                if (pageId) {
                    pagesToScrape.push(pageId);
                }
            });
        }

        if (pagesToScrape.length > 0) {
            await step.do("auto-scrape-pages", async () => {
                console.log(`[SeedGallery] Triggering scrape for pages`, pagesToScrape);
                await this.env.SCRAPE_PAGES.create({ params: { pageIds: pagesToScrape } });
            });
        }

        const pageCount = 1 + (aboutUrl ? 1 : 0) + (eventsUrl ? 1 : 0);
        console.log(`[SeedGallery] Complete - gallery ${g.id} with ${pageCount} pages`);
        if (pagesToScrape.length > 0) {
            console.log(`[SeedGallery] Auto-scrape queued for pages: ${pagesToScrape.join(", ")}`);
        }
        return { galleryId: g.id };
    }
}
