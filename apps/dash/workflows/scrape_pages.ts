import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  getServiceClient,
  selectPagesByIds,
  upsertPageContent,
  updatePageById
} from "@shared";
import type { PageContentInsert, PageUpdate } from "@shared";
import { fetchMarkdown } from "./utils/links";

type Params = { pageIds: string[] };

export class ScrapePages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);

        console.log(`[ScrapePages] Starting - ${pageIds.length} pages to scrape`);

        // Resolve URLs for given IDs
        const pages = await selectPagesByIds(supabase, pageIds);
        if (pages.length === 0) {
            console.log("[ScrapePages] No pages found for provided IDs", pageIds);
        }

        console.log(`[ScrapePages] Loaded ${pages.length} pages from database`);

        let successCount = 0;
        let errorCount = 0;

        for (const p of pages) {
            try {
                const markdown: string | null = await step.do(`scrape:${p.id}`, async () => {
                    return fetchMarkdown(this.env.BROWSER, p.normalized_url);
                });

                await step.do(`save-content:${p.id}`, async () => {
                    const contentRecord: PageContentInsert = {
                        page_id: p.id,
                        markdown,
                        parsed_at: new Date().toISOString(),
                    };
                    await upsertPageContent(supabase, contentRecord);
                });

                await step.do(`mark-ok:${p.id}`, async () => {
                    const pageUpdate: PageUpdate = {
                        fetch_status: "ok",
                        fetched_at: new Date().toISOString(),
                    };
                    await updatePageById(supabase, p.id, pageUpdate);
                });
                successCount++;
                console.log(`[ScrapePages] ✓ ${successCount}/${pages.length} - ${p.normalized_url}`);
            } catch (error) {
                errorCount++;
                console.error(`[ScrapePages] ✗ ${errorCount}/${pages.length} - ${p.normalized_url}:`, error);
                await step.do(`mark-error:${p.id}`, async () => {
                    const pageUpdate: PageUpdate = { fetch_status: "error" };
                    await updatePageById(supabase, p.id, pageUpdate);
                });
            }
        }

        console.log(`[ScrapePages] Complete - ${successCount} successes, ${errorCount} errors`);
        return { ok: true };
    }
}
