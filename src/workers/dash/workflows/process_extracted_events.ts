import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import type { EventInsert, EventInfoInsert, EventOccurrenceInsert } from "../../../types/common";
import type { PageExtraction } from "../../../shared/schema";

type Params = { pageIds: string[] };

type PageWithGallery = {
    id: string;
    gallery_id: string;
};

type ExtractionRow = {
    page_id: string;
    data: PageExtraction;
};

export class ProcessExtractedEvents extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);

        console.log(`[ProcessExtractedEvents] Starting - processing ${pageIds.length} pages`);

        // Load page_structured records where extracted_kind = 'event'
        const extractions: ExtractionRow[] = await step.do("load-extractions", async () => {
            const { data, error } = await supabase
                .from("page_structured")
                .select("page_id, data")
                .in("page_id", pageIds)
                .eq("extracted_kind", "event")
                .eq("parse_status", "ok");
            if (error) throw error;
            console.log(`[ProcessExtractedEvents] Found ${data.length} event extractions`);
            return data as ExtractionRow[];
        });

        // Load page info to get gallery_id
        const pages: PageWithGallery[] = await step.do("load-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, gallery_id")
                .in("id", pageIds)
                .not("gallery_id", "is", null);
            if (error) throw error;
            console.log(`[ProcessExtractedEvents] Loaded ${data.length} pages with gallery IDs`);
            return data as PageWithGallery[];
        });

        const pageMap = new Map(pages.map(p => [p.id, p]));

        let processedCount = 0;
        for (const extraction of extractions) {
            const page = pageMap.get(extraction.page_id);
            if (!page || !page.gallery_id) {
                console.log(`[ProcessExtractedEvents] Skipping page ${extraction.page_id} - no gallery_id`);
                continue;
            }

            const pageExtraction = extraction.data as PageExtraction;

            if (pageExtraction.type !== "event_detail") {
                console.log(`[ProcessExtractedEvents] Skipping page ${extraction.page_id} - type is ${pageExtraction.type}`);
                continue;
            }

            const payload = pageExtraction.payload;
            console.log(`[ProcessExtractedEvents] Processing event: "${payload.title}"`);

            await step.do(`create-event:${page.id}`, async () => {
                const { data: existing } = await supabase
                    .from("events")
                    .select("id")
                    .eq("page_id", page.id)
                    .limit(1)
                    .single();

                const eventRecord = {
                    gallery_id: page.gallery_id!,
                    page_id: page.id,
                    title: payload.title,
                    start_at: payload.start_at ?? null,
                    end_at: payload.end_at ?? null,
                    status: payload.status ?? "unknown",
                    ticket_url: payload.ticket_url ?? null,
                } satisfies EventInsert;

                let eventId: string;

                if (existing) {
                    console.log(`[ProcessExtractedEvents] Updating existing event ${existing.id}`);
                    const { data: updated, error } = await supabase
                        .from("events")
                        .update(eventRecord)
                        .eq("id", existing.id)
                        .select("id")
                        .single();
                    if (error) throw error;
                    eventId = updated.id;
                } else {
                    console.log(`[ProcessExtractedEvents] Creating new event`);
                    const { data: created, error } = await supabase
                        .from("events")
                        .insert([eventRecord])
                        .select("id")
                        .single();
                    if (error) throw error;
                    eventId = created.id;
                    console.log(`[ProcessExtractedEvents] Created event ${eventId}`);
                }

                // Create event_info record
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
                const { error: infoError } = await supabase
                    .from("event_info")
                    .upsert([eventInfoData], { onConflict: "event_id" });
                if (infoError) throw infoError;

                // Create event_occurrences if present
                if (payload.occurrences && payload.occurrences.length > 0) {
                    console.log(`[ProcessExtractedEvents] Creating ${payload.occurrences.length} occurrences for event ${eventId}`);
                    await supabase
                        .from("event_occurrences")
                        .delete()
                        .eq("event_id", eventId);

                    const occurrences: EventOccurrenceInsert[] = payload.occurrences.map(occ => ({
                        event_id: eventId,
                        start_at: occ.start_at,
                        end_at: occ.end_at ?? null,
                        timezone: occ.timezone ?? null,
                    }));

                    const { error: occError } = await supabase
                        .from("event_occurrences")
                        .insert(occurrences);
                    if (occError) throw occError;
                }

                processedCount++;
                console.log(`[ProcessExtractedEvents] Completed event "${payload.title}" (${processedCount}/${extractions.length})`);
            });
        }

        console.log(`[ProcessExtractedEvents] Workflow complete - processed ${processedCount} events`);
        return { processed: processedCount };
    }
}
