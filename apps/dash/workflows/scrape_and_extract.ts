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

        const pending = new Set(uniqueIds);
        const extractRuns = new Map<string, string>();
        const eventIds = new Map<string, string>();
        let waitAttempts = 0;

        while (pending.size) {
            const markdownMap = await getPageMarkdownBulk(supabase, uniqueIds);
            const ready = Array.from(pending).filter(id => {
                const md = markdownMap.get(id) ?? "";
                return md.trim().length > 0;
            });

            if (!ready.length) {
                waitAttempts += 1;
                if (waitAttempts > 24) {
                    throw new Error(`Scrape did not produce markdown for: ${Array.from(pending).join(", ")}`);
                }
                await step.sleep(`wait-markdown-${waitAttempts}`, "5 seconds");
                continue;
            }

            waitAttempts = 0;

            for (const id of ready) {
                const extractRunId = await step.do(`extract-${id}`, async () => {
                    const run = await this.env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: [id] } });
                    const resolvedRunId = run.id ?? run;
                    console.log("[ScrapeAndExtract] Triggered ExtractEventPages workflow", { runId: resolvedRunId, pageId: id });
                    return resolvedRunId;
                });

                extractRuns.set(id, extractRunId);

                const eventId = await step.do(`await-event-${id}`, async () => {
                    for (let attempt = 0; attempt < 24; attempt += 1) {
                        const map = await selectEventIdsByPageIds(supabase, [id]);
                        const eventId = map.get(id);
                        if (eventId) {
                            return eventId;
                        }
                        await step.sleep(`wait-event-${id}-${attempt}`, "5 seconds");
                    }
                    throw new Error(`Extraction workflow completed but no event row for page ${id}`);
                });

                await step.do(`mark-event-${id}`, async () => {
                    await updatePageById(supabase, id, { kind: "event", updated_at: new Date().toISOString() });
                });

                eventIds.set(id, eventId);
                pending.delete(id);
            }
        }

        console.log("[ScrapeAndExtract] Workflow completed", {
            queuedPages: uniqueIds.length,
            scrapeRunId,
            extractRuns: Object.fromEntries(extractRuns),
            extractedIds: Array.from(eventIds.keys()),
            eventIds: Object.fromEntries(eventIds)
        });

        return {
            queued: uniqueIds.length,
            scrapeRunId,
            extractRuns: Object.fromEntries(extractRuns),
            extractedIds: Array.from(eventIds.keys()),
            eventIds: Object.fromEntries(eventIds)
        };
    }
}
