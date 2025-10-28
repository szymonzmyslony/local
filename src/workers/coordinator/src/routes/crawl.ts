import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

interface StartCrawlRequest {
  seed: string;
  maxPages?: number | null;
  searchTerm?: string | null;
  includeSubdomains?: boolean;
  force?: boolean;
}

export async function listCrawlJobs(env: Env): Promise<Response> {
  const response = await env.CRAWLER.fetch("http://crawler/crawl/jobs", {
    method: "GET",
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to fetch crawl jobs",
      details: await response.text(),
    });
  }

  return response;
}

export async function startCrawl(request: Request, env: Env): Promise<Response> {
  const body = await readJson<StartCrawlRequest>(request);

  if (!body?.seed) {
    return jsonResponse(400, { error: "seed is required" });
  }

  const response = await env.CRAWLER.fetch("http://crawler/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seed: body.seed,
      maxPages: body.maxPages ?? undefined,
      searchTerm: body.searchTerm ?? undefined,
      includeSubdomains: body.includeSubdomains,
      force: body.force,
    }),
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to start crawl",
      details: await response.text(),
    });
  }

  return response;
}

export async function getCrawlJobPages(jobId: string, env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  // Join pages with discovered_urls to get pages for this job
  const { data: discoveredUrls, error: urlsError } = await sb
    .from("discovered_urls")
    .select("url")
    .eq("job_id", jobId)
    .eq("status", "fetched");

  if (urlsError) {
    return jsonResponse(500, { error: urlsError.message });
  }

  const pageUrls = discoveredUrls?.map(d => d.url) || [];

  if (pageUrls.length === 0) {
    return jsonResponse(200, { pages: [], total: 0 });
  }

  // Get page data
  const { data: pages, error: pagesError } = await sb
    .from("pages")
    .select("url, extraction_status, fetched_at")
    .in("url", pageUrls);

  if (pagesError) {
    return jsonResponse(500, { error: pagesError.message });
  }

  // Get entity counts per page using GROUP BY
  const [artistCounts, galleryCounts, eventCounts] = await Promise.all([
    sb.from("extracted_artists")
      .select("page_url")
      .in("page_url", pageUrls)
      .then(result => {
        const counts = new Map<string, number>();
        result.data?.forEach(e => counts.set(e.page_url, (counts.get(e.page_url) || 0) + 1));
        return counts;
      }),
    sb.from("extracted_galleries")
      .select("page_url")
      .in("page_url", pageUrls)
      .then(result => {
        const counts = new Map<string, number>();
        result.data?.forEach(e => counts.set(e.page_url, (counts.get(e.page_url) || 0) + 1));
        return counts;
      }),
    sb.from("extracted_events")
      .select("page_url")
      .in("page_url", pageUrls)
      .then(result => {
        const counts = new Map<string, number>();
        result.data?.forEach(e => counts.set(e.page_url, (counts.get(e.page_url) || 0) + 1));
        return counts;
      }),
  ]);

  // Transform to include entity counts
  const pagesWithCounts = pages?.map(p => ({
    url: p.url,
    extraction_status: p.extraction_status,
    fetched_at: p.fetched_at,
    entity_counts: {
      artists: artistCounts.get(p.url) || 0,
      galleries: galleryCounts.get(p.url) || 0,
      events: eventCounts.get(p.url) || 0,
    },
  }));

  return jsonResponse(200, { pages: pagesWithCounts, total: pagesWithCounts?.length || 0 });
}
