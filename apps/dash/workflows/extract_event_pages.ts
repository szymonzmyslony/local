import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractPageContentFromMarkdown,
  getPageMarkdown,
  getServiceClient,
  selectPagesByIds,
  upsertPageStructured,
  updatePageById
} from "@shared";
import type { PageStructuredInsert, PageUpdate } from "@shared";

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
                if (p.kind !== "event_detail" && p.kind !== "event_candidate") {
                    console.log(`[ExtractEventPages] Skipping ${p.id} - kind=${p.kind}`);
                    continue;
                }
                console.log(`[ExtractEventPages] Extracting ${p.url ?? p.normalized_url}`);
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

                if (extraction.type === "event_detail" && !extraction.payload) {
                    throw new Error("Event detail extraction returned without payload");
                }

                console.log(`[ExtractEventPages] Classified ${p.url ?? p.normalized_url} as ${extraction.type}`);

                const extractedKind = extraction.type === "event_detail" || extraction.type === "event_list" ? extraction.type : "other";

                await step.do(`save-structured:${p.id}`, async () => {
                    const row: PageStructuredInsert = {
                        page_id: p.id,
                        parse_status: "ok",
                        schema_version: null,
                        data: extraction,
                        parsed_at: new Date().toISOString(),
                        extracted_page_kind: extractedKind,
                        extraction_error: null,
                    };
                    await upsertPageStructured(supabase, row);
                    console.log(`[ExtractEventPages] Saved structured data for ${p.id}`);
                });

                if (p.kind === "event_candidate") {
                    await step.do(`promote-kind:${p.id}`, async () => {
                        const pageUpdate: PageUpdate = {
                            kind: "event_detail",
                            updated_at: new Date().toISOString()
                        };
                        await updatePageById(supabase, p.id, pageUpdate);
                        console.log(`[ExtractEventPages] Updated page ${p.id} kind=event_detail`);
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
                        extracted_page_kind: null,
                    };
                    await upsertPageStructured(supabase, row);
                    console.log(`[ExtractEventPages] Saved extraction error for ${p.id}`);
                });
            }
        }

        console.log(`[ExtractEventPages] Complete - ${successCount} successes, ${errorCount} errors`);
        if (processedPageIds.length > 0) {
            await step.do("process-events", async () => {
                console.log(`[ExtractEventPages] Triggering ProcessExtractedEvents for ${processedPageIds.length} pages`);
                const run = await this.env.PROCESS_EXTRACTED_EVENTS.create({ params: { pageIds: processedPageIds } });
                console.log(`[ExtractEventPages] ProcessExtractedEvents workflow started ${run.id ?? run}`);
                return run.id ?? run;
            });
        }
        return { ok: true };
    }
}
