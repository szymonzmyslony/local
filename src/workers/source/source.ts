// Layer-1: read page markdown, extract typed objects with AI (Zod),
// write to source_* tables, and notify Identity layer.

import { extractFromMarkdown } from '@/shared/ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

type SourceMsg = { type: 'source.extract'; url: string };

type IdentityMsg =
    | { type: 'identity.index.artist'; sourceArtistId: string }
    | { type: 'identity.index.gallery'; sourceGalleryId: string }
    | { type: 'identity.index.event'; sourceEventId: string };

interface Env {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    OPENAI_API_KEY?: string;              // used in shared/aiExtract.ts
    IDENTITY_PRODUCER: Queue<IdentityMsg>;
}

export default {
    async queue(batch: MessageBatch<SourceMsg>, env: Env) {
        const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { global: { fetch } });

        for (const { body, ack, retry } of batch.messages) {
            try {
                if (body.type !== 'source.extract') { ack(); continue; }

                // Load markdown for this URL
                const { data: page, error } = await sb.from('pages').select('url, md').eq('url', body.url).single();
                if (error || !page?.md) { ack(); continue; }

                // AI extraction (Zod-validated)
                const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
                const extracted = await extractFromMarkdown(openai, page.md, page.url);

                // Insert artists
                for (const a of extracted.artists) {
                    const { data, error: e } = await sb
                        .from('source_artists')
                        .insert({
                            page_url: page.url,
                            name: a.name,
                            bio: a.bio ?? null,
                            website: a.website ?? null,
                            socials: a.socials ?? [],
                        })
                        .select()
                        .maybeSingle();

                    // Ignore uniqueness clashes (same page_url + name)
                    if (!e && data) {
                        // Hand off to Identity (Layer-2); safe to skip if queue not created yet
                        await env.IDENTITY_PRODUCER.send({ type: 'identity.index.artist', sourceArtistId: data.id });
                    }
                }

                // Insert galleries (institutions)
                for (const g of extracted.galleries) {
                    const { data, error: e } = await sb
                        .from('source_galleries')
                        .insert({
                            page_url: page.url,
                            name: g.name,
                            website: g.website ?? null,
                            address: g.address ?? null,
                            description: g.description ?? null,
                        })
                        .select()
                        .maybeSingle();

                    if (!e && data) {
                        await env.IDENTITY_PRODUCER.send({ type: 'identity.index.gallery', sourceGalleryId: data.id });
                    }
                }

                // Insert events
                for (const ev of extracted.events) {
                    const { data, error: e } = await sb
                        .from('source_events')
                        .insert({
                            page_url: page.url,
                            title: ev.title,
                            description: ev.description ?? null,
                            url: ev.url ?? null,
                            start_ts: ev.start_ts ?? null,
                            end_ts: ev.end_ts ?? null,
                            venue_name: ev.venue_name ?? null,
                            participants: ev.participants ?? [],
                        })
                        .select()
                        .maybeSingle();

                    if (!e && data) {
                        await env.IDENTITY_PRODUCER.send({ type: 'identity.index.event', sourceEventId: data.id });
                    }
                }

                ack();
            } catch (err) {
                console.error('SOURCE error', err);
                retry();
            }
        }
    },
} satisfies ExportedHandler<Env>;