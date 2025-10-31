import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
    findExistingNormalizedUrls,
    getServiceClient,
    insertPages,
    normalizeUrl
} from "@shared";
import type { PageInsert } from "@shared";
import { fetchLinks } from "./utils/links";

type Params = { galleryId: string; listUrls: string[]; limit?: number };

export class DiscoverLinks extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId, listUrls, limit = 100 } = event.payload;
        const supabase = getServiceClient(this.env);

        console.log(`[DiscoverLinks] Starting - gallery: ${galleryId}, ${listUrls.length} list URLs, limit: ${limit}`);

        let totalLinks = 0;
        const allDiscoveredPageIds: string[] = [];

        for (const listUrl of listUrls) {
            const links = await step.do(`fetch_links:${listUrl}`, () => fetchLinks(this.env.CLOUDFLARE_ACCOUNT_ID, this.env.CLOUDFLARE_API_TOKEN, listUrl));
            const top = links.slice(0, limit);
            if (!top.length) continue;

            const result = await step.do(`insert_pages:${listUrl}`, async () => {
                const seen = new Set<string>();
                const candidates: PageInsert[] = [];
                for (const link of top) {
                    const normalized = normalizeUrl(link);
                    if (seen.has(normalized)) continue;
                    seen.add(normalized);
                    candidates.push({
                        gallery_id: galleryId,
                        url: link,
                        normalized_url: normalized,
                        kind: "init",
                        fetch_status: "never",
                    });
                }
                if (candidates.length === 0) return { count: 0, pageIds: [] };

                const normalizedUrls = candidates.map(row => row.normalized_url);
                const existing = await findExistingNormalizedUrls(supabase, normalizedUrls);
                const existingSet = new Set(existing);
                const newRows = candidates.filter(row => !existingSet.has(row.normalized_url));

                if (newRows.length === 0) return { count: 0, pageIds: [] };

                await insertPages(supabase, newRows);

                // Query back the inserted page IDs
                const { data, error } = await supabase
                    .from("pages")
                    .select("id")
                    .in("normalized_url", newRows.map(r => r.normalized_url))
                    .eq("gallery_id", galleryId);

                if (error) {
                    console.error(`[DiscoverLinks] Error querying inserted pages: ${error.message}`);
                    return { count: newRows.length, pageIds: [] };
                }

                const pageIds = (data ?? []).map((row: any) => row.id);
                console.log(`[DiscoverLinks] ✓ Inserted ${newRows.length} new pages from ${listUrl}`);
                return { count: newRows.length, pageIds };
            });

            totalLinks += result.count;
            allDiscoveredPageIds.push(...result.pageIds);
        }

        console.log(`[DiscoverLinks] Complete - discovered ${totalLinks} new links total`);

        // Trigger scraping and classification for all discovered pages
        if (allDiscoveredPageIds.length > 0) {
            await step.do("trigger-scrape-pages", async () => {
                console.log(`[DiscoverLinks] Triggering SCRAPE_PAGES for ${allDiscoveredPageIds.length} pages`);
                await this.env.SCRAPE_PAGES.create({ params: { pageIds: allDiscoveredPageIds } });
            });

            await step.do("trigger-classify-pages", async () => {
                console.log(`[DiscoverLinks] Triggering CLASSIFY_PAGE for ${allDiscoveredPageIds.length} pages`);
                await this.env.CLASSIFY_PAGE.create({ params: { pageIds: allDiscoveredPageIds } });
            });
        }

        return { ok: true, discovered: totalLinks, triggeredClassification: allDiscoveredPageIds.length };
    }
}
