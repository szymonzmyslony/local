import type { Database } from "@gallery-agents/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  classifyEventSourceUrl,
  isRejectedEventSourceUrl,
  SOURCE_ADMISSION_LIMITS
} from "../apps/observer/src/source-policy";
import {
  nextAnchoredCheckAt,
  normalizeSourceUrl,
  stableMinute
} from "../apps/observer/src/url";

const commandSchema = z
  .object({ mode: z.enum(["audit", "apply"]), market: z.enum(["ldn", "waw"]) })
  .strict();
const command = commandSchema.parse(
  JSON.parse(process.argv[2] ?? '{"mode":"audit","market":"waw"}')
);
const env = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
  })
  .strict()
  .parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  });
const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const { data: galleries, error: galleryError } = await db
  .from("galleries")
  .select("id, main_url, timezone")
  .eq("market", command.market)
  .limit(1_000);
if (galleryError) throw galleryError;

let disabledAliases = 0;
let disabledEphemeral = 0;
let disabledRejected = 0;
let disabledOverBudget = 0;
let canonicalized = 0;
let reclassified = 0;
let schedulesReanchored = 0;

for (const gallery of galleries ?? []) {
  const { data: sources, error: sourceError } = await db
    .from("gallery_sources")
    .select("*")
    .eq("gallery_id", gallery.id)
    .eq("enabled", true);
  if (sourceError) throw sourceError;
  const groups = new Map<string, NonNullable<typeof sources>>();
  for (const source of sources ?? []) {
    const canonical = normalizeSourceUrl(source.normalized_url);
    const group = groups.get(canonical) ?? [];
    group.push(source);
    groups.set(canonical, group);
  }

  const retained: NonNullable<typeof sources> = [];
  for (const [canonical, rows] of groups) {
    const keeper =
      rows.find((row) => row.normalized_url === canonical) ??
      [...rows].sort(
        (left, right) =>
          left.consecutive_failures - right.consecutive_failures ||
          (right.last_checked_at ?? "").localeCompare(left.last_checked_at ?? "")
      )[0];
    if (!keeper) continue;
    retained.push(keeper);
    for (const duplicate of rows.filter((row) => row.id !== keeper.id)) {
      disabledAliases += 1;
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({
            enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", duplicate.id);
        if (error) throw error;
      }
    }
    if (keeper.normalized_url !== canonical) {
      canonicalized += 1;
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({ url: canonical, normalized_url: canonical })
          .eq("id", keeper.id);
        if (error) throw error;
      }
    }
  }

  const admitted: NonNullable<typeof sources> = [];
  for (const source of retained) {
    if (source.kind === "home") {
      if (source.purpose !== "bootstrap") {
        reclassified += 1;
        if (command.mode === "apply") {
          const { error } = await db
            .from("gallery_sources")
            .update({ purpose: "bootstrap", poll_interval_hours: 24 })
            .eq("id", source.id);
          if (error) throw error;
        }
      }
      admitted.push({ ...source, purpose: "bootstrap" });
      continue;
    }
    if (source.purpose === "profile" || source.purpose === "bootstrap") {
      admitted.push(source);
      continue;
    }
    const classified = classifyEventSourceUrl(source.normalized_url, gallery.main_url, {
      kind: source.kind as "home" | "about" | "events" | "calendar" | "feed" | "other",
      purpose: source.purpose === "listing" ? "listing" : "detail"
    });
    const isMnwEphemeral =
      new URL(gallery.main_url).hostname.replace(/^www\./, "") === "mnw.art.pl" &&
      !classified &&
      /\/kalendarz-wydarzen\/(?:\d{2}-\d{2}-\d{4},dzien|\d{2}-\d{4},miesiac)\.html$/i.test(
        normalizeSourceUrl(source.normalized_url)
      );
    if (isMnwEphemeral) {
      disabledEphemeral += 1;
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({
            enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", source.id);
        if (error) throw error;
      }
      continue;
    }
    if (isRejectedEventSourceUrl(source.normalized_url)) {
      disabledRejected += 1;
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", source.id);
        if (error) throw error;
      }
      continue;
    }
    if (classified && (source.kind !== classified.kind || source.purpose !== classified.purpose)) {
      reclassified += 1;
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({
            kind: classified.kind,
            purpose: classified.purpose,
            poll_interval_hours: classified.purpose === "listing" ? 24 : 168
          })
          .eq("id", source.id);
        if (error) throw error;
      }
      admitted.push({ ...source, kind: classified.kind, purpose: classified.purpose });
    } else {
      admitted.push(source);
    }
  }

  const disabledForBudget = new Set<string>();
  for (const purpose of ["bootstrap", "profile", "listing", "detail"] as const) {
    const candidates = admitted
      .filter((source) => source.purpose === purpose)
      .sort(
        (left, right) =>
          left.consecutive_failures - right.consecutive_failures ||
          (right.last_changed_at ?? "").localeCompare(left.last_changed_at ?? "") ||
          (right.last_checked_at ?? "").localeCompare(left.last_checked_at ?? "")
      );
    for (const source of candidates.slice(SOURCE_ADMISSION_LIMITS[purpose])) {
      disabledOverBudget += 1;
      disabledForBudget.add(source.id);
      if (command.mode === "apply") {
        const { error } = await db
          .from("gallery_sources")
          .update({
            enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", source.id);
        if (error) throw error;
      }
    }
  }

  const now = new Date();
  for (const source of admitted.filter((row) => !disabledForBudget.has(row.id))) {
    const minuteOfDay =
      source.purpose === "profile"
        ? stableMinute(`${gallery.id}:profile`)
        : stableMinute(gallery.id);
    const weekday =
      source.purpose === "profile"
        ? 1
        : source.purpose === "detail"
          ? stableMinute(source.id, 0, 7)
          : undefined;
    const nextCheckAt = nextAnchoredCheckAt({
      after: now,
      timezone: gallery.timezone,
      minuteOfDay,
      weekday
    });
    if (Date.parse(source.next_check_at) === Date.parse(nextCheckAt)) continue;
    schedulesReanchored += 1;
    if (command.mode === "apply") {
      const { error } = await db
        .from("gallery_sources")
        .update({
          next_check_at: nextCheckAt,
          poll_interval_hours:
            source.purpose === "bootstrap" || source.purpose === "listing" ? 24 : 168,
          updated_at: new Date().toISOString()
        })
        .eq("id", source.id);
      if (error) throw error;
    }
  }
}

console.log(
  JSON.stringify({
    event: "market_source_repair_complete",
    market: command.market,
    mode: command.mode,
    disabledAliases,
    disabledEphemeral,
    disabledRejected,
    disabledOverBudget,
    canonicalized,
    reclassified,
    schedulesReanchored
  })
);
