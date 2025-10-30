import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  AI_CONFIG,
  createEmbedder,
  getServiceClient,
  selectEventInfoText,
  selectEventTitle,
  selectGalleryMainUrl,
  selectGalleryName,
  updateEventInfoEmbedding,
  updateGalleryInfoEmbedding
} from "@shared";
import type { EventInfoUpdate, GalleryInfoUpdate } from "@shared";

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
                    let text = (await selectEventInfoText(supabase, id)) ?? "";
                    if (!text) {
                        text = (await selectEventTitle(supabase, id)) ?? "";
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
                    const update = {
                        embedding: JSON.stringify(row.embedding),
                        embedding_model: row.model,
                        embedding_created_at: new Date().toISOString(),
                    } satisfies EventInfoUpdate;
                    await updateEventInfoEmbedding(supabase, row.event_id, update);
                });
            }
        }

        if (galleryIds.length) {
            const res = await step.do("embed-call:galleries", async () => {
                const out: { gallery_id: string; embedding: number[]; model: string }[] = [];
                for (const id of galleryIds) {
                    // Prefer gallery_info.name; fallback to galleries.main_url
                    let text = (await selectGalleryName(supabase, id)) ?? "";
                    if (!text) {
                        text = (await selectGalleryMainUrl(supabase, id)) ?? "";
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
                    const update = {
                        embedding: JSON.stringify(row.embedding),
                        embedding_model: row.model,
                        embedding_created_at: new Date().toISOString(),
                    } satisfies GalleryInfoUpdate;
                    await updateGalleryInfoEmbedding(supabase, row.gallery_id, update);
                });
            }
        }

        return { ok: true };
    }
}
