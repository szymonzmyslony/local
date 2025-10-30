import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import type { PageInsert } from "../../../types/common";
import { fetchLinks } from "./utils/links";
import { normalizeUrl } from "./utils/normalizeUrl";

type Params = { galleryId: string; listUrls: string[]; limit?: number };

export class DiscoverLinks extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId, listUrls, limit = 100 } = event.payload;
        const supabase = getServiceClient(this.env);

        console.log(`[DiscoverLinks] Starting - gallery: ${galleryId}, ${listUrls.length} list URLs, limit: ${limit}`);

        let totalLinks = 0;
        for (const listUrl of listUrls) {
            console.log(`[DiscoverLinks] Fetching links from: ${listUrl}`);
            const links = await step.do(`fetch_links:${listUrl}`, () => fetchLinks(this.env.CLOUDFLARE_ACCOUNT_ID, this.env.CLOUDFLARE_API_TOKEN, listUrl));
            const top = links.slice(0, limit);
            if (!top.length) {
                console.log(`[DiscoverLinks] No links found at ${listUrl}`);
                continue;
            }

            console.log(`[DiscoverLinks] Found ${links.length} links, taking top ${top.length}`);
            const inserted = await step.do(`insert_pages:${listUrl}`, async () => {
                const seen = new Set<string>();
                const candidates: PageInsert[] = [];
                for (const link of top) {
                    const normalized = normalizeUrl(link);
                    if (seen.has(normalized)) {
                        console.log(`[DiscoverLinks] Skipping duplicate normalized URL ${normalized}`);
                        continue;
                    }
                    seen.add(normalized);
                    candidates.push({
                        gallery_id: galleryId,
                        url: link,
                        normalized_url: normalized,
                        kind: "init",
                        fetch_status: "never",
                    });
                }
                if (candidates.length === 0) {
                    console.log(`[DiscoverLinks] No new unique links to consider for ${listUrl}`);
                    return;
                }

                const normalizedUrls = candidates.map(row => row.normalized_url);
                const { data: existing, error: loadError } = await supabase
                    .from("pages")
                    .select("normalized_url")
                    .in("normalized_url", normalizedUrls);
                if (loadError) {
                    console.error("[DiscoverLinks] Failed checking existing pages", JSON.stringify(loadError));
                    throw new Error(`[DiscoverLinks] Supabase error: ${loadError.message}`);
                }

                const existingSet = new Set((existing ?? []).map(row => row.normalized_url));
                const newRows = candidates.filter(row => !existingSet.has(row.normalized_url));
                const skippedCount = candidates.length - newRows.length;

                if (skippedCount > 0) {
                    console.log(`[DiscoverLinks] Skipping ${skippedCount} links already discovered for ${listUrl}`);
                }

                if (newRows.length === 0) {
                    console.log(`[DiscoverLinks] Nothing new to insert for ${listUrl}`);
                    return 0;
                }

                const { error } = await supabase.from("pages").insert(newRows);
                if (error) {
                    console.error("[DiscoverLinks] Insert error", JSON.stringify(error));
                    throw new Error(`[DiscoverLinks] Supabase error: ${error.message}`);
                }
                console.log(`[DiscoverLinks] Inserted ${newRows.length} pages for ${listUrl}`);
                for (const row of newRows) console.log(`[DiscoverLinks]   -> ${row.normalized_url}`);
                return newRows.length;
            });
            totalLinks += inserted ?? 0;
        }
        console.log(`[DiscoverLinks] Complete - discovered ${totalLinks} links total`);
        return { ok: true };
    }
}
