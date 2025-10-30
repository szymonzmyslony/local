import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { z } from "zod";
import { getServiceClient } from "../../../shared/supabase";
import type { PageContentInsert, PageUpdate } from "../../../types/common";
import { getFirecrawl } from "./utils/firecrawl";

type Params = { pageIds: string[] };

export class ScrapePages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const firecrawl = getFirecrawl(this.env.FIRECRAWL_API_KEY);

        console.log(`[ScrapePages] Starting - ${pageIds.length} pages to scrape`);

        // Resolve URLs for given IDs
        const { data: pages, error } = await supabase
            .from("pages")
            .select("id, normalized_url")
            .in("id", pageIds);
        if (error) throw error;
        if (!pages?.length) {
            console.log("[ScrapePages] No pages found for provided IDs", pageIds);
        }

        console.log(`[ScrapePages] Loaded ${pages?.length ?? 0} pages from database`);

        let successCount = 0;
        let errorCount = 0;

        const markdownSchema = z.object({ markdown: z.string().optional() });

        for (const p of pages ?? []) {
            try {
                console.log(`[ScrapePages] Scraping ${p.normalized_url}`);
                const markdown: string | null = await step.do(`scrape:${p.id}`, async () => {
                    const doc = await firecrawl.scrape(p.normalized_url, { formats: ["markdown"] });
                    const parsed = markdownSchema.safeParse(doc);
                    if (!parsed.success) return null;
                    return parsed.data.markdown ?? null;
                });

                console.log(`[ScrapePages] Scraped ${p.normalized_url} - ${markdown ? markdown.length + ' chars' : 'no content'}`);

                await step.do(`save-content:${p.id}`, async () => {
                    const contentRecord: PageContentInsert[] = [
                        {
                            page_id: p.id,
                            markdown,
                            parsed_at: new Date().toISOString(),
                        },
                    ];
                    const { error } = await supabase.from("page_content").upsert(contentRecord, { onConflict: "page_id" });
                    if (error) throw error;
                    console.log(`[ScrapePages] Saved content for page ${p.id} (length ${markdown?.length ?? 0})`);
                });

                await step.do(`mark-ok:${p.id}`, async () => {
                    const pageUpdate: PageUpdate = {
                        fetch_status: "ok",
                        fetched_at: new Date().toISOString(),
                    };
                    const { error } = await supabase.from("pages").update(pageUpdate).eq("id", p.id);
                    if (error) throw error;
                    console.log(`[ScrapePages] Marked page ${p.id} as ok`);
                });
                successCount++;
                console.log(`[ScrapePages] Success ${successCount}/${pages.length} - ${p.normalized_url}`);
            } catch (error) {
                errorCount++;
                console.error(`[ScrapePages] Error ${errorCount}/${pages.length} - ${p.normalized_url}:`, error);
                await step.do(`mark-error:${p.id}`, async () => {
                    const pageUpdate: PageUpdate = { fetch_status: "error" };
                    const { error: updateError } = await supabase.from("pages").update(pageUpdate).eq("id", p.id);
                    if (updateError) throw updateError;
                    console.log(`[ScrapePages] Marked page ${p.id} as error`);
                });
            }
        }

        console.log(`[ScrapePages] Complete - ${successCount} successes, ${errorCount} errors`);
        return { ok: true };
    }
}
