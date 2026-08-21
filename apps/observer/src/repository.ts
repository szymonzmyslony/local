import {
  AI_CONFIG,
  createEmbedder,
  type Database,
  getMarketConfig,
  getServiceClient,
  isMarketCode,
  type Json,
  type MarketCode,
  toPgVector
} from "@gallery-agents/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalEventFingerprint,
  eventMatchToleranceMs,
  isSameCanonicalEvent,
  normalizeEventTitle,
  type ObservedEventIdentity
} from "./event-identity";
import type {
  ConfiguredGalleryObserverState,
  ExtractedEvent,
  GalleryObserverState,
  GalleryProfileExtraction,
  GallerySource,
  ObservationExtraction,
  RegisterGalleryInput
} from "./schemas";
import {
  classifyEventSourceUrl,
  SOURCE_ADMISSION_LIMITS
} from "./source-policy";
import {
  nextAnchoredCheckAt,
  normalizeSourceUrl,
  sha256,
  stableMinute
} from "./url";

type DatabaseClient = SupabaseClient<Database>;

const SOURCE_DUE_EARLY_TOLERANCE_MS = 60 * 60 * 1000;

export type GalleryRecord = {
  id: string;
  main_url: string;
  normalized_main_url: string;
  about_url: string | null;
  events_page: string | null;
  market: MarketCode;
  city: string;
  country_code: string;
  timezone: string;
  last_observed_at: string | null;
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
  purpose: GallerySource["purpose"];
  fetch_strategy: GallerySource["strategy"];
  enabled: boolean;
  last_content_hash: string | null;
  consecutive_failures: number;
  last_checked_at: string | null;
  next_check_at: string;
  poll_interval_hours: number;
  unchanged_checks: number;
};

export function observerDatabase(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">
) {
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
      "id, main_url, normalized_main_url, about_url, events_page, market, city, country_code, timezone, last_observed_at, observation_status, gallery_info(name, address, area)"
    )
    .eq("id", galleryId)
    .maybeSingle();
  throwIfError("loadGallery", galleryError);
  if (!gallery) throw new Error(`Gallery not found: ${galleryId}`);
  if (!isMarketCode(gallery.market)) {
    throw new Error(`Unsupported gallery market: ${gallery.market}`);
  }

  const { data: sources, error: sourceError } = await db
    .from("gallery_sources")
    .select(
      "id, gallery_id, url, normalized_url, kind, purpose, fetch_strategy, enabled, last_content_hash, last_checked_at, next_check_at, poll_interval_hours, unchanged_checks, consecutive_failures"
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

export async function listActiveMarketGalleries(
  db: DatabaseClient,
  market: MarketCode
): Promise<string[]> {
  const { data, error } = await db
    .from("galleries")
    .select("id")
    .eq("market", market)
    .eq("observation_status", "active")
    .order("id", { ascending: true });
  throwIfError("listActiveMarketGalleries", error);
  return (data ?? []).map((row: { id: string }) => row.id);
}

export function isSourceDue(nextCheckAt: string, now = Date.now()): boolean {
  const nextCheck = Date.parse(nextCheckAt);
  return (
    Number.isFinite(nextCheck) &&
    nextCheck <= now + SOURCE_DUE_EARLY_TOLERANCE_MS
  );
}

export async function stateForGallery(
  db: DatabaseClient,
  galleryId: string
): Promise<GalleryObserverState> {
  const { gallery, sources } = await loadGalleryBundle(db, galleryId);
  const market = getMarketConfig(gallery.market);
  return {
    kind: "configured",
    galleryId: gallery.id,
    name: gallery.gallery_info?.name ?? new URL(gallery.main_url).hostname,
    market,
    status: gallery.observation_status,
    sources: sources.map((source) => ({
      id: source.id,
      url: source.url,
      normalizedUrl: source.normalized_url,
      kind: source.kind,
      purpose: source.purpose,
      strategy: source.fetch_strategy,
      enabled: source.enabled,
      failureKind: null,
      quarantinedUntil:
        source.purpose === "detail" && source.consecutive_failures >= 3
          ? source.next_check_at
          : null,
      polling: !source.last_checked_at
        ? { kind: "never_checked" }
        : isSourceDue(source.next_check_at)
          ? { kind: "due" }
          : { kind: "scheduled", nextCheckAt: source.next_check_at }
    })),
    workflow: { kind: "idle" },
    observation: gallery.last_observed_at
      ? { kind: "observed", observedAt: gallery.last_observed_at }
      : { kind: "never" }
  };
}

export async function registerMarketGallery(
  db: DatabaseClient,
  input: RegisterGalleryInput
): Promise<string> {
  const config = getMarketConfig(input.market);
  const mainUrl = normalizeSourceUrl(input.sources.mainUrl);
  const eventsUrl =
    "eventsUrl" in input.sources
      ? normalizeSourceUrl(input.sources.eventsUrl)
      : null;
  const aboutUrl =
    "aboutUrl" in input.sources
      ? normalizeSourceUrl(input.sources.aboutUrl)
      : null;
  const now = new Date().toISOString();

  const { data: exactGallery, error: exactError } = await db
    .from("galleries")
    .select("id")
    .eq("market", input.market)
    .eq("normalized_main_url", mainUrl)
    .maybeSingle();
  throwIfError("findGalleryByUrl", exactError);

  let galleryId = exactGallery?.id ?? null;
  if (!galleryId) {
    const { data: nameMatches, error: nameError } = await db
      .from("gallery_info")
      .select("gallery_id, galleries!inner(market)")
      .eq("name", input.name)
      .eq("galleries.market", input.market)
      .limit(2);
    throwIfError("findGalleryByName", nameError);
    if ((nameMatches ?? []).length > 1) {
      throw new Error(
        `Gallery name is ambiguous in ${config.city}: ${input.name}`
      );
    }
    galleryId = nameMatches?.[0]?.gallery_id ?? null;
  }

  const galleryValues = {
    main_url: mainUrl,
    normalized_main_url: mainUrl,
    market: config.market,
    city: config.city,
    country_code: config.countryCode,
    timezone: config.timezone,
    observation_status: "active",
    observation_interval_hours: 24,
    updated_at: now,
    ...(eventsUrl ? { events_page: eventsUrl } : {}),
    ...(aboutUrl ? { about_url: aboutUrl } : {})
  };

  if (galleryId) {
    const { error } = await db
      .from("galleries")
      .update(galleryValues)
      .eq("id", galleryId)
      .eq("market", config.market);
    throwIfError("activateMarketGallery", error);
  } else {
    const { data: gallery, error } = await db
      .from("galleries")
      .insert(galleryValues)
      .select("id")
      .single();
    throwIfError("registerMarketGallery", error);
    if (!gallery) throw new Error(`Failed to register gallery: ${input.name}`);
    galleryId = gallery.id;
  }

  const infoValues = {
    gallery_id: galleryId,
    name: input.name,
    updated_at: now,
    ...(input.location.kind === "known" ||
    input.location.kind === "address_only"
      ? { address: input.location.address }
      : {}),
    ...(input.location.kind === "known" || input.location.kind === "area_only"
      ? { area: input.location.area }
      : {})
  };
  const { error: infoError } = await db
    .from("gallery_info")
    .upsert(infoValues, { onConflict: "gallery_id" });
  throwIfError("registerMarketGalleryInfo", infoError);

  const candidates = [
    { url: mainUrl, kind: "home" as const, purpose: "bootstrap" as const },
    ...(eventsUrl
      ? [{ url: eventsUrl, kind: "events" as const, purpose: "listing" as const }]
      : []),
    ...(aboutUrl
      ? [{ url: aboutUrl, kind: "about" as const, purpose: "profile" as const }]
      : [])
  ];
  for (const source of candidates) {
    await upsertGallerySource(
      db,
      galleryId,
      source.url,
      source.kind,
      source.purpose,
      1
    );
    const { error: staleSourceError } = await db
      .from("gallery_sources")
      .update({ enabled: false, updated_at: now })
      .eq("gallery_id", galleryId)
      .eq("kind", source.kind)
      .neq("normalized_url", source.url);
    throwIfError("disableReplacedGallerySource", staleSourceError);
  }

  return galleryId;
}

export async function upsertGallerySource(
  db: DatabaseClient,
  galleryId: string,
  url: string,
  kind: GallerySource["kind"],
  purpose: GallerySource["purpose"],
  confidence: number
): Promise<boolean> {
  if (confidence < 0.8) return false;
  const normalizedUrl = normalizeSourceUrl(url);
  const { data: existing, error: existingError } = await db
    .from("gallery_sources")
    .select("id, enabled")
    .eq("gallery_id", galleryId)
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();
  throwIfError("findGallerySourceForAdmission", existingError);
  if (!existing?.enabled) {
    if (existing) {
      console.warn(
        JSON.stringify({
          event: "gallery_source_admission_rejected",
          galleryId,
          normalizedUrl,
          purpose,
          reason: "previously_disabled"
        })
      );
      return false;
    }
    const { count, error: countError } = await db
      .from("gallery_sources")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", galleryId)
      .eq("purpose", purpose)
      .eq("enabled", true);
    throwIfError("countGallerySourcesForAdmission", countError);
    if ((count ?? 0) >= SOURCE_ADMISSION_LIMITS[purpose]) {
      console.warn(
        JSON.stringify({
          event: "gallery_source_admission_rejected",
          galleryId,
          normalizedUrl,
          purpose,
          reason: "purpose_limit_reached",
          limit: SOURCE_ADMISSION_LIMITS[purpose]
        })
      );
      return false;
    }
  }
  const { error } = await db.from("gallery_sources").upsert(
    {
      gallery_id: galleryId,
      url: normalizedUrl,
      normalized_url: normalizedUrl,
      kind,
      purpose,
      poll_interval_hours: purpose === "listing" || purpose === "bootstrap" ? 24 : 168,
      fetch_strategy: "browser_markdown",
      enabled: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "gallery_id,normalized_url" }
  );
  throwIfError("upsertGallerySource", error);
  return true;
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
    .select("id, decision, canonical_event_id")
    .eq("run_id", runId);
  throwIfError("summarizeObservationRun", error);
  const rows = data ?? [];
  return {
    candidates: rows.length,
    published: new Set(
      rows
        .filter((row) => row.decision === "published" && row.canonical_event_id)
        .map((row) => row.canonical_event_id)
    ).size
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
    strategy: GallerySource["strategy"];
    browserMs: number | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { error: snapshotError } = await db.from("source_snapshots").upsert(
    {
      run_id: input.runId,
      source_id: input.source.id,
      source_url: input.source.normalizedUrl,
      strategy: input.strategy,
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
      last_checked_at: now,
      consecutive_failures: 0,
      updated_at: now
    })
    .eq("id", input.source.id);
  throwIfError("updateGallerySourceSnapshot", sourceError);
}

export async function recordSourceFailure(
  db: DatabaseClient,
  input: { sourceId: string; error: string }
): Promise<void> {
  const { data: source, error: sourceReadError } = await db
    .from("gallery_sources")
    .select("consecutive_failures, purpose")
    .eq("id", input.sourceId)
    .single();
  throwIfError("readGallerySourceFailureCount", sourceReadError);

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const failures = (source?.consecutive_failures ?? 0) + 1;
  const failureKind = classifySourceFailure(input.error);
  const quarantinedUntil =
    source?.purpose === "detail" && failures >= 3
      ? new Date(nowDate.valueOf() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const backoffHours = Math.min(2 ** Math.max(0, failures - 1), 24);
  const { error: sourceUpdateError } = await db
    .from("gallery_sources")
    .update({
      last_checked_at: now,
      next_check_at:
        quarantinedUntil ??
        new Date(nowDate.valueOf() + backoffHours * 60 * 60 * 1000).toISOString(),
      consecutive_failures: failures,
      updated_at: now
    })
    .eq("id", input.sourceId);
  throwIfError("recordGallerySourceFailure", sourceUpdateError);
  console.warn(
    JSON.stringify({
      event: "gallery_source_failure_recorded",
      sourceId: input.sourceId,
      failureKind,
      failures,
      quarantinedUntil,
      error: input.error.slice(0, 500)
    })
  );
}

export function classifySourceFailure(
  error: string
): NonNullable<GallerySource["failureKind"]> {
  if (/exceeded \d+ bytes|size|too large/i.test(error)) return "size_limit";
  if (/timeout|timed out|abort/i.test(error)) return "timeout";
  if (/HTTP fetch failed|\bHTTP\b.*\(\d{3}\)/i.test(error)) return "http";
  if (/Browser Run|Browser Rendering/i.test(error)) return "browser";
  if (/JSON|parse|schema|non-JSON/i.test(error)) return "parse";
  if (/network|fetch failed|ECONN|DNS/i.test(error)) return "network";
  return "unknown";
}

export async function commitSourceSnapshot(
  db: DatabaseClient,
  input: {
    sourceId: string;
    galleryId: string;
    timezone: string;
    purpose: GallerySource["purpose"];
    contentHash: string;
    changed: boolean;
  }
): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const { data: current, error: readError } = await db
    .from("gallery_sources")
    .select("unchanged_checks")
    .eq("id", input.sourceId)
    .single();
  throwIfError("readGallerySourceLifecycle", readError);
  const unchangedChecks = input.changed
    ? 0
    : (current?.unchanged_checks ?? 0) + 1;
  const intervalHours =
    input.purpose === "listing" || input.purpose === "bootstrap" ? 24 : 168;
  const minuteOfDay =
    input.purpose === "profile"
      ? stableMinute(`${input.galleryId}:profile`)
      : stableMinute(input.galleryId);
  const weekday =
    input.purpose === "profile"
      ? 1
      : input.purpose === "detail"
        ? stableMinute(input.sourceId, 0, 7)
        : undefined;
  const { error } = await db
    .from("gallery_sources")
    .update({
      last_content_hash: input.contentHash,
      last_changed_at: input.changed ? now : undefined,
      next_check_at: nextAnchoredCheckAt({
        after: nowDate,
        timezone: input.timezone,
        minuteOfDay,
        weekday
      }),
      poll_interval_hours: intervalHours,
      unchanged_checks: unchangedChecks,
      enabled: !(input.purpose === "detail" && unchangedChecks >= 2),
      consecutive_failures: 0,
      updated_at: now
    })
    .eq("id", input.sourceId);
  throwIfError("commitGallerySourceSnapshot", error);
}

async function classifyObservedSource(
  db: DatabaseClient,
  source: GallerySource,
  extraction: ObservationExtraction
): Promise<void> {
  const purpose: GallerySource["purpose"] =
    source.kind === "home"
      ? "bootstrap"
      : source.kind === "about"
      ? "profile"
      : extraction.page_kind === "event"
        ? "detail"
        : extraction.page_kind === "events" || extraction.page_kind === "calendar"
          ? "listing"
          : source.purpose;
  if (purpose === source.purpose) return;
  const { error } = await db
    .from("gallery_sources")
    .update({
      purpose,
      poll_interval_hours: purpose === "listing" || purpose === "bootstrap" ? 24 : 168,
      updated_at: new Date().toISOString()
    })
    .eq("id", source.id);
  throwIfError("classifyObservedSource", error);
}

export async function persistGalleryProfile(
  db: DatabaseClient,
  env: Pick<Env, "OPENROUTER_API_KEY">,
  input: {
    galleryId: string;
    profile: GalleryProfileExtraction;
    sourceUrl: string;
  }
): Promise<void> {
  const { data: existing, error: readError } = await db
    .from("gallery_info")
    .select("name, about, address, area, tags, data, embedding")
    .eq("gallery_id", input.galleryId)
    .maybeSingle();
  throwIfError("loadGalleryProfile", readError);

  const incomingName =
    input.profile.name.kind === "known" ? input.profile.name.value.trim() : "";
  const extractedAbout =
    input.profile.about.kind === "known"
      ? input.profile.about.value.trim()
      : "";
  const incomingAbout = /^(?:we(?:'re| are)|currently) (?:now )?closed\b/i.test(
    extractedAbout
  )
    ? ""
    : extractedAbout;
  const incomingAddress =
    input.profile.location.kind === "address" ||
    input.profile.location.kind === "address_and_area"
      ? input.profile.location.address.trim()
      : "";
  const incomingArea =
    input.profile.location.kind === "area" ||
    input.profile.location.kind === "address_and_area"
      ? input.profile.location.area.trim()
      : "";
  const existingAbout = existing?.about?.trim() ?? "";
  const about =
    incomingAbout.length > existingAbout.length ? incomingAbout : existingAbout;
  const tags = uniqueNonEmpty([...(existing?.tags ?? []), ...input.profile.tags]);
  const existingEvidence = existing
    ? dataStringArray(existing.data, "profileEvidence")
    : [];
  const profileEvidence = uniqueNonEmpty([
    ...existingEvidence,
    ...input.profile.evidence
  ]);
  const now = new Date().toISOString();
  const values = {
    gallery_id: input.galleryId,
    name: incomingName || existing?.name || new URL(input.sourceUrl).hostname,
    about: about || null,
    address: incomingAddress || existing?.address || null,
    area: incomingArea || existing?.area || null,
    tags,
    data: {
      ...(existing?.data &&
      typeof existing.data === "object" &&
      !Array.isArray(existing.data)
        ? existing.data
        : {}),
      profileEvidence,
      profileSources: uniqueNonEmpty([
        ...(existing ? dataStringArray(existing.data, "profileSources") : []),
        input.sourceUrl
      ])
    },
    updated_at: now
  };
  const { error: writeError } = await db
    .from("gallery_info")
    .upsert(values, { onConflict: "gallery_id" });
  throwIfError("persistGalleryProfile", writeError);

  if (input.profile.hours.kind === "weekly") {
    const rows = input.profile.hours.days
      .map((day) => ({
        gallery_id: input.galleryId,
        weekday: day.weekday,
        open_minutes: day.ranges
          .filter((range) => range.closesAtMinutes > range.opensAtMinutes)
          .map((range) => [range.opensAtMinutes, range.closesAtMinutes])
      }))
      .filter((day) => day.open_minutes.length > 0);
    if (rows.length > 0) {
      const { error: deleteError } = await db
        .from("gallery_hours")
        .delete()
        .eq("gallery_id", input.galleryId);
      throwIfError("replaceGalleryHours", deleteError);
      const { error: hoursError } = await db.from("gallery_hours").insert(rows);
      throwIfError("persistGalleryHours", hoursError);
    }
  }

  const embeddingText = [
    values.name,
    values.about,
    values.address,
    values.area,
    ...values.tags
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);
  const semanticProfileChanged =
    !existing?.embedding ||
    values.name !== existing.name ||
    values.about !== existing.about ||
    values.address !== existing.address ||
    values.area !== existing.area ||
    JSON.stringify(values.tags) !== JSON.stringify(existing.tags ?? []);
  if (semanticProfileChanged) {
    const vector = await createEmbedder(env.OPENROUTER_API_KEY)(embeddingText);
    const { error: embeddingError } = await db.rpc(
      "set_gallery_info_embedding",
      {
        p_gallery_id: input.galleryId,
        p_embedding: toPgVector(vector),
        p_embedding_model: AI_CONFIG.EMBEDDING_MODEL,
        p_embedding_created_at: now
      }
    );
    throwIfError("embedGalleryProfile", embeddingError);
  }
}

function cleanUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    return normalizeSourceUrl(input);
  } catch {
    return null;
  }
}

type ExistingEventInfo = Pick<
  Database["public"]["Tables"]["event_info"]["Row"],
  "description" | "artists" | "tags" | "images" | "data"
>;

type IncomingEventInfo = {
  description: string | null;
  artists: string[];
  tags: string[];
  images: string[];
  evidence: string[];
  source: string;
};

type MergedEventInfo = {
  description: string | null;
  artists: string[];
  tags: string[];
  images: string[];
  data: Json;
};

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged;
}

function dataStringArray(data: Json, key: string): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const value = data[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function dataString(data: Json, key: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data[key];
  return typeof value === "string" ? value : null;
}

export function mergeObservedEventInfo(
  existing: ExistingEventInfo | null,
  incoming: IncomingEventInfo
): MergedEventInfo {
  const existingDescription = existing?.description?.trim() || null;
  const incomingDescription = incoming.description?.trim() || null;
  const description =
    incomingDescription &&
    (!existingDescription ||
      incomingDescription.length > existingDescription.length)
      ? incomingDescription
      : existingDescription;
  const previousEvidence = existing
    ? dataStringArray(existing.data, "evidence")
    : [];
  const previousSources = existing
    ? [
        ...dataStringArray(existing.data, "sources"),
        ...(dataString(existing.data, "source")
          ? [dataString(existing.data, "source") as string]
          : [])
      ]
    : [];
  const sources = uniqueNonEmpty([...previousSources, incoming.source]);

  return {
    description,
    artists: uniqueNonEmpty([
      ...(existing?.artists ?? []),
      ...incoming.artists
    ]),
    tags: uniqueNonEmpty([...(existing?.tags ?? []), ...incoming.tags]),
    images: uniqueNonEmpty([...(existing?.images ?? []), ...incoming.images]),
    data: {
      evidence: uniqueNonEmpty([...previousEvidence, ...incoming.evidence]),
      source: incoming.source,
      sources
    }
  };
}

function evaluateCandidate(event: ExtractedEvent, now: Date) {
  const reasons: string[] = [];
  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;
  if (!start || Number.isNaN(start.valueOf()))
    reasons.push("missing_or_invalid_start_at");
  if (end && Number.isNaN(end.valueOf())) reasons.push("invalid_end_at");
  if (start && end && end < start) reasons.push("end_before_start");
  if (end && end < new Date(now.valueOf() - 24 * 60 * 60 * 1000))
    reasons.push("event_ended");
  if (
    !end &&
    start &&
    start < new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000)
  ) {
    reasons.push("stale_start_without_end");
  }
  if (event.confidence < 0.82)
    reasons.push("confidence_below_publish_threshold");
  if (event.evidence.length === 0) reasons.push("missing_evidence");
  if (event.venue.kind === "outside_market")
    reasons.push("venue_outside_market");
  if (event.venue.kind === "unknown") reasons.push("venue_unverified");
  return reasons;
}

export async function persistObservation(
  db: DatabaseClient,
  env: Pick<Env, "OPENROUTER_API_KEY">,
  input: {
    runId: string;
    state: ConfiguredGalleryObserverState;
    source: GallerySource;
    extraction: ObservationExtraction;
  }
): Promise<{ candidates: number; published: number }> {
  const galleryId = input.state.galleryId;
  const now = new Date();
  const embed = createEmbedder(env.OPENROUTER_API_KEY);
  let published = 0;

  await classifyObservedSource(db, input.source, input.extraction);

  const canDiscoverFromSource =
    input.source.purpose === "bootstrap" || input.source.purpose === "listing";
  for (const discovered of canDiscoverFromSource
    ? input.extraction.discovered_sources.slice(0, 20)
    : []) {
    try {
      const admitted = classifyEventSourceUrl(
        discovered.url,
        input.source.normalizedUrl,
        { kind: discovered.kind, purpose: discovered.purpose }
      );
      if (!admitted) continue;
      await upsertGallerySource(
        db,
        galleryId,
        admitted.url,
        admitted.kind,
        admitted.purpose,
        discovered.confidence
      );
    } catch {
      // Discovery is advisory; malformed or cross-origin links are ignored.
    }
  }

  for (const event of input.extraction.events) {
    const normalizedTitle = normalizeEventTitle(
      event.title,
      input.state.market.locale
    );
    const canonicalFingerprint = event.start_at
      ? await canonicalEventFingerprint({
          galleryId,
          title: event.title,
          startAt: event.start_at,
          locale: input.state.market.locale
        })
      : await sha256([galleryId, normalizedTitle, ""].join("|"));
    const candidateFingerprint = await sha256(
      [canonicalFingerprint, input.source.normalizedUrl].join("|")
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
      const startAt = new Date(event.start_at);
      const observedIdentity: ObservedEventIdentity = event.end_at
        ? {
            kind: "range",
            title: event.title,
            startAt,
            endAt: new Date(event.end_at)
          }
        : { kind: "point", title: event.title, startAt };
      const matchToleranceMs = eventMatchToleranceMs(observedIdentity);
      const { data: nearbyEvents, error: nearbyError } = await db
        .from("events")
        .select(
          "id, title, start_at, end_at, ticket_url, source_url, confidence, status"
        )
        .eq("gallery_id", galleryId)
        .gte(
          "start_at",
          new Date(startAt.valueOf() - matchToleranceMs).toISOString()
        )
        .lte(
          "start_at",
          new Date(startAt.valueOf() + matchToleranceMs).toISOString()
        )
        .limit(50);
      throwIfError("findCanonicalEvent", nearbyError);
      const existingEvent = nearbyEvents?.find((candidate) =>
        isSameCanonicalEvent({
          existing: {
            title: candidate.title,
            startAt: new Date(candidate.start_at)
          },
          observed: observedIdentity,
          locale: input.state.market.locale,
          timezone: input.state.market.timezone
        })
      );
      const observedEndAt = event.end_at
        ? new Date(event.end_at).toISOString()
        : null;
      const observedTicketUrl = cleanUrl(event.ticket_url);
      const observedEventUrl = cleanUrl(event.event_url);
      const canonicalValues = {
        gallery_id: galleryId,
        page_id: null,
        title: event.title.trim(),
        start_at: startAt.toISOString(),
        end_at: observedEndAt ?? existingEvent?.end_at ?? null,
        timezone: input.state.market.timezone,
        status:
          event.status === "unknown"
            ? (existingEvent?.status ?? event.status)
            : event.status,
        ticket_url: observedTicketUrl ?? existingEvent?.ticket_url ?? null,
        source_url:
          observedEventUrl ??
          existingEvent?.source_url ??
          input.source.normalizedUrl,
        confidence: Math.max(event.confidence, existingEvent?.confidence ?? 0),
        published: true,
        source_fingerprint: canonicalFingerprint,
        updated_at: now.toISOString()
      };

      if (existingEvent) {
        const { data: canonical, error: eventError } = await db
          .from("events")
          .update(canonicalValues)
          .eq("id", existingEvent.id)
          .select("id")
          .single();
        throwIfError("updateCanonicalEvent", eventError);
        if (!canonical)
          throw new Error("Canonical event update returned no row");
        canonicalEventId = canonical.id;
      } else {
        const { data: canonical, error: eventError } = await db
          .from("events")
          .upsert(
            canonicalValues,
            { onConflict: "gallery_id,source_fingerprint" }
          )
          .select("id")
          .single();
        throwIfError("publishEvent", eventError);
        if (!canonical)
          throw new Error("Canonical event upsert returned no row");
        canonicalEventId = canonical.id;
      }

      const { data: existingInfo, error: existingInfoError } = await db
        .from("event_info")
        .select("description, artists, tags, images, data, embedding")
        .eq("event_id", canonicalEventId)
        .maybeSingle();
      throwIfError("loadExistingEventInfo", existingInfoError);
      const mergedInfo = mergeObservedEventInfo(existingInfo, {
        description: event.description,
        artists: event.artists,
        tags: event.tags,
        images: event.images
          .map(cleanUrl)
          .filter((image): image is string => image !== null),
        evidence: event.evidence,
        source: input.source.normalizedUrl
      });
      const embeddingText = [
        event.title,
        mergedInfo.description,
        ...mergedInfo.artists,
        ...mergedInfo.tags
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 12_000);
      const semanticEventChanged =
        !existingInfo?.embedding ||
        existingEvent?.title !== canonicalValues.title ||
        existingInfo.description !== mergedInfo.description ||
        JSON.stringify(existingInfo.artists) !==
          JSON.stringify(mergedInfo.artists) ||
        JSON.stringify(existingInfo.tags) !== JSON.stringify(mergedInfo.tags);
      const infoWrite = semanticEventChanged
        ? await db.rpc("upsert_observed_event_info", {
            p_event_id: canonicalEventId,
            p_description: mergedInfo.description,
            p_artists: mergedInfo.artists,
            p_tags: mergedInfo.tags,
            p_images: mergedInfo.images,
            p_data: mergedInfo.data,
            p_embedding: toPgVector(await embed(embeddingText)),
            p_embedding_model: AI_CONFIG.EMBEDDING_MODEL,
            p_embedding_created_at: now.toISOString()
          })
        : await db.from("event_info").upsert(
            {
              event_id: canonicalEventId,
              source_page_id: null,
              description: mergedInfo.description,
              artists: mergedInfo.artists,
              tags: mergedInfo.tags,
              images: mergedInfo.images,
              data: mergedInfo.data
            },
            { onConflict: "event_id" }
          );
      const infoError = infoWrite.error;
      throwIfError("publishEventInfo", infoError);
      published += 1;
    }

    const { error: candidateError } = await db.from("event_candidates").upsert(
      {
        run_id: input.runId,
        gallery_id: galleryId,
        source_url: input.source.normalizedUrl,
        source_fingerprint: candidateFingerprint,
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
    .update({
      last_observed_at: now.toISOString(),
      updated_at: now.toISOString()
    })
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
