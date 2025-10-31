import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient, selectEventIdsByPageIds, updatePageById } from "@shared";

type Params = { pageIds: string[] };

/**
 * ExtractAndEmbedEvents: Extracts event data from already-scraped pages and triggers embedding.
 *
 * Assumes pages already have markdown content in the database.
 * For each page, triggers ExtractEventPages which:
 * - Extracts event data using AI
 * - Creates event records
 * - Automatically triggers embedding
 */
export class ExtractAndEmbedEvents extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const uniqueIds = Array.from(new Set(pageIds));

        if (uniqueIds.length === 0) {
            console.log("[ExtractAndEmbedEvents] No page IDs provided");
            return { processed: 0, extracted: 0 };
        }

        const supabase = getServiceClient(this.env);
        const extractRuns = new Map<string, string>();
        const eventIds = new Map<string, string>();

        // Trigger extraction for each page
        for (const id of uniqueIds) {
            const extractRunId = await step.do(`extract-${id}`, async () => {
                const run = await this.env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: [id] } });
                const resolvedRunId = run.id ?? run;
                console.log("[ExtractAndEmbedEvents] Triggered ExtractEventPages workflow", { runId: resolvedRunId, pageId: id });
                return resolvedRunId;
            });

            extractRuns.set(id, extractRunId);

            // Wait for event to be created (verify extraction completed)
            const eventId = await step.do(`await-event-${id}`, async () => {
                for (let attempt = 0; attempt < 24; attempt += 1) {
                    const map = await selectEventIdsByPageIds(supabase, [id]);
                    const eventId = map.get(id);
                    if (eventId) {
                        console.log("[ExtractAndEmbedEvents] Event created for page", { pageId: id, eventId });
                        return eventId;
                    }
                    await step.sleep(`wait-event-${id}-${attempt}`, "5 seconds");
                }
                throw new Error(`Extraction workflow completed but no event row for page ${id}`);
            });

            // Ensure page kind is set to "event"
            await step.do(`ensure-event-kind-${id}`, async () => {
                await updatePageById(supabase, id, { kind: "event", updated_at: new Date().toISOString() });
            });

            eventIds.set(id, eventId);
        }

        console.log("[ExtractAndEmbedEvents] Workflow completed", {
            processed: uniqueIds.length,
            extractRuns: Object.fromEntries(extractRuns),
            extractedEventIds: Array.from(eventIds.keys()),
            eventIds: Object.fromEntries(eventIds)
        });

        return {
            processed: uniqueIds.length,
            extracted: eventIds.size,
            extractRuns: Object.fromEntries(extractRuns),
            eventIds: Object.fromEntries(eventIds)
        };
    }
}
