import {
  AI_CONFIG,
  createEmbedder,
  getServiceClient,
  type Database,
  toPgVector
} from "@gallery-agents/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractedEvent,
  GalleryObserverState,
  GallerySource,
  ObservationExtraction
} from "./schemas";
import { normalizeSourceUrl, sha256 } from "./url";

type DatabaseClient = SupabaseClient<Database>;

export type GalleryRecord = {
  id: string;
  main_url: string;
  normalized_main_url: string;
  about_url: string | null;
  events_page: string | null;
  market: "ldn";
  timezone: "Europe/London";
  observation_status: "active" | "paused" | "failing" | "archived";
  gallery_info: {
    name: string | null;
    address: string | null;
    area: string | null;
  } | null;
};

export type SourceRecord = {
  id: string;
  gallery_id: string;
  url: string;
  normalized_url: string;
  kind: GallerySource["kind"];
  fetch_strategy: GallerySource["strategy"];
  enabled: boolean;
  last_content_hash: string | null;
};

export function observerDatabase(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">) {
  return getServiceClient(env);
}

function throwIfError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`[${operation}] ${error.message}`);
}

export async function loadGalleryBundle(
  db: DatabaseClient,
  galleryId: string
): Promise<{ gallery: GalleryRecord; sources: SourceRecord[] }> {
  const { data: gallery, error: galleryError } = await db
    .from("galleries")
    .select(
      "id, main_url, normalized_main_url, about_url, events_page, market, timezone, observation_status, gallery_info(name, address, area)"
    )
    .eq("id", galleryId)
    .eq("market", "ldn")
    .maybeSingle();
  throwIfError("loadGallery", galleryError);
  if (!gallery) throw new Error(`London gallery not found: ${galleryId}`);

  const { data: sources, error: sourceError } = await db
    .from("gallery_sources")
    .select(
      "id, gallery_id, url, normalized_url, kind, fetch_strategy, enabled, last_content_hash"
    )
    .eq("gallery_id", galleryId)
    .eq("enabled", true)
    .order("kind", { ascending: true });
  throwIfError("loadGallerySources", sourceError);

  return {
    gallery: gallery as unknown as GalleryRecord,
    sources: (sources ?? []) as SourceRecord[]
  };
}

export async function listActiveLondonGalleries(db: DatabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("galleries")
    .select("id")
    .eq("market", "ldn")
    .eq("observation_status", "active")
    .order("id", { ascending: true });
  throwIfError("listActiveLondonGalleries", error);
  return (data ?? []).map((row: { id: string }) => row.id);
}

export async function stateForGallery(
  db: DatabaseClient,
  galleryId: string
): Promise<GalleryObserverState> {
  const { gallery, sources } = await loadGalleryBundle(db, galleryId);
  return {
    configured: true,
    galleryId: gallery.id,
    name: gallery.gallery_info?.name ?? null,
    market: "ldn",
    timezone: "Europe/London",
    status: gallery.observation_status,
    sources: sources.map((source) => ({
      id: source.id,
      url: source.url,
      normalizedUrl: source.normalized_url,
      kind: source.kind,
      strategy: source.fetch_strategy,
      enabled: source.enabled
    })),
    lastWorkflowId: null,
    lastObservedAt: null
  };
}

export async function registerLondonGallery(
  db: DatabaseClient,
  input: {
    mainUrl: string;
    name: string;
    eventsUrl?: string | null;
    aboutUrl?: string | null;
    address?: string | null;
    area?: string | null;
  }
): Promise<string> {
  const mainUrl = normalizeSourceUrl(input.mainUrl);
  const eventsUrl = input.eventsUrl ? normalizeSourceUrl(input.eventsUrl) : null;
  const aboutUrl = input.aboutUrl ? normalizeSourceUrl(input.aboutUrl) : null;
  const { data: gallery, error: galleryError } = await db
    .from("galleries")
    .upsert(
      {
        main_url: mainUrl,
        normalized_main_url: mainUrl,
        events_page: eventsUrl,
        about_url: aboutUrl,
        market: "ldn",
        city: "London",
        country_code: "GB",
        timezone: "Europe/London",
        observation_status: "active",
        observation_interval_hours: 24,
        updated_at: new Date().toISOString()
      },
      { onConflict: "normalized_main_url" }
    )
    .select("id")
    .single();
  throwIfError("registerLondonGallery", galleryError);

  const galleryId = (gallery as { id: string }).id;
  const { error: infoError } = await db.from("gallery_info").upsert(
    {
      gallery_id: galleryId,
      name: input.name,
      address: input.address ?? null,
      area: input.area ?? null,
      data: {},
      updated_at: new Date().toISOString()
    },
    { onConflict: "gallery_id" }
  );
  throwIfError("registerLondonGalleryInfo", infoError);

  const candidates = [
    { url: mainUrl, kind: "home" as const },
    ...(eventsUrl ? [{ url: eventsUrl, kind: "events" as const }] : []),
    ...(aboutUrl ? [{ url: aboutUrl, kind: "about" as const }] : [])
  ];
  for (const source of candidates) {
    await upsertGallerySource(db, galleryId, source.url, source.kind, 1);
  }

  return galleryId;
}

export async function upsertGallerySource(
  db: DatabaseClient,
  galleryId: string,
  url: string,
  kind: GallerySource["kind"],
  confidence: number
): Promise<void> {
  if (confidence < 0.8) return;
  const normalizedUrl = normalizeSourceUrl(url);
  const { error } = await db.from("gallery_sources").upsert(
    {
      gallery_id: galleryId,
      url: normalizedUrl,
      normalized_url: normalizedUrl,
      kind,
      fetch_strategy: "browser_markdown",
      enabled: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "gallery_id,normalized_url" }
  );
  throwIfError("upsertGallerySource", error);
}

export async function beginObservationRun(
  db: DatabaseClient,
  input: {
    galleryId: string;
    idempotencyKey: string;
    scheduledFor: number;
    workflowId?: string;
  }
): Promise<string> {
  const row = {
    gallery_id: input.galleryId,
    idempotency_key: input.idempotencyKey,
    scheduled_for: new Date(input.scheduledFor).toISOString(),
    status: "running",
    model: AI_CONFIG.CHAT_MODEL,
    workflow_id: input.workflowId ?? null
  };
  const { data, error } = await db
    .from("observation_runs")
    .upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  throwIfError("beginObservationRun", error);
  if (data) return (data as { id: string }).id;

  const { data: existing, error: existingError } = await db
    .from("observation_runs")
    .select("id")
    .eq("idempotency_key", input.idempotencyKey)
    .single();
  throwIfError("findObservationRun", existingError);
  return (existing as { id: string }).id;
}

export async function completeObservationRun(
  db: DatabaseClient,
  runId: string,
  result: {
    status: "unchanged" | "completed" | "partial" | "failed";
    sourcesAttempted: number;
    sourcesChanged: number;
    candidatesFound: number;
    eventsPublished: number;
    error?: string | null;
  }
): Promise<void> {
  const { error } = await db
    .from("observation_runs")
    .update({
      status: result.status,
      sources_attempted: result.sourcesAttempted,
      sources_changed: result.sourcesChanged,
      candidates_found: result.candidatesFound,
      events_published: result.eventsPublished,
      error: result.error?.slice(0, 4000) ?? null,
      completed_at: new Date().toISOString()
    })
    .eq("id", runId);
  throwIfError("completeObservationRun", error);
}

export async function summarizeObservationRun(
  db: DatabaseClient,
  runId: string
): Promise<{ candidates: number; published: number }> {
  const { data, error } = await db
    .from("event_candidates")
    .select("id, decision")
    .eq("run_id", runId);
  throwIfError("summarizeObservationRun", error);
  const rows = data ?? [];
  return {
    candidates: rows.length,
    published: rows.filter((row) => row.decision === "published").length
  };
}

export async function recordSnapshot(
  db: DatabaseClient,
  input: {
    runId: string;
    source: GallerySource;
    r2Key: string;
    contentHash: string;
    contentType: string;
    byteLength: number;
    httpStatus: number;
    changed: boolean;
    browserMs: number | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { error: snapshotError } = await db.from("source_snapshots").upsert(
    {
      run_id: input.runId,
      source_id: input.source.id,
      source_url: input.source.normalizedUrl,
      strategy: input.source.strategy,
      r2_key: input.r2Key,
      content_hash: input.contentHash,
      content_type: input.contentType,
      byte_length: input.byteLength,
      http_status: input.httpStatus,
      changed: input.changed,
      browser_ms: input.browserMs,
      fetched_at: now
    },
    { onConflict: "r2_key" }
  );
  throwIfError("recordSnapshot", snapshotError);

  const { error: sourceError } = await db
    .from("gallery_sources")
    .update({
      last_content_hash: input.contentHash,
      last_checked_at: now,
      last_changed_at: input.changed ? now : undefined,
      consecutive_failures: 0,
      updated_at: now
    })
    .eq("id", input.source.id);
  throwIfError("updateGallerySourceSnapshot", sourceError);
}

function cleanUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    return normalizeSourceUrl(input);
  } catch {
    return null;
  }
}

function evaluateCandidate(event: ExtractedEvent, now: Date) {
  const reasons: string[] = [];
  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;
  if (!start || Number.isNaN(start.valueOf())) reasons.push("missing_or_invalid_start_at");
  if (end && Number.isNaN(end.valueOf())) reasons.push("invalid_end_at");
  if (start && end && end < start) reasons.push("end_before_start");
  if (end && end < new Date(now.valueOf() - 24 * 60 * 60 * 1000)) reasons.push("event_ended");
  if (!end && start && start < new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000)) {
    reasons.push("stale_start_without_end");
  }
  if (event.confidence < 0.82) reasons.push("confidence_below_publish_threshold");
  if (event.evidence.length === 0) reasons.push("missing_evidence");
  return reasons;
}

export async function persistObservation(
  db: DatabaseClient,
  env: Pick<Env, "OPENROUTER_API_KEY">,
  input: {
    runId: string;
    state: GalleryObserverState;
    source: GallerySource;
    extraction: ObservationExtraction;
  }
): Promise<{ candidates: number; published: number }> {
  if (!input.state.galleryId) throw new Error("Observer is not configured");
  const galleryId = input.state.galleryId;
  const now = new Date();
  const embed = createEmbedder(env.OPENROUTER_API_KEY);
  let published = 0;

  for (const discovered of input.extraction.discovered_sources) {
    try {
      const currentOrigin = new URL(input.source.normalizedUrl).origin;
      if (new URL(discovered.url, input.source.normalizedUrl).origin !== currentOrigin) continue;
      await upsertGallerySource(
        db,
        galleryId,
        new URL(discovered.url, input.source.normalizedUrl).toString(),
        discovered.kind,
        discovered.confidence
      );
    } catch {
      // Discovery is advisory; malformed or cross-origin links are ignored.
    }
  }

  for (const event of input.extraction.events) {
    const fingerprint = await sha256(
      [galleryId, event.event_url ?? input.source.normalizedUrl, event.title, event.start_at ?? ""].join("|")
    );
    const rejectionReasons = evaluateCandidate(event, now);
    const decision =
      rejectionReasons.length === 0
        ? "published"
        : event.confidence >= 0.6
          ? "review"
          : "rejected";
    let canonicalEventId: string | null = null;

    if (decision === "published" && event.start_at) {
      const { data: canonical, error: eventError } = await db
        .from("events")
        .upsert(
          {
            gallery_id: galleryId,
            page_id: null,
            title: event.title.trim(),
            start_at: new Date(event.start_at).toISOString(),
            end_at: event.end_at ? new Date(event.end_at).toISOString() : null,
            timezone: "Europe/London",
            status: event.status,
            ticket_url: cleanUrl(event.ticket_url),
            source_url: cleanUrl(event.event_url) ?? input.source.normalizedUrl,
            source_fingerprint: fingerprint,
            confidence: event.confidence,
            published: true,
            updated_at: now.toISOString()
          },
          { onConflict: "gallery_id,source_fingerprint" }
        )
        .select("id")
        .single();
      throwIfError("publishEvent", eventError);
      canonicalEventId = (canonical as { id: string }).id;

      const embeddingText = [event.title, event.description, ...event.artists, ...event.tags]
        .filter(Boolean)
        .join("\n")
        .slice(0, 12_000);
      const vector = embeddingText ? await embed(embeddingText) : [];
      const { error: infoError } = await db.rpc("upsert_observed_event_info", {
        p_event_id: canonicalEventId,
        p_description: event.description,
        p_artists: event.artists,
        p_tags: event.tags,
        p_images: event.images
          .map(cleanUrl)
          .filter((image): image is string => image !== null),
        p_data: { evidence: event.evidence, source: input.source.normalizedUrl },
        p_embedding: toPgVector(vector),
        p_embedding_model: AI_CONFIG.EMBEDDING_MODEL,
        p_embedding_created_at: now.toISOString()
      });
      throwIfError("publishEventInfo", infoError);
      published += 1;
    }

    const { error: candidateError } = await db.from("event_candidates").upsert(
      {
        run_id: input.runId,
        gallery_id: galleryId,
        source_url: input.source.normalizedUrl,
        source_fingerprint: fingerprint,
        payload: event,
        confidence: event.confidence,
        decision,
        rejection_reasons: rejectionReasons,
        canonical_event_id: canonicalEventId,
        observed_at: now.toISOString()
      },
      { onConflict: "run_id,source_fingerprint" }
    );
    throwIfError("persistEventCandidate", candidateError);
  }

  const { error: galleryError } = await db
    .from("galleries")
    .update({ last_observed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", galleryId);
  throwIfError("markGalleryObserved", galleryError);

  return { candidates: input.extraction.events.length, published };
}

export async function recentObservationRuns(db: DatabaseClient, limit = 100) {
  const { data, error } = await db
    .from("observation_runs")
    .select("*, galleries(main_url, gallery_info(name))")
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  throwIfError("recentObservationRuns", error);
  return data ?? [];
}
