// Coordinator = single ingress for Firecrawl + health.
// POST /ingest-md  { url: string, markdown: string }

import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient, type SupabaseEnv } from "@/shared/supabase";
import type {
  EntityType,
  MarkSameRequest,
  SourceQueueMessage,
  GoldenQueueMessage,
} from "@/shared/messages";

type IngestBody = { url: string; markdown: string; enqueue?: boolean };

interface Env extends SupabaseEnv {
  SOURCE_PRODUCER: Queue<SourceQueueMessage>;
  GOLDEN_PRODUCER: Queue<GoldenQueueMessage>;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/ingest-md" && request.method === "POST") {
      return ingestMarkdown(request, env);
    }

    if (url.pathname === "/mark-same" && request.method === "POST") {
      return markSame(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function ingestMarkdown(request: Request, env: Env): Promise<Response> {
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

  const shouldEnqueue = body.enqueue !== false;
  if (shouldEnqueue) {
    await env.SOURCE_PRODUCER.send({ type: "source.extract", url: body.url });
  }

  return jsonResponse(200, { ok: true, queued: shouldEnqueue });
}

async function markSame(request: Request, env: Env): Promise<Response> {
  const body = await readJson<MarkSameRequest>(request);

  if (!body?.entity_type || !body.winner_id || !body.loser_id) {
    return jsonResponse(400, { error: "Missing winner_id, loser_id, or entity_type" });
  }

  const sb = getServiceClient(env);

  const { error } = await sb.rpc("merge_identity_entities", {
    t: body.entity_type satisfies EntityType,
    winner: body.winner_id,
    loser: body.loser_id,
  });

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  await env.GOLDEN_PRODUCER.send({
    type: "golden.materialize",
    entityType: body.entity_type,
    entityId: body.winner_id,
  });

  return jsonResponse(200, { ok: true });
}
