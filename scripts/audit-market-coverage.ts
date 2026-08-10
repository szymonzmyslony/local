import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const environmentSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
  })
  .strict();

const env = environmentSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
});

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

for (const market of ["ldn", "waw"] as const) {
  const now = new Date().toISOString();
  const [galleryResult, eventResult, sourceResult, runResult] =
    await Promise.all([
      db
        .from("galleries")
        .select(
          "id, observation_status, gallery_info(name, address, area), gallery_hours(id)"
        )
        .eq("market", market),
      db
        .from("events")
        .select(
          "id, gallery_id, source_url, event_info(description), galleries!inner(market)"
        )
        .eq("published", true)
        .eq("galleries.market", market)
        .or(`end_at.gte.${now},and(end_at.is.null,start_at.gte.${now})`)
        .limit(1000),
      db
        .from("gallery_sources")
        .select(
          "id, enabled, last_checked_at, consecutive_failures, galleries!inner(market)"
        )
        .eq("galleries.market", market)
        .eq("enabled", true)
        .limit(1000),
      db
        .from("observation_runs")
        .select(
          "gallery_id, status, started_at, error, galleries!inner(market)"
        )
        .eq("galleries.market", market)
        .order("started_at", { ascending: false })
        .limit(1000)
    ]);

  for (const result of [galleryResult, eventResult, sourceResult, runResult]) {
    if (result.error) throw result.error;
  }

  const galleries = galleryResult.data ?? [];
  const events = eventResult.data ?? [];
  const sources = sourceResult.data ?? [];
  const runs = runResult.data ?? [];
  const activeGalleries = galleries.filter(
    (gallery) => gallery.observation_status === "active"
  );
  const eventGalleryIds = new Set(events.map((event) => event.gallery_id));
  const latestRuns = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestRuns.has(run.gallery_id)) latestRuns.set(run.gallery_id, run);
  }

  const runStatuses = [...latestRuns.values()].reduce<Record<string, number>>(
    (counts, run) => {
      counts[run.status] = (counts[run.status] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const described = events.filter((event) => {
    const info = Array.isArray(event.event_info)
      ? event.event_info[0]
      : event.event_info;
    return typeof info?.description === "string" && info.description.trim();
  }).length;

  console.log(
    JSON.stringify(
      {
        market,
        galleries: {
          total: galleries.length,
          active: activeGalleries.length,
          withCurrentEvents: eventGalleryIds.size,
          withoutCurrentEvents: activeGalleries
            .filter((gallery) => !eventGalleryIds.has(gallery.id))
            .map((gallery) => gallery.gallery_info?.name ?? gallery.id),
          withAddress: galleries.filter((gallery) =>
            gallery.gallery_info?.address?.trim()
          ).length,
          withArea: galleries.filter((gallery) =>
            gallery.gallery_info?.area?.trim()
          ).length,
          withHours: galleries.filter(
            (gallery) => gallery.gallery_hours.length > 0
          ).length
        },
        sources: {
          enabled: sources.length,
          checked: sources.filter((source) => source.last_checked_at !== null)
            .length,
          unchecked: sources.filter((source) => source.last_checked_at === null)
            .length,
          failing: sources.filter((source) => source.consecutive_failures > 0)
            .length
        },
        currentAndUpcomingEvents: {
          total: events.length,
          described,
          missingDescription: events.length - described,
          descriptionCoveragePercent:
            events.length === 0
              ? 0
              : Number(((described / events.length) * 100).toFixed(1)),
          withSourceUrl: events.filter((event) => event.source_url !== null)
            .length
        },
        latestRunStatuses: runStatuses
      },
      null,
      2
    )
  );
}
