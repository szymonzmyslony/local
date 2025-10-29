import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { normalizeUrl } from "../src/utils/normalizeUrl";
import { getServiceClient } from "../../../shared/supabase";

type Params = { mainUrl: string; aboutUrl?: string | null };

export class SeedGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl } = event.payload;
        const normalized_main_url = normalizeUrl(mainUrl);
        const normalized_about_url = aboutUrl ? normalizeUrl(aboutUrl) : null;
        const supabase = getServiceClient(this.env);

        const g = await step.do("upsert_gallery", async () => {
            const { data, error } = await supabase
                .from("galleries")
                .upsert(
                    [{ main_url: mainUrl, about_url: aboutUrl ?? null, normalized_main_url, normalized_about_url }],
                    { onConflict: "normalized_main_url" }
                )
                .select()
                .limit(1);
            if (error) throw error;
            return data?.[0];
        });

        await step.do("upsert_page_main", async () => {
            const { error } = await supabase.from("pages").upsert(
                [{ gallery_id: g.id, url: mainUrl, normalized_url: normalized_main_url, kind: "gallery_main", fetch_status: "never" }],
                { onConflict: "normalized_url" }
            );
            if (error) throw error;
        });
        if (aboutUrl) {
            await step.do("upsert_page_about", async () => {
                const { error } = await supabase.from("pages").upsert(
                    [{ gallery_id: g.id, url: aboutUrl, normalized_url: normalized_about_url!, kind: "gallery_about", fetch_status: "never" }],
                    { onConflict: "normalized_url" }
                );
                if (error) throw error;
            });
        }

        return { galleryId: g.id };
    }
}
