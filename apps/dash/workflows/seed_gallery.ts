import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
    getServiceClient,
    normalizeUrl,
    upsertGallery,
    upsertGalleryInfo,
    upsertGalleryPage
} from "@shared";
import type { GalleryInsert, GalleryInfoInsert, PageInsert } from "@shared";

type Params = {
    mainUrl: string;
    aboutUrl?: string | null;
    eventsUrl?: string | null;
    name?: string | null;
    address?: string | null;
    instagram?: string | null;
};

export class SeedGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl, eventsUrl, name, address, instagram } = event.payload;
        const normalized_main_url = normalizeUrl(mainUrl);
        const normalized_about_url = aboutUrl ? normalizeUrl(aboutUrl) : null;
        const normalized_events_url = eventsUrl ? normalizeUrl(eventsUrl) : null;
        const supabase = getServiceClient(this.env);
        const pagesToScrape: string[] = [];
        const seededPages: Array<{ pageId: string; url: string }> = [];
        const seenNormalized = new Set<string>();

        console.log(`[SeedGallery] Starting - name: ${name ?? 'none'}, main: ${mainUrl}, about: ${aboutUrl ?? 'none'}, events: ${eventsUrl ?? 'none'}`);
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

        await step.do("upsert_gallery_info", async () => {
            const galleryInfoRecord: GalleryInfoInsert = {
                gallery_id: g.id,
                name: name ?? null,
                address: address ?? null,
                instagram: instagram ?? null,
                data: {},
            };
            await upsertGalleryInfo(supabase, galleryInfoRecord);
            console.log(`[SeedGallery] Gallery info created/updated: name=${name ?? "null"}, address=${address ?? "null"}, instagram=${instagram ?? "null"}`);
        });

        console.log(`[SeedGallery] Creating/updating pages for gallery ${g.id}`);

        const pageDefinitions: Array<{ label: string; inputUrl: string; normalized: string | null; kind: PageInsert["kind"] }> = [
            { label: "main", inputUrl: mainUrl, normalized: normalized_main_url, kind: "gallery_main" },
        ];

        if (aboutUrl && normalized_about_url) {
            pageDefinitions.push({ label: "about", inputUrl: aboutUrl, normalized: normalized_about_url, kind: "gallery_about" });
        }
        if (eventsUrl && normalized_events_url) {
            pageDefinitions.push({ label: "events", inputUrl: eventsUrl, normalized: normalized_events_url, kind: "event_list" });
        }

        for (const definition of pageDefinitions) {
            if (!definition.normalized) continue;
            if (seenNormalized.has(definition.normalized)) {
                console.log(`[SeedGallery] Skipping ${definition.label} page - normalized URL already processed (${definition.normalized})`);
                continue;
            }
            seenNormalized.add(definition.normalized);

            const pageId = await step.do(`upsert_page_${definition.label}`, async () => {
                const page: PageInsert = {
                    gallery_id: g.id,
                    url: definition.inputUrl,
                    normalized_url: definition.normalized!,
                    kind: definition.kind,
                    fetch_status: "never",
                };
                const pageId = await upsertGalleryPage(supabase, page);
                console.log(`[SeedGallery] Upserted ${definition.label} page id: ${pageId ?? 'none'} for URL ${definition.inputUrl}`);
                return pageId ?? null;
            });
            if (pageId) {
                pagesToScrape.push(pageId);
                seededPages.push({ pageId, url: definition.inputUrl });
            }
        }

        if (pagesToScrape.length > 0) {
            await step.do("auto-scrape-pages", async () => {
                console.log(`[SeedGallery] Triggering scrape for pages`, pagesToScrape);
                await this.env.SCRAPE_PAGES.create({ params: { pageIds: pagesToScrape } });
            });

            await step.do("discover-pages", async () => {
                const seedUrls = Array.from(new Set(seededPages.map(entry => entry.url)));
                if (seedUrls.length === 0) {
                    console.log("[SeedGallery] No seed URLs for discovery");
                    return;
                }
                console.log(`[SeedGallery] Triggering DiscoverLinks with ${seedUrls.length} URLs`);
                await this.env.DISCOVER_LINKS.create({ params: { galleryId: g.id, listUrls: seedUrls } });
            });
        }

        const pageCount = seededPages.length;
        console.log(`[SeedGallery] Complete - gallery ${g.id} with ${pageCount} pages`);
        if (pagesToScrape.length > 0) {
            console.log(`[SeedGallery] Auto-scrape queued for pages: ${pagesToScrape.join(", ")}`);
        }
        return { galleryId: g.id };
    }
}
