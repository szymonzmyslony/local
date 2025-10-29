import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { pageExtractionSchema } from "../../../shared/schema";
import type { PageStructuredInsert } from "../../../types/common";
import { extractFromMarkdown } from "../../../shared/ai";

type Params = { pageIds: string[] };

export class ExtractEventPages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        console.log(`[ExtractEventPages] Starting - ${pageIds.length} pages to extract`);

        // Load minimal page data first
        const pages = await step.do("load-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, url, normalized_url")
                .in("id", pageIds);
            if (error) throw error;
            console.log(`[ExtractEventPages] Loaded ${data?.length ?? 0} pages`);
            (data ?? []).forEach(p => {
                console.log(`[ExtractEventPages] Page ${p.id} url=${p.url ?? p.normalized_url}`);
            });
            return data ?? [];
        });

        let successCount = 0;
        let errorCount = 0;

        for (const p of pages) {
            try {
                console.log(`[ExtractEventPages] Extracting ${p.url ?? p.normalized_url}`);
                const md = await step.do(`load-md:${p.id}`, async () => {
                    const { data, error } = await supabase
                        .from("page_content")
                        .select("markdown")
                        .eq("page_id", p.id)
                        .limit(1);
                    if (error) throw error;
                    return data?.[0]?.markdown ?? "";
                });
                if (!md.trim()) {
                    await step.do(`save-empty:${p.id}`, async () => {
                        const row = [
                            {
                                page_id: p.id,
                                parse_status: "error" as const,
                                extraction_error: "No markdown to extract",
                            },
                        ] satisfies PageStructuredInsert[];
                        const { error } = await supabase.from("page_structured").upsert(row, { onConflict: "page_id" });
                        if (error) throw error;
                        console.log(`[ExtractEventPages] Saved empty structured row for ${p.id}`);
                    });
                    continue;
                }

                const result = await step.do(`extract:${p.id}`, async () => {
                    console.log(`[ExtractEventPages] Running AI extraction for ${p.id}`);
                    const response = await extractFromMarkdown(openai, md, p.url ?? p.normalized_url, "event");
                    return response;
                });

                console.log(`[ExtractEventPages] Extracted as ${result.description} from ${p.url ?? p.normalized_url}`);

                await step.do(`save-structured:${p.id}`, async () => {
                    const row = [
                        {
                            page_id: p.id,
                            parse_status: "ok" as const,
                            schema_version: null,
                            data: result,
                            parsed_at: new Date().toISOString(),
                            extracted_kind: "non_event",
                        },
                    ] satisfies PageStructuredInsert[];
                    const { error } = await supabase.from("page_structured").upsert(row, { onConflict: "page_id" });
                    if (error) throw error;
                    console.log(`[ExtractEventPages] Saved structured data for ${p.id}`);
                });
                successCount++;
                console.log(`[ExtractEventPages] Success ${successCount}/${pages.length} - ${p.url ?? p.normalized_url}`);
            } catch (err: unknown) {
                errorCount++;
                console.error(`[ExtractEventPages] Error ${errorCount}/${pages.length} - ${p.url ?? p.normalized_url}:`, err);
                await step.do(`save-error:${p.id}`, async () => {
                    const row = [
                        {
                            page_id: p.id,
                            parse_status: "error" as const,
                            extraction_error: String((err as { message?: unknown })?.message ?? err),
                        },
                    ] satisfies PageStructuredInsert[];
                    const { error } = await supabase.from("page_structured").upsert(row, { onConflict: "page_id" });
                    if (error) throw error;
                    console.log(`[ExtractEventPages] Saved extraction error for ${p.id}`);
                });
            }
        }

        console.log(`[ExtractEventPages] Complete - ${successCount} successes, ${errorCount} errors`);
        return { ok: true as const };
    }
}
