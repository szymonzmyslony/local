import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  AI_CONFIG,
  createEmbedder,
  getServiceClient,
  selectEventInfoText,
  selectEventTitle,
  selectGalleryAbout,
  selectGalleryMainUrl,
  selectGalleryName,
  selectGalleryTags,
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
                    // Idempotency check: Skip if embedding already exists
                    const { data: existingInfo } = await supabase
                        .from("gallery_info")
                        .select("embedding")
                        .eq("gallery_id", id)
                        .maybeSingle();

                    if (existingInfo?.embedding) {
                        console.log(`[Embed] Gallery ${id} already has an embedding, skipping`);
                        continue;
                    }

                    // Fetch gallery_info fields: name, tags, about
                    const name = await selectGalleryName(supabase, id);
                    const tags = await selectGalleryTags(supabase, id);
                    const about = await selectGalleryAbout(supabase, id);

                    // Build embedding text from available fields
                    const parts: string[] = [];
                    if (name) parts.push(`Gallery: ${name}`);
                    if (tags?.length) parts.push(`Tags: ${tags.join(", ")}`);
                    if (about) parts.push(`About: ${about}`);

                    // Fallback to main_url if no gallery_info fields available
                    if (parts.length === 0) {
                        const mainUrl = await selectGalleryMainUrl(supabase, id);
                        if (mainUrl) parts.push(`URL: ${mainUrl}`);
                    }

                    const text = parts.join("\n");
                    const trimmed = text.trim();
                    if (!trimmed) {
                        console.log(`[Embed] No content for gallery ${id}, skipping`);
                        continue;
                    }

                    console.log(`[Embed] Embedding for gallery ${id}:\n${trimmed}`);
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
