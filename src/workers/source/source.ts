/// <reference path="./worker-configuration.d.ts" />

import { extractFromMarkdown } from "@/shared/ai";
import { jsonResponse, readJson } from "@/shared/http";
import type { SourceQueueMessage, IdentityQueueMessage } from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";

type IngestBody = { url: string; markdown: string };

declare global {
  interface Env {
    IDENTITY_PRODUCER: Queue<IdentityQueueMessage>;
    OPENAI_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_ANON_KEY?: string;
  }
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

    if (url.pathname.startsWith("/extract/") && request.method === "POST") {
      const urlToExtract = decodeURIComponent(url.pathname.substring(9));
      return triggerExtraction(urlToExtract, env);
    }

    if (url.pathname === "/extract/pending" && request.method === "GET") {
      return getPendingExtractions(env);
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
        console.error("Extraction error:", err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, SourceQueueMessage>;

/**
 * POST /ingest-md - Manually ingest markdown
 */
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
      extraction_status: "pending",
    },
    { onConflict: "url" },
  );

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  await extractForUrl(env, sb, body.url);

  return jsonResponse(200, { ok: true, queued: false });
}

/**
 * POST /extract/:url - Manually trigger extraction for specific URL
 */
async function triggerExtraction(url: string, env: Env): Promise<Response> {
  if (!url) {
    return jsonResponse(400, { error: "URL required" });
  }

  const sb = getServiceClient(env);

  // Check if page exists
  const { data: page, error } = await sb
    .from("pages")
    .select("url, md, extraction_status")
    .eq("url", url)
    .maybeSingle();

  if (error || !page) {
    return jsonResponse(404, { error: "Page not found" });
  }

  if (!page.md) {
    return jsonResponse(400, { error: "Page has no markdown content" });
  }

  try {
    await extractForUrl(env, sb, url);
    return jsonResponse(200, { ok: true, url });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message });
  }
}

/**
 * GET /extract/pending - List pages with pending extraction
 */
async function getPendingExtractions(env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  const { data, error } = await sb
    .from("pages")
    .select("url, fetched_at")
    .eq("extraction_status", "pending")
    .order("fetched_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, {
    pending: data?.length ?? 0,
    urls: data ?? [],
  });
}

/**
 * Extract entities from a page URL
 */
async function extractForUrl(env: Env, sb: SupabaseServiceClient, url: string) {
  // Get page
  const { data: page, error } = await sb
    .from("pages")
    .select("url, md, extraction_status")
    .eq("url", url)
    .single();

  if (error) {
    throw new Error(`Page not found for ${url}: ${error.message}`);
  }

  if (!page?.md) {
    // Update status to failed
    await sb
      .from("pages")
      .update({ extraction_status: "failed" })
      .eq("url", url);
    throw new Error(`Page missing markdown for ${url}`);
  }

  // Check if already processed
  if (page.extraction_status === "complete") {
    return;
  }

  try {
    // Update status to processing
    await sb
      .from("pages")
      .update({ extraction_status: "processing" })
      .eq("url", url);

    // Extract with OpenAI
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const extracted = await extractFromMarkdown(openai, page.md, page.url);

    // Insert entities
    await Promise.all([
      insertArtists(env, sb, page.url, extracted.artists ?? []),
      insertGalleries(env, sb, page.url, extracted.galleries ?? []),
      insertEvents(env, sb, page.url, extracted.events ?? []),
    ]);

    // Update status to complete
    await sb
      .from("pages")
      .update({ extraction_status: "complete" })
      .eq("url", url);
  } catch (error) {
    // Update status to failed
    await sb
      .from("pages")
      .update({ extraction_status: "failed" })
      .eq("url", url);

    throw error;
  }
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
    if (data) {
      await env.IDENTITY_PRODUCER.send({
        type: "identity.index.artist",
        sourceArtistId: data.id,
      });
    }
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
    if (data) {
      await env.IDENTITY_PRODUCER.send({
        type: "identity.index.gallery",
        sourceGalleryId: data.id,
      });
    }
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
    if (data) {
      await env.IDENTITY_PRODUCER.send({
        type: "identity.index.event",
        sourceEventId: data.id,
      });
    }
  }
}
