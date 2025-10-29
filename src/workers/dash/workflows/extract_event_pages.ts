import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { pageExtractionSchema } from "../../../shared/schema";

type Params = { pageIds: string[] };

export class ExtractEventPages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        // Load minimal page data first
        const pages = await step.do("load-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, url, normalized_url")
                .in("id", pageIds);
            if (error) throw error;
            return data ?? [];
        });

        for (const p of pages) {
            try {
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
                        const { error } = await supabase.from("page_structured").upsert([
                            { page_id: p.id, parse_status: "error", extraction_error: "No markdown to extract" }
                        ], { onConflict: "page_id" });
                        if (error) throw error;
                    });
                    continue;
                }

                const result = await step.do(`extract:${p.id}`, async () => {
                    const r = await generateObject({
                        model: openai("gpt-5"),
                        schema: pageExtractionSchema,
                        prompt: `Classify the page and, if it is an event_detail, extract a single event object. Return a JSON strictly matching the schema.\n\nURL: ${p.url ?? p.normalized_url}\n---\n${md.slice(0, 50000)}`
                    });
                    return r.object;
                });

                // Map schema type -> extracted_kind enum for page_structured
                const extracted_kind = result.type === "event_detail" ? "event" : "non_event" as const;

                await step.do(`save-structured:${p.id}`, async () => {
                    const { error } = await supabase.from("page_structured").upsert([
                        {
                            page_id: p.id,
                            parse_status: "ok",
                            schema_version: null,
                            data: result,
                            parsed_at: new Date().toISOString(),
                            extracted_kind
                        }
                    ], { onConflict: "page_id" });
                    if (error) throw error;
                });
            } catch (err: unknown) {
                await step.do(`save-error:${p.id}`, async () => {
                    const { error } = await supabase.from("page_structured").upsert([
                        { page_id: p.id, parse_status: "error", extraction_error: String((err as { message?: unknown })?.message ?? err) }
                    ], { onConflict: "page_id" });
                    if (error) throw error;
                });
            }
        }

        return { ok: true as const };
    }
}


