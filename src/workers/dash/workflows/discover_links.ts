import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { fetchLinks } from "../src/utils/links";
import { normalizeUrl } from "../src/utils/normalizeUrl";

type Params = { galleryId: string; listUrls: string[]; limit?: number };

export class DiscoverLinks extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId, listUrls, limit = 100 } = event.payload;
        const supabase = getServiceClient(this.env);

        for (const listUrl of listUrls) {
            const links = await step.do(`fetch_links:${listUrl}`, () => fetchLinks(this.env.CLOUDFLARE_ACCOUNT_ID, this.env.CLOUDFLARE_API_TOKEN, listUrl));
            const top = links.slice(0, limit);
            if (!top.length) continue;

            await step.do(`upsert_pages:${listUrl}`, async () => {
                const rows = top.map(l => ({
                    gallery_id: galleryId,
                    url: l,
                    normalized_url: normalizeUrl(l),
                    kind: "event_detail" as const,
                    fetch_status: "never" as const
                }));
                const { error } = await supabase.from("pages").upsert(rows, { onConflict: "normalized_url" });
                if (error) throw error;
            });
        }
        return { ok: true };
    }
}
