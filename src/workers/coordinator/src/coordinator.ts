// Coordinator = single ingress for Firecrawl + health.
// POST /ingest-md  { url: string, markdown: string }

import { createClient } from '@supabase/supabase-js';

type IngestBody = { url: string; markdown: string };


export default {
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url);

        if (url.pathname === '/health') {
            return new Response('ok');
        }

        if (url.pathname === '/ingest-md' && request.method === 'POST') {
            const body = (await request.json()) as IngestBody;
            if (!body?.url || !body?.markdown) {
                return json(400, { error: 'Missing url or markdown' });
            }

            const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { fetch } });

            const now = new Date().toISOString();
            // URL is the primary key (Layer-1 rule)
            const { error } = await sb.from('pages').upsert(
                {
                    url: body.url,
                    status: 200,
                    fetched_at: now,
                    md: body.markdown,
                    updated_at: now,
                },
                { onConflict: 'url' }
            );

            if (error) return json(500, { error: error.message });

            // Kick Layer-1 extraction
            await env.SOURCE_PRODUCER.send({ type: 'source.extract', url: body.url });

            return json(200, { ok: true, queued: true });
        }

        return new Response('Not found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;

function json(status: number, data: any) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}