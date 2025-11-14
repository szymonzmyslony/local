import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractPageContentFromMarkdown,
  getPageMarkdown,
  getServiceClient,
  selectPagesByIds,
  upsertPageStructured,
  updatePageById,
  selectEventExtractions,
  findEventIdByPage,
  upsertEvent,
  upsertEventInfo,
  pageExtractionSchema
} from "@shared";
import type {
  PageStructuredInsert,
  PageUpdate,
  EventInsert,
  EventInfoInsert,
  PageSummary
} from "@shared";
import type { EventExtraction } from "@shared";

type EventExtractionRow = {
    pageId: string;
    payload: EventExtraction;
};

type Params = { pageIds: string[] };

export class ExtractEventPages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        console.log(`[ExtractEventPages] Starting - ${pageIds.length} pages to extract`);

        // Load minimal page data first
        const pages = await step.do("load-pages", async () => {
            const loaded = await selectPagesByIds(supabase, pageIds);
            console.log(`[ExtractEventPages] Loaded ${loaded.length} pages`);
            loaded.forEach(p => {
                console.log(`[ExtractEventPages] Page ${p.id} url=${p.url ?? p.normalized_url} kind=${p.kind}`);
            });
            return loaded;
        });

        let successCount = 0;
        let errorCount = 0;
        const processedPageIds: string[] = [];

        for (const p of pages) {
            try {
                const originalKind = p.kind;
                console.log(
                    `[ExtractEventPages] Extracting ${p.url ?? p.normalized_url} (kind=${originalKind})`
                );
                const md = await step.do(`load-md:${p.id}`, async () => {
                    return (await getPageMarkdown(supabase, p.id)) ?? "";
                });
                if (!md.trim()) {
                    await step.do(`save-empty:${p.id}`, async () => {
                        const row: PageStructuredInsert = {
                            page_id: p.id,
                            parse_status: "error",
                            extraction_error: "No markdown to extract",
                        };
                        await upsertPageStructured(supabase, row);
                        console.log(`[ExtractEventPages] Saved empty structured row for ${p.id}`);
                    });
                    continue;
                }

                const extraction = await step.do(`extract:${p.id}`, async () => {
                    console.log(`[ExtractEventPages] Running AI extraction for ${p.id}`);
                    return extractPageContentFromMarkdown(openai, md, p.url ?? p.normalized_url);
                });

                if ((extraction.type === "event" || extraction.type === "event_detail") && !extraction.payload) {
                    throw new Error("Event extraction returned without payload");
                }

                console.log(`[ExtractEventPages] Classified ${p.url ?? p.normalized_url} as ${extraction.type}`);

                await step.do(`save-structured:${p.id}`, async () => {
                    const row: PageStructuredInsert = {
                        page_id: p.id,
                        parse_status: "ok",
                        schema_version: null,
                        data: extraction,
                        parsed_at: new Date().toISOString(),
                        extraction_error: null,
                    };
                    await upsertPageStructured(supabase, row);
                    console.log(`[ExtractEventPages] Saved structured data for ${p.id}`);
                });

                if (originalKind !== "event") {
                    await step.do(`ensure-kind:${p.id}`, async () => {
                        const pageUpdate: PageUpdate = {
                            kind: "event",
                            updated_at: new Date().toISOString()
                        };
                        await updatePageById(supabase, p.id, pageUpdate);
                        console.log(`[ExtractEventPages] Updated page ${p.id} kind=event`);
                    });
                }
                successCount++;
                processedPageIds.push(p.id);
                console.log(`[ExtractEventPages] Success ${successCount}/${pages.length} - ${p.url ?? p.normalized_url}`);
            } catch (error) {
                errorCount++;
                console.error(`[ExtractEventPages] Error ${errorCount}/${pages.length} - ${p.url ?? p.normalized_url}:`, error);
                await step.do(`save-error:${p.id}`, async () => {
                    const row: PageStructuredInsert = {
                        page_id: p.id,
                        parse_status: "error",
                        extraction_error: error instanceof Error ? error.message : String(error),
                    };
                    await upsertPageStructured(supabase, row);
                    console.log(`[ExtractEventPages] Saved extraction error for ${p.id}`);
                });
            }
        }

        console.log(`[ExtractEventPages] Complete - ${successCount} successes, ${errorCount} errors`);

        if (processedPageIds.length === 0) {
            return { ok: true, processed: successCount, events: 0 };
        }

        const eventExtractions = await step.do("load-event-extractions", async () => {
            const rows = await selectEventExtractions(supabase, processedPageIds);
            const parsed: EventExtractionRow[] = [];
            for (const row of rows) {
                try {
                    const data = pageExtractionSchema.parse(row.data);
                    const payload =
                        data.type === "event" || data.type === "event_detail" ? data.payload : null;
                    if (!payload) continue;
                    parsed.push({ pageId: row.page_id, payload });
                } catch (error) {
                    console.error(`[ExtractEventPages] Failed parsing structured data for ${row.page_id}`, error);
                }
            }
            console.log(`[ExtractEventPages] Prepared ${parsed.length} event payloads`);
            return parsed;
        });

        const pageMap = new Map(pages.map(page => [page.id, page]));
        const processedEventIds: string[] = [];

        for (const extraction of eventExtractions) {
            const page = pageMap.get(extraction.pageId);
            if (!page || !page.gallery_id) {
                console.log(`[ExtractEventPages] Skipping event processing for page ${extraction.pageId} - missing gallery`);
                continue;
            }

            const eventId = await step.do(`upsert-event:${page.id}`, async () => {
                const existingId = await findEventIdByPage(supabase, page.id);
                const payload = extraction.payload;

                // Simplified schema: timing goes directly on event
                // If AI extracted occurrences, use the first one; otherwise use direct start_at/end_at
                const firstOccurrence = payload.occurrences?.[0];
                const start_at = firstOccurrence?.start_at ?? payload.start_at;
                const end_at = firstOccurrence?.end_at ?? payload.end_at ?? null;
                const timezone = firstOccurrence?.timezone ?? 'Europe/Warsaw';

                if (!start_at) {
                    console.warn(`[ExtractEventPages] Event "${payload.title}" has no start_at, using current timestamp`);
                }

                const eventRecord: EventInsert = {
                    gallery_id: page.gallery_id!,
                    page_id: page.id,
                    title: payload.title,
                    start_at: start_at ?? new Date().toISOString(),
                    end_at,
                    timezone,
                    status: payload.status ?? "unknown",
                    ticket_url: payload.ticket_url ?? null
                };

                const updatedEventId = await upsertEvent(supabase, eventRecord, existingId);

                const eventInfo: EventInfoInsert = {
                    event_id: updatedEventId,
                    source_page_id: page.id,
                    data: payload,
                    description: payload.description ?? null,
                    artists: payload.artists ?? null,
                    tags: payload.tags ?? null,
                    prices: payload.prices ?? null,
                    images: payload.images ?? null
                };

                await upsertEventInfo(supabase, eventInfo);

                console.log(
                    `[ExtractEventPages] Processed event "${payload.title}" for page ${page.id} (event ${updatedEventId})`
                );

                return updatedEventId;
            });

            if (eventId) {
                processedEventIds.push(eventId);
            }
        }

        console.log(
            `[ExtractEventPages] Event processing complete - ${processedEventIds.length} events linked`
        );

        // Automatically trigger embedding for extracted events
        if (processedEventIds.length > 0) {
            await step.do("trigger-embedding", async () => {
                console.log(`[ExtractEventPages] Triggering embedding for ${processedEventIds.length} events`);
                await this.env.EMBEDDING.create({ params: { eventIds: processedEventIds } });
            });
        }

        return { ok: true, processed: successCount, events: processedEventIds.length };
    }
}
