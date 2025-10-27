import { jsonResponse } from "@/shared/http";

interface CrawlerStatsResponse {
  activeJobs: number;
}

interface SourceStatsResponse {
  pendingExtractions: number;
}

interface IdentityStatsResponse {
  pendingReviews: number;
}

interface GoldenStatsResponse {
  artists: number;
  galleries: number;
  events: number;
}

export async function getStats(env: Env): Promise<Response> {
  const [crawlerRes, sourceRes, identityRes, goldenRes] = await Promise.all([
    env.CRAWLER.fetch("http://crawler/stats", { method: "GET" }),
    env.SOURCE.fetch("http://source/stats", { method: "GET" }),
    env.IDENTITY.fetch("http://identity/stats", { method: "GET" }),
    env.GOLDEN.fetch("http://golden/stats", { method: "GET" }),
  ]);

  const failed = [crawlerRes, sourceRes, identityRes, goldenRes].find(
    (response) => !response.ok
  );

  if (failed) {
    return jsonResponse(failed.status, {
      error: "Failed to load stats",
      details: await failed.text(),
    });
  }

  const [crawlerStats, sourceStats, identityStats, goldenStats] = await Promise.all([
    crawlerRes.json() as Promise<CrawlerStatsResponse>,
    sourceRes.json() as Promise<SourceStatsResponse>,
    identityRes.json() as Promise<IdentityStatsResponse>,
    goldenRes.json() as Promise<GoldenStatsResponse>,
  ]);

  const totalGoldenEntities =
    goldenStats.artists + goldenStats.galleries + goldenStats.events;

  return jsonResponse(200, {
    crawler: { activeJobs: crawlerStats.activeJobs },
    source: { pendingExtractions: sourceStats.pendingExtractions },
    identity: { pendingReviews: identityStats.pendingReviews },
    golden: {
      totalEntities: totalGoldenEntities,
      artists: goldenStats.artists,
      galleries: goldenStats.galleries,
      events: goldenStats.events,
    },
  });
}
