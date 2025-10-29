import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { normalizeUrl } from "../src/utils/normalizeUrl";
import type { GalleryInsert, PageInsert } from "../../../types/common";
import { getServiceClient } from "../../../shared/supabase";

type Params = { mainUrl: string; aboutUrl?: string | null };

export class SeedGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { mainUrl, aboutUrl } = event.payload;
        const normalized_main_url = normalizeUrl(mainUrl);
        const normalized_about_url = aboutUrl ? normalizeUrl(aboutUrl) : null;
        const supabase = getServiceClient(this.env);

        console.log(`[SeedGallery] Starting - main: ${mainUrl}, about: ${aboutUrl ?? 'none'}`);
        console.log(`[SeedGallery] Normalized main=${normalized_main_url}${normalized_about_url ? ` about=${normalized_about_url}` : ""}`);

        const g = await step.do("upsert_gallery", async () => {
            const galleryRecord: GalleryInsert = {
                main_url: mainUrl,
                about_url: aboutUrl ?? null,
                normalized_main_url,
            };
            const { data, error } = await supabase
                .from("galleries")
                .upsert(galleryRecord, { onConflict: "normalized_main_url" })
                .select()
                .single();
            if (error) throw error;
            console.log(`[SeedGallery] Gallery created/updated: ${data?.id} (about_url=${data?.about_url ?? "null"})`);
            return data;
        });

        console.log(`[SeedGallery] Creating/updating pages for gallery ${g.id}`);

        await step.do("upsert_page_main", async () => {
            const pageMain = [
                {
                    gallery_id: g.id,
                    url: mainUrl,
                    normalized_url: normalized_main_url,
                    kind: "gallery_main",
                    fetch_status: "never",
                },
            ] satisfies PageInsert[];
            const { data, error } = await supabase
                .from("pages")
                .upsert(pageMain, { onConflict: "normalized_url" })
                .select("id")
                .maybeSingle();
            if (error) throw error;
            console.log(`[SeedGallery] Upserted main page id: ${data?.id ?? 'none'} for URL ${mainUrl}`);
        });
        if (aboutUrl) {
            await step.do("upsert_page_about", async () => {
                const pageAbout = [
                    {
                        gallery_id: g.id,
                        url: aboutUrl,
                        normalized_url: normalized_about_url!,
                        kind: "gallery_about",
                        fetch_status: "never",
                    },
                ] satisfies PageInsert[];
                const { data, error } = await supabase
                    .from("pages")
                    .upsert(pageAbout, { onConflict: "normalized_url" })
                    .select("id")
                    .maybeSingle();
                if (error) throw error;
                console.log(`[SeedGallery] Upserted about page id: ${data?.id ?? 'none'} for URL ${aboutUrl}`);
            });
        }

        console.log(`[SeedGallery] Complete - gallery ${g.id} with ${aboutUrl ? 2 : 1} pages`);
        console.log(`[SeedGallery] Reminder: run ScrapePages before ExtractGallery to populate page_content.`);
        return { galleryId: g.id };
    }
}
