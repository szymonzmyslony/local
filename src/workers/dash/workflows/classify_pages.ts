import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import { getServiceClient } from "../../../shared/supabase";
import { classifyPageKindFromMarkdown } from "../../../shared/ai";
import type { Page, PageUpdate } from "../../../types/common";

type Params = { pageIds: string[] };

type PageWithContent = Pick<Page, "id" | "url" | "normalized_url" | "kind">;

export class ClassifyPages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        console.log(`[ClassifyPages] Starting - ${pageIds.length} pages to classify`);

        const pages = await step.do("load-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, url, normalized_url, kind")
                .in("id", pageIds);
            if (error) throw error;
            const rows = (data ?? []) as PageWithContent[];
            rows.forEach(p => console.log(`[ClassifyPages] Page ${p.id} url=${p.url ?? p.normalized_url} kind=${p.kind}`));
            return rows;
        });

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const page of pages) {
            try {
                const md = await step.do(`load-md:${page.id}`, async () => {
                    const { data, error } = await supabase
                        .from("page_content")
                        .select("markdown")
                        .eq("page_id", page.id)
                        .limit(1)
                        .maybeSingle();
                    if (error) throw error;
                    return data?.markdown ?? "";
                });
                if (!md.trim()) {
                    console.log(`[ClassifyPages] Skipping ${page.id} - no markdown available`);
                    skippedCount++;
                    continue;
                }

                const kind = await step.do(`classify:${page.id}`, async () => {
                    console.log(`[ClassifyPages] Classifying ${page.url ?? page.normalized_url}`);
                    return classifyPageKindFromMarkdown(openai, md, page.url ?? page.normalized_url);
                });

                console.log(`[ClassifyPages] Classified ${page.url ?? page.normalized_url} as ${kind}`);

                await step.do(`update-kind:${page.id}`, async () => {
                    const pageUpdate: PageUpdate = {
                        kind,
                        updated_at: new Date().toISOString()
                    };
                    const { error } = await supabase.from("pages").update(pageUpdate).eq("id", page.id);
                    if (error) throw error;
                    console.log(`[ClassifyPages] Updated page ${page.id} kind=${kind}`);
                });
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`[ClassifyPages] Error while classifying ${page.url ?? page.normalized_url}:`, error);
            }
        }

        console.log(`[ClassifyPages] Complete - ${successCount} classified, ${skippedCount} skipped (no markdown), ${errorCount} errors`);
        return { classified: successCount, skipped: skippedCount, errors: errorCount };
    }
}
