import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  getServiceClient,
  selectPagesByIds,
  updatePageById
} from "@shared";
import type { PageUpdate } from "@shared";

type Params = { pageIds: string[] };

export class ScrapeAndExtract extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const uniqueIds = Array.from(new Set(pageIds));
        const supabase = getServiceClient(this.env);

        if (uniqueIds.length === 0) {
            console.log("[ScrapeAndExtract] No page IDs provided");
            return { queued: 0 };
        }

        const pages = await step.do("load-pages", async () => {
            const rows = await selectPagesByIds(supabase, uniqueIds);
            console.log("[ScrapeAndExtract] Loaded pages for promotion", {
                count: rows.length,
                pageIds: rows.map(row => row.id),
                kinds: rows.map(row => row.kind)
            });
            return rows;
        });

        if (pages.length === 0) {
            console.log("[ScrapeAndExtract] No matching pages found");
            return { queued: 0 };
        }

        const timestamp = new Date().toISOString();
        await step.do("promote-kind", async () => {
            for (const page of pages) {
                if (page.kind === "event") {
                    console.log(`[ScrapeAndExtract] Page ${page.id} already kind=event, skipping promote`);
                    continue;
                }
                const update: PageUpdate = {
                    kind: "event",
                    updated_at: timestamp
                };
                await updatePageById(supabase, page.id, update);
                console.log(`[ScrapeAndExtract] Promoted page ${page.id} to kind=event`);
            }
        });

        await step.do("scrape-pages", async () => {
            const run = await this.env.SCRAPE_PAGES.create({ params: { pageIds: uniqueIds } });
            console.log("[ScrapeAndExtract] Triggered ScrapePages workflow", { runId: run.id ?? run });
            return run.id ?? run;
        });

        await step.do("extract-pages", async () => {
            const run = await this.env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: uniqueIds } });
            console.log("[ScrapeAndExtract] Triggered ExtractEventPages workflow", { runId: run.id ?? run });
            return run.id ?? run;
        });

        return { queued: pages.length };
    }
}
