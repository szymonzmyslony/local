import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { getFirecrawl } from "../src/utils/firecrawl";

type Params = { pageIds: string[] };

export class ScrapePages extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { pageIds } = event.payload;
        const supabase = getServiceClient(this.env);
        const firecrawl = getFirecrawl(this.env.FIRECRAWL_API_KEY);

        // Resolve URLs for given IDs
        const { data: pages, error } = await supabase
            .from("pages")
            .select("id, normalized_url")
            .in("id", pageIds);
        if (error) throw error;

        for (const p of pages ?? []) {
            try {
                const markdown: string | null = await step.do(`scrape:${p.id}`, async () => {
                    const doc = await firecrawl.scrape(p.normalized_url, { formats: ["markdown"] });
                    if (doc && typeof doc === "object" && "markdown" in doc) {
                        const md = (doc as { markdown?: unknown }).markdown;
                        return typeof md === "string" ? md : null;
                    }
                    return null;
                });

                await step.do(`save-content:${p.id}`, async () => {
                    const { error } = await supabase.from("page_content")
                        .upsert([{ page_id: p.id, markdown, parsed_at: new Date().toISOString() }], { onConflict: "page_id" });
                    if (error) throw error;
                });

                await step.do(`mark-ok:${p.id}`, async () => {
                    const { error } = await supabase.from("pages")
                        .update({ fetch_status: "ok", fetched_at: new Date().toISOString() })
                        .eq("id", p.id);
                    if (error) throw error;
                });
            } catch {
                await step.do(`mark-error:${p.id}`, async () => {
                    const { error } = await supabase.from("pages").update({ fetch_status: "error" }).eq("id", p.id);
                    if (error) throw error;
                });
            }
        }

        return { ok: true as const };
    }
}
