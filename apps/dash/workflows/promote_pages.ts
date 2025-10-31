import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient, selectPagesByIds, updatePageById } from "@shared";
import type { PageSummary, PageUpdate } from "@shared";

type Params = { pageIds: string[] };

export class PromotePages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const uniqueIds = Array.from(new Set(pageIds));

        if (uniqueIds.length === 0) {
            console.log("[PromotePages] No page IDs provided");
            return { promoted: 0, skipped: 0 };
        }

        const pages = await step.do("load-pages", async (): Promise<PageSummary[]> => {
            const rows = await selectPagesByIds(supabase, uniqueIds);
            console.log("[PromotePages] Loaded pages", {
                requested: uniqueIds.length,
                found: rows.length,
                ids: rows.map(row => row.id)
            });
            return rows;
        });

        if (pages.length === 0) {
            console.log("[PromotePages] No pages found matching provided IDs");
            return { promoted: 0, skipped: 0 };
        }

        let promotedCount = 0;
        let skippedCount = 0;

        for (const page of pages) {
            const outcome = await step.do(`promote:${page.id}`, async (): Promise<"promoted" | "skipped"> => {
                if (page.kind === "event") {
                    console.log(`[PromotePages] Page ${page.id} already kind=event`);
                    return "skipped";
                }
                const update: PageUpdate = {
                    kind: "event",
                    updated_at: new Date().toISOString()
                };
                await updatePageById(supabase, page.id, update);
                console.log(`[PromotePages] Updated page ${page.id} to kind=event`);
                return "promoted";
            });
            if (outcome === "promoted") {
                promotedCount += 1;
            } else {
                skippedCount += 1;
            }
        }

        console.log("[PromotePages] Complete", {
            promoted: promotedCount,
            skipped: skippedCount
        });

        return { promoted: promotedCount, skipped: skippedCount };
    }
}
