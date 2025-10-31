import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient, getPageMarkdownBulk, selectEventIdsByPageIds, updatePageById } from "@shared";

type Params = { pageIds: string[] };

export class ScrapeAndExtract extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const uniqueIds = Array.from(new Set(pageIds));

        if (uniqueIds.length === 0) {
            console.log("[ScrapeAndExtract] No page IDs provided");
            return { queued: 0 };
        }

        const supabase = getServiceClient(this.env);

        const scrapeRunId = await step.do("scrape-pages", async () => {
            const run = await this.env.SCRAPE_PAGES.create({ params: { pageIds: uniqueIds } });
            const resolvedRunId = run.id ?? run;
            console.log("[ScrapeAndExtract] Triggered ScrapePages workflow", { runId: resolvedRunId });
            return resolvedRunId;
        });

        const readyIds = await step.do("await-markdown", async () => {
            const pending = new Set(uniqueIds);
            const maxAttempts = 24;

            for (let attempt = 0; attempt < maxAttempts && pending.size; attempt += 1) {
                const markdownMap = await getPageMarkdownBulk(supabase, uniqueIds);
                for (const id of Array.from(pending)) {
                    const md = markdownMap.get(id) ?? "";
                    if (md.trim().length > 0) {
                        pending.delete(id);
                    }
                }

                if (pending.size === 0) {
                    break;
                }

                await step.sleep(`wait-markdown-${attempt}`, "5 seconds");
            }

            if (pending.size) {
                throw new Error(`Scrape did not produce markdown for: ${Array.from(pending).join(", ")}`);
            }

            return [...uniqueIds];
        });

        const extractRunId = await step.do("extract-pages", async () => {
            const run = await this.env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: readyIds } });
            const resolvedRunId = run.id ?? run;
            console.log("[ScrapeAndExtract] Triggered ExtractEventPages workflow", { runId: resolvedRunId, pageIds: readyIds });
            return resolvedRunId;
        });

        const confirmedEventIds = await step.do("await-events", async () => {
            const maxAttempts = 24;
            let latest = await selectEventIdsByPageIds(supabase, readyIds);
            for (let attempt = 0; attempt < maxAttempts && latest.size < readyIds.length; attempt += 1) {
                await step.sleep(`wait-events-${attempt}`, "5 seconds");
                latest = await selectEventIdsByPageIds(supabase, readyIds);
            }
            return latest;
        });

        if (confirmedEventIds.size !== readyIds.length) {
            const missing = readyIds.filter(id => !confirmedEventIds.has(id));
            throw new Error(`Extraction did not produce events for: ${missing.join(", ")}`);
        }

        await step.do("update-kind", async () => {
            const timestamp = new Date().toISOString();
            await Promise.all(
                readyIds.map(id => updatePageById(supabase, id, { kind: "event", updated_at: timestamp }))
            );
        });

        console.log("[ScrapeAndExtract] Workflow completed", {
            queuedPages: uniqueIds.length,
            scrapeRunId,
            extractRunId,
            extractedIds: readyIds,
            eventIds: readyIds.map(id => confirmedEventIds.get(id))
        });

        return {
            queued: uniqueIds.length,
            scrapeRunId,
            extractRunId,
            extractedIds: readyIds,
            eventIds: Object.fromEntries(readyIds.map(id => [id, confirmedEventIds.get(id)!]))
        };
    }
}
