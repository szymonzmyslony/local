import type { Database, Json } from "@gallery-agents/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { canonicalEventFingerprint } from "../apps/observer/src/event-identity";

const commandSchema = z
  .object({
    mode: z.enum(["audit", "apply"]),
    market: z.enum(["ldn", "waw"])
  })
  .strict();
const environmentSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
  })
  .strict();

const command = commandSchema.parse(
  JSON.parse(process.argv[2] ?? '{"mode":"audit","market":"waw"}')
);
const env = environmentSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
});
const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInfoRow = Database["public"]["Tables"]["event_info"]["Row"];

async function loadMarketEvents(): Promise<EventRow[]> {
  const { data: galleries, error: galleryError } = await db
    .from("galleries")
    .select("id")
    .eq("market", command.market)
    .limit(1_000);
  if (galleryError) throw galleryError;
  const ids = (galleries ?? []).map((gallery) => gallery.id);
  const events: EventRow[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await db
      .from("events")
      .select("*")
      .in("gallery_id", ids)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    events.push(...(data ?? []));
    if (!data || data.length < 1_000) return events;
  }
}

async function loadEventInfo(eventIds: string[]): Promise<Map<string, EventInfoRow>> {
  const info = new Map<string, EventInfoRow>();
  for (let offset = 0; offset < eventIds.length; offset += 200) {
    const { data, error } = await db
      .from("event_info")
      .select("*")
      .in("event_id", eventIds.slice(offset, offset + 200));
    if (error) throw error;
    for (const row of data ?? []) info.set(row.event_id, row);
  }
  return info;
}

function union(values: Array<string[] | null>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values.flatMap((entry) => entry ?? [])) {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function infoScore(info: EventInfoRow | undefined): number {
  if (!info) return 0;
  return (
    (info.description?.trim().length ?? 0) +
    (info.artists?.length ?? 0) * 80 +
    (info.tags?.length ?? 0) * 30 +
    (info.images?.length ?? 0) * 60 +
    (info.embedding ? 500 : 0)
  );
}

function mergedInfo(
  keeperId: string,
  rows: EventInfoRow[]
): EventInfoRow | null {
  if (rows.length === 0) return null;
  const richest = [...rows].sort((left, right) => infoScore(right) - infoScore(left))[0];
  if (!richest) return null;
  const descriptions = rows
    .map((row) => row.description?.trim() ?? "")
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  return {
    ...richest,
    event_id: keeperId,
    description: descriptions[0] ?? null,
    artists: union(rows.map((row) => row.artists)),
    tags: union(rows.map((row) => row.tags)),
    images: union(rows.map((row) => row.images))
  };
}

const events = await loadMarketEvents();
const info = await loadEventInfo(events.map((event) => event.id));
const fingerprintById = new Map<string, string>();
const groups = new Map<string, EventRow[]>();
for (const event of events) {
  const fingerprint = await canonicalEventFingerprint({
    galleryId: event.gallery_id,
    title: event.title,
    startAt: event.start_at,
    locale: command.market === "waw" ? "pl-PL" : "en-GB"
  });
  fingerprintById.set(event.id, fingerprint);
  const group = groups.get(fingerprint) ?? [];
  group.push(event);
  groups.set(fingerprint, group);
}

const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
console.log(
  JSON.stringify({
    event: "event_identity_audit",
    market: command.market,
    mode: command.mode,
    events: events.length,
    duplicateGroups: duplicateGroups.length,
    duplicateRows: duplicateGroups.reduce((count, [, rows]) => count + rows.length, 0),
    groups: duplicateGroups.map(([fingerprint, rows]) => ({
      fingerprint,
      galleryId: rows[0]?.gallery_id,
      title: rows[0]?.title,
      startAt: rows[0]?.start_at,
      ids: rows.map((row) => row.id)
    }))
  })
);

if (command.mode === "apply") {
  const mergeRunId = crypto.randomUUID();
  const deletedIds = new Set<string>();
  const keeperOverrides = new Map<string, Partial<EventRow>>();
  for (const [fingerprint, rows] of duplicateGroups) {
    const ordered = [...rows].sort((left, right) => {
      const leftCanonical = left.source_fingerprint === fingerprint ? 1 : 0;
      const rightCanonical = right.source_fingerprint === fingerprint ? 1 : 0;
      return (
        rightCanonical - leftCanonical ||
        infoScore(info.get(right.id)) - infoScore(info.get(left.id)) ||
        (right.confidence ?? 0) - (left.confidence ?? 0) ||
        right.updated_at.localeCompare(left.updated_at)
      );
    });
    const keeper = ordered[0];
    if (!keeper) continue;
    const losers = ordered.slice(1);
    const combinedInfo = mergedInfo(
      keeper.id,
      ordered
        .map((event) => info.get(event.id))
        .filter((row): row is EventInfoRow => Boolean(row))
    );

    for (const loser of losers) {
      const { data: candidates, error: candidateReadError } = await db
        .from("event_candidates")
        .select("id")
        .eq("canonical_event_id", loser.id);
      if (candidateReadError) throw candidateReadError;
      const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
      const auditNow = new Date().toISOString();
      const { error: auditError } = await db.from("observation_runs").insert({
        gallery_id: loser.gallery_id,
        idempotency_key: `maintenance:event-merge:${mergeRunId}:${loser.id}`,
        model: "maintenance:event-identity-repair",
        scheduled_for: auditNow,
        started_at: auditNow,
        completed_at: auditNow,
        status: "completed",
        metadata: {
          kind: "event_merge_audit",
          market: command.market,
          mergeRunId,
          keptEventId: keeper.id,
          mergedEventId: loser.id,
          mergedEvent: loser as unknown as Json,
          mergedEventInfo: (info.get(loser.id) as unknown as Json) ?? null,
          reassignedCandidateIds: candidateIds
        }
      });
      if (auditError) throw auditError;
      if (candidateIds.length > 0) {
        const { error: candidateError } = await db
          .from("event_candidates")
          .update({ canonical_event_id: keeper.id })
          .in("id", candidateIds);
        if (candidateError) throw candidateError;
      }
      const { error: deleteInfoError } = await db
        .from("event_info")
        .delete()
        .eq("event_id", loser.id);
      if (deleteInfoError) throw deleteInfoError;
      const { error: deleteEventError } = await db
        .from("events")
        .delete()
        .eq("id", loser.id);
      if (deleteEventError) throw deleteEventError;
      deletedIds.add(loser.id);
    }

    const endAt = ordered
      .map((event) => event.end_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const keeperValues = {
      end_at: endAt,
      source_url: ordered.find((event) => event.source_url)?.source_url ?? null,
      ticket_url: ordered.find((event) => event.ticket_url)?.ticket_url ?? null,
      confidence: Math.max(...ordered.map((event) => event.confidence ?? 0)),
      published: ordered.some((event) => event.published),
      source_fingerprint: fingerprint,
      updated_at: new Date().toISOString()
    };
    const { error: keeperError } = await db
      .from("events")
      .update(keeperValues)
      .eq("id", keeper.id);
    if (keeperError) throw keeperError;
    keeperOverrides.set(keeper.id, keeperValues);
    if (combinedInfo) {
      const { error: infoError } = await db
        .from("event_info")
        .upsert(combinedInfo, { onConflict: "event_id" });
      if (infoError) throw infoError;
    }
  }

  const remaining = events.filter((event) => !deletedIds.has(event.id));
  for (let offset = 0; offset < remaining.length; offset += 100) {
    const batch = remaining.slice(offset, offset + 100).map((event) => ({
      ...event,
      ...keeperOverrides.get(event.id),
      source_fingerprint: fingerprintById.get(event.id) ?? event.source_fingerprint
    }));
    const { error } = await db.from("events").upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
  console.log(
    JSON.stringify({
      event: "event_identity_repair_complete",
      market: command.market,
      mergeRunId,
      mergedRows: deletedIds.size,
      fingerprintsNormalized: remaining.length
    })
  );
}
