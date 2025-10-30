import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  findEventIdByPage,
  getServiceClient,
  replaceEventOccurrences,
  selectEventExtractions,
  selectPagesByIds,
  upsertEvent,
  upsertEventInfo
} from "@shared";
import type { EventInsert, EventInfoInsert, EventOccurrenceInsert, PageSummary } from "@shared";
import { pageExtractionSchema, type EventExtraction } from "@shared";

type Params = { pageIds: string[] };

type ExtractionRow = {
    page_id: string;
    payload: EventExtraction;
};

export class ProcessExtractedEvents extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);

        console.log(`[ProcessExtractedEvents] Starting - processing ${pageIds.length} pages`);

        // Load page_structured records where parse_status = 'ok'
        const extractions: ExtractionRow[] = await step.do("load-extractions", async () => {
            const records = await selectEventExtractions(supabase, pageIds);
            const rows: ExtractionRow[] = [];
            for (const row of records) {
                const parsed = pageExtractionSchema.parse(row.data);
                const isEventExtraction =
                    (parsed.type === "event" || parsed.type === "event_detail") && parsed.payload;
                if (!isEventExtraction) continue;
                rows.push({
                    page_id: row.page_id,
                    payload: parsed.payload
                });
            }
            console.log(`[ProcessExtractedEvents] Found ${rows.length} event extractions`);
            return rows;
        });

        // Load page info to get gallery_id
        const pages: PageSummary[] = await step.do("load-pages", async () => {
            const rows = await selectPagesByIds(supabase, pageIds);
            const withGallery = rows.filter(page => Boolean(page.gallery_id) && page.kind === "event");
            console.log(`[ProcessExtractedEvents] Loaded ${withGallery.length} pages with gallery IDs`);
            return withGallery;
        });

        const pageMap = new Map(pages.map(p => [p.id, p]));

        let processedCount = 0;
        for (const extraction of extractions) {
            const page = pageMap.get(extraction.page_id);
            if (!page || !page.gallery_id) {
                console.log(`[ProcessExtractedEvents] Skipping page ${extraction.page_id} - no gallery_id`);
                continue;
            }

            const payload = extraction.payload;
            console.log(`[ProcessExtractedEvents] Processing event: "${payload.title}"`);

            await step.do(`create-event:${page.id}`, async () => {
                const existingId = await findEventIdByPage(supabase, page.id);

                const eventRecord: EventInsert = {
                    gallery_id: page.gallery_id!,
                    page_id: page.id,
                    title: payload.title,
                    start_at: payload.start_at ?? null,
                    end_at: payload.end_at ?? null,
                    status: payload.status ?? "unknown",
                    ticket_url: payload.ticket_url ?? null,
                };

                const eventId = await upsertEvent(supabase, eventRecord, existingId);
                if (!existingId) {
                    console.log(`[ProcessExtractedEvents] Created event ${eventId}`);
                } else {
                    console.log(`[ProcessExtractedEvents] Updated existing event ${existingId}`);
                }

                const eventInfoData: EventInfoInsert = {
                    event_id: eventId,
                    source_page_id: page.id,
                    data: payload,
                    description: payload.description ?? null,
                    artists: payload.artists ?? null,
                    tags: payload.tags ?? null,
                    prices: payload.prices ?? null,
                    images: payload.images ?? null,
                };

                console.log(`[ProcessExtractedEvents] Upserting event_info for event ${eventId}`);
                await upsertEventInfo(supabase, eventInfoData);

                const occurrences: EventOccurrenceInsert[] = (payload.occurrences ?? []).map(occ => ({
                    event_id: eventId,
                    start_at: occ.start_at,
                    end_at: occ.end_at ?? null,
                    timezone: occ.timezone ?? null,
                }));

                await replaceEventOccurrences(supabase, occurrences, eventId);

                processedCount++;
                console.log(`[ProcessExtractedEvents] Completed event "${payload.title}" (${processedCount}/${extractions.length})`);
            });
        }

        console.log(`[ProcessExtractedEvents] Workflow complete - processed ${processedCount} events`);
        return { processed: processedCount };
    }
}
