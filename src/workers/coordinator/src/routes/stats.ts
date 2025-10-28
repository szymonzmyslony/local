import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

interface CrawlerStatsResponse {
  activeJobs: number;
}

interface SourceStatsResponse {
  pendingExtractions: number;
}

export async function getStats(env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  // Call worker services for crawler and source stats
  const [crawlerRes, sourceRes] = await Promise.all([
    env.CRAWLER.fetch("http://crawler/stats", { method: "GET" }),
    env.SOURCE.fetch("http://source/stats", { method: "GET" })
  ]);

  const failed = [crawlerRes, sourceRes].find((response) => !response.ok);

  if (failed) {
    return jsonResponse(failed.status, {
      error: "Failed to load stats",
      details: await failed.text()
    });
  }

  const [crawlerStats, sourceStats] = await Promise.all([
    crawlerRes.json() as Promise<CrawlerStatsResponse>,
    sourceRes.json() as Promise<SourceStatsResponse>
  ]);

  // Get extracted entity stats directly from Supabase (replaces identity worker)
  const [extractedArtistsCount, extractedGalleriesCount, extractedEventsCount] =
    await Promise.all([
      sb
        .from("extracted_artists")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "pending_review"),
      sb
        .from("extracted_galleries")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "pending_review"),
      sb
        .from("extracted_events")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "pending_review")
    ]);

  const pendingReviews =
    (extractedArtistsCount.count ?? 0) +
    (extractedGalleriesCount.count ?? 0) +
    (extractedEventsCount.count ?? 0);

  // Get golden entity stats directly from Supabase (replaces golden worker)
  const [goldenArtistsCount, goldenGalleriesCount, goldenEventsCount] =
    await Promise.all([
      sb.from("golden_artists").select("*", { count: "exact", head: true }),
      sb.from("golden_galleries").select("*", { count: "exact", head: true }),
      sb.from("golden_events").select("*", { count: "exact", head: true })
    ]);

  const goldenArtists = goldenArtistsCount.count ?? 0;
  const goldenGalleries = goldenGalleriesCount.count ?? 0;
  const goldenEvents = goldenEventsCount.count ?? 0;
  const totalGoldenEntities = goldenArtists + goldenGalleries + goldenEvents;

  return jsonResponse(200, {
    crawler: { activeJobs: crawlerStats.activeJobs },
    source: { pendingExtractions: sourceStats.pendingExtractions },
    extracted: { pendingReviews },
    golden: {
      totalEntities: totalGoldenEntities,
      artists: goldenArtists,
      galleries: goldenGalleries,
      events: goldenEvents
    }
  });
}
