// Layer-1: read page markdown, extract typed objects with AI (Zod),
// write to source_* tables, and notify Identity layer.

import { extractFromMarkdown } from "@/shared/ai";
import { jsonResponse, readJson } from "@/shared/http";
import type { IdentityQueueMessage, SourceQueueMessage } from "@/shared/messages";
import { getServiceClient, type SupabaseEnv, type SupabaseServiceClient } from "@/shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";

type IngestBody = { url: string; markdown: string };

interface Env extends SupabaseEnv {
  OPENAI_API_KEY: string;
  IDENTITY_PRODUCER: Queue<IdentityQueueMessage>;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/ingest-md" && request.method === "POST") {
      return ingestAndExtract(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<SourceQueueMessage>, env: Env) {
    const sb = getServiceClient(env);

    for (const message of batch.messages) {
      try {
        const { body } = message;
        if (body.type !== "source.extract") {
          message.ack();
          continue;
        }

        await extractForUrl(env, sb, body.url);
        message.ack();
      } catch (err) {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, SourceQueueMessage>;

async function ingestAndExtract(request: Request, env: Env): Promise<Response> {
  const body = await readJson<IngestBody>(request);

  if (!body?.url || !body?.markdown) {
    return jsonResponse(400, { error: "Missing url or markdown" });
  }

  const sb = getServiceClient(env);
  const now = new Date().toISOString();
  const { error } = await sb.from("pages").upsert(
    {
      url: body.url,
      status: 200,
      fetched_at: now,
      md: body.markdown,
      updated_at: now,
    },
    { onConflict: "url" },
  );

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  await extractForUrl(env, sb, body.url);

  return jsonResponse(200, { ok: true, queued: false });
}

async function extractForUrl(env: Env, sb: SupabaseServiceClient, url: string) {
  const { data: page, error } = await sb.from("pages").select("url, md").eq("url", url).single();
  if (error || !page?.md) {
    throw new Error(`Page missing markdown for ${url}`);
  }

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const extracted = await extractFromMarkdown(openai, page.md, page.url);

  await Promise.all([
    insertArtists(env, sb, page.url, extracted.artists ?? []),
    insertGalleries(env, sb, page.url, extracted.galleries ?? []),
    insertEvents(env, sb, page.url, extracted.events ?? []),
  ]);
}

async function insertArtists(
  env: Env,
  sb: SupabaseServiceClient,
  pageUrl: string,
  artists: Awaited<ReturnType<typeof extractFromMarkdown>>["artists"],
) {
  for (const artist of artists) {
    const { data, error } = await sb
      .from("source_artists")
      .upsert(
        {
          page_url: pageUrl,
          name: artist.name,
          bio: artist.bio ?? null,
          website: artist.website ?? null,
          socials: artist.socials ?? [],
        },
        { onConflict: "page_url,name" },
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data) await env.IDENTITY_PRODUCER.send({ type: "identity.index.artist", sourceArtistId: data.id });
  }
}

async function insertGalleries(
  env: Env,
  sb: SupabaseServiceClient,
  pageUrl: string,
  galleries: Awaited<ReturnType<typeof extractFromMarkdown>>["galleries"],
) {
  for (const gallery of galleries) {
    const { data, error } = await sb
      .from("source_galleries")
      .upsert(
        {
          page_url: pageUrl,
          name: gallery.name,
          website: gallery.website ?? null,
          address: gallery.address ?? null,
          description: gallery.description ?? null,
        },
        { onConflict: "page_url,name" },
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data)
      await env.IDENTITY_PRODUCER.send({
        type: "identity.index.gallery",
        sourceGalleryId: data.id,
      });
  }
}

async function insertEvents(
  env: Env,
  sb: SupabaseServiceClient,
  pageUrl: string,
  events: Awaited<ReturnType<typeof extractFromMarkdown>>["events"],
) {
  for (const event of events) {
    const { data, error } = await sb
      .from("source_events")
      .upsert(
        {
          page_url: pageUrl,
          title: event.title,
          description: event.description ?? null,
          url: event.url ?? null,
          start_ts: event.start_ts ?? null,
          end_ts: event.end_ts ?? null,
          venue_name: event.venue_name ?? null,
          participants: event.participants ?? [],
        },
        { onConflict: "page_url,title" },
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data)
      await env.IDENTITY_PRODUCER.send({
        type: "identity.index.event",
        sourceEventId: data.id,
      });
  }
}
