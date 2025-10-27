import { jsonResponse, readJson } from "@/shared/http";

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
