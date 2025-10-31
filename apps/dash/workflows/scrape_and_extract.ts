import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

type Params = { pageIds: string[] };

export class ScrapeAndExtract extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const uniqueIds = Array.from(new Set(pageIds));

        if (uniqueIds.length === 0) {
            console.log("[ScrapeAndExtract] No page IDs provided");
            return { queued: 0 };
        }

        const promoteRunId = await step.do("promote-pages", async () => {
            const run = await this.env.PROMOTE_PAGES.create({ params: { pageIds: uniqueIds } });
            const resolvedRunId = run.id ?? run;
            console.log("[ScrapeAndExtract] Triggered PromotePages workflow", { runId: resolvedRunId });
            return resolvedRunId;
        });

        const scrapeRunId = await step.do("scrape-pages", async () => {
            const run = await this.env.SCRAPE_PAGES.create({ params: { pageIds: uniqueIds } });
            const resolvedRunId = run.id ?? run;
            console.log("[ScrapeAndExtract] Triggered ScrapePages workflow", { runId: resolvedRunId });
            return resolvedRunId;
        });

        const extractRunId = await step.do("extract-pages", async () => {
            const run = await this.env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: uniqueIds } });
            const resolvedRunId = run.id ?? run;
            console.log("[ScrapeAndExtract] Triggered ExtractEventPages workflow", { runId: resolvedRunId });
            return resolvedRunId;
        });

        console.log("[ScrapeAndExtract] Workflow completed", {
            queuedPages: uniqueIds.length,
            promoteRunId,
            scrapeRunId,
            extractRunId
        });

        return {
            queued: uniqueIds.length,
            promoteRunId,
            scrapeRunId,
            extractRunId
        };
    }
}
