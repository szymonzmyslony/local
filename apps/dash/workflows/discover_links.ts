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
        for (const listUrl of listUrls) {
            const links = await step.do(`fetch_links:${listUrl}`, () => fetchLinks(this.env.CLOUDFLARE_ACCOUNT_ID, this.env.CLOUDFLARE_API_TOKEN, listUrl));
            const top = links.slice(0, limit);
            if (!top.length) continue;

            const inserted = await step.do(`insert_pages:${listUrl}`, async () => {
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
                if (candidates.length === 0) return 0;

                const normalizedUrls = candidates.map(row => row.normalized_url);
                const existing = await findExistingNormalizedUrls(supabase, normalizedUrls);
                const existingSet = new Set(existing);
                const newRows = candidates.filter(row => !existingSet.has(row.normalized_url));

                if (newRows.length === 0) return 0;

                await insertPages(supabase, newRows);
                console.log(`[DiscoverLinks] ✓ Inserted ${newRows.length} new pages from ${listUrl}`);
                return newRows.length;
            });
            totalLinks += inserted ?? 0;
        }
        console.log(`[DiscoverLinks] Complete - discovered ${totalLinks} new links total`);
        return { ok: true };
    }
}
