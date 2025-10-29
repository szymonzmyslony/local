import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { createEmbedder } from "../../../shared/embedding";
import { AI_CONFIG } from "../../../shared/config/ai";

/**
 * Assumes Supabase RPCs:
 *   embed_events(_event_ids uuid[]) -> [{ event_id, embedding: number[], model: string }]
 *   embed_galleries(_gallery_ids uuid[]) -> [{ gallery_id, embedding: number[], model: string }]
 */
type Params = { eventIds?: string[]; galleryIds?: string[] };

export class Embed extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { eventIds = [], galleryIds = [] } = event.payload;
        const supabase = getServiceClient(this.env);
        const embedder = createEmbedder(this.env.OPENAI_API_KEY);

        if (eventIds.length) {
            const res = await step.do("embed-call:events", async () => {
                const out: { event_id: string; embedding: number[]; model: string }[] = [];
                for (const id of eventIds) {
                    // Prefer event_info.md; fallback to events.title
                    const { data: info } = await supabase
                        .from("event_info")
                        .select("md")
                        .eq("event_id", id)
                        .limit(1);
                    let text = info?.[0]?.md ?? "";
                    if (!text) {
                        const { data: evt } = await supabase.from("events").select("title").eq("id", id).limit(1);
                        text = evt?.[0]?.title ?? "";
                    }
                    const trimmed = text.trim();
                    if (!trimmed) continue;
                    const vector = await embedder(trimmed);
                    out.push({ event_id: id, embedding: vector, model: AI_CONFIG.EMBEDDING_MODEL });
                }
                return out;
            });
            for (const row of res ?? []) {
                await step.do(`save-embedding:event:${row.event_id}`, async () => {
                    const { error } = await supabase.from("event_info")
                        .update({
                            embedding: JSON.stringify(row.embedding),
                            embedding_model: row.model,
                            embedding_created_at: new Date().toISOString()
                        })
                        .eq("event_id", row.event_id);
                    if (error) throw error;
                });
            }
        }

        if (galleryIds.length) {
            const res = await step.do("embed-call:galleries", async () => {
                const out: { gallery_id: string; embedding: number[]; model: string }[] = [];
                for (const id of galleryIds) {
                    // Prefer gallery_info.name; fallback to galleries.main_url
                    const { data: gInfo } = await supabase
                        .from("gallery_info")
                        .select("name")
                        .eq("gallery_id", id)
                        .limit(1);
                    let text = gInfo?.[0]?.name ?? "";
                    if (!text) {
                        const { data: gRow } = await supabase.from("galleries").select("main_url").eq("id", id).limit(1);
                        text = gRow?.[0]?.main_url ?? "";
                    }
                    const trimmed = text.trim();
                    if (!trimmed) continue;
                    const vector = await embedder(trimmed);
                    out.push({ gallery_id: id, embedding: vector, model: AI_CONFIG.EMBEDDING_MODEL });
                }
                return out;
            });
            for (const row of res ?? []) {
                await step.do(`save-embedding:gallery:${row.gallery_id}`, async () => {
                    const { error } = await supabase.from("gallery_info")
                        .update({
                            embedding: JSON.stringify(row.embedding),
                            embedding_model: row.model,
                            embedding_created_at: new Date().toISOString()
                        })
                        .eq("gallery_id", row.gallery_id);
                    if (error) throw error;
                });
            }
        }

        return { ok: true };
    }
}
