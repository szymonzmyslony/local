/// <reference path="./worker-configuration.d.ts" />

import { firecrawlMap, firecrawlScrape, FirecrawlError } from "@/shared/firecrawl";
import { jsonResponse, readJson } from "@/shared/http";
import type {
  CrawlerQueueMessage,
  CrawlerMapMessage,
  CrawlerFetchMessage,
  SourceQueueMessage,
} from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";
import type { TablesInsert } from "@/types/database_types";

interface CrawlRequest {
  seed: string;
  maxPages?: number;
  searchTerm?: string;
  includeSubdomains?: boolean;
  force?: boolean;
}

declare global {
  interface Env {
    SOURCE_PRODUCER: Queue<SourceQueueMessage>;
    CRAWL_PRODUCER: Queue<CrawlerQueueMessage>;
    FIRECRAWL_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_ANON_KEY?: string;
  }
}

const DEFAULT_MAX_PAGES = 50;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/crawl" && request.method === "POST") {
      return handleCrawlRequest(request, env);
    }

    if (url.pathname === "/crawl/jobs" && request.method === "GET") {
      return handleListJobs(env);
    }

    if (url.pathname === "/stats" && request.method === "GET") {
      return handleStats(env);
    }

    if (url.pathname.startsWith("/crawl/") && request.method === "GET") {
      const jobId = url.pathname.split("/")[2];
      return handleGetProgress(jobId, env);
    }

    if (url.pathname === "/fetch" && request.method === "POST") {
      return handleFetchRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<CrawlerQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        const { body } = message;

        if (body.type === "crawler.map") {
          await processMapJob(env, body);
        } else if (body.type === "crawler.fetch") {
          await processFetchJob(env, body);
        }

        message.ack();
      } catch (error) {
        console.error("Queue processing error:", error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, CrawlerQueueMessage>;

/**
 * POST /crawl - Create new crawl job
 */
async function handleCrawlRequest(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CrawlRequest>(request);

  if (!body?.seed) {
    return jsonResponse(400, { error: "seed is required" });
  }

  const seed = normalizeUrl(body.seed);
  if (!seed) {
    return jsonResponse(400, { error: "invalid seed url" });
  }

  const maxPages = Math.min(body.maxPages ?? DEFAULT_MAX_PAGES, 200);
  const sb = getServiceClient(env);

  // Create crawl job
  const job: TablesInsert<"crawl_jobs"> = {
    seed_url: seed,
    max_pages: maxPages,
    search_term: body.searchTerm,
    include_subdomains: body.includeSubdomains ?? false,
    force: body.force ?? false,
    status: "discovering",
  };

  const { data: crawlJob, error } = await sb
    .from("crawl_jobs")
    .insert(job)
    .select()
    .single();

  if (error || !crawlJob) {
    return jsonResponse(500, { error: "Failed to create crawl job" });
  }

  // Enqueue map job
  await env.CRAWL_PRODUCER.send({
    type: "crawler.map",
    jobId: crawlJob.id,
  });

  return jsonResponse(202, {
    jobId: crawlJob.id,
    status: "discovering",
    seed: seed,
    maxPages: maxPages,
  });
}

async function handleListJobs(env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  const { data, error } = await sb
    .from("crawl_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, { jobs: data ?? [] });
}

async function handleStats(env: Env): Promise<Response> {
  const sb = getServiceClient(env);
  const { count } = await sb
    .from("crawl_jobs")
    .select("*", { count: "exact", head: true })
    .in("status", ["discovering", "fetching", "extracting"]);

  return jsonResponse(200, { activeJobs: count ?? 0 });
}

/**
 * GET /crawl/:jobId - Get crawl progress
 */
async function handleGetProgress(jobId: string, env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  const { data, error } = await sb.rpc("get_crawl_progress", {
    job_uuid: jobId,
  });

  if (error || !data) {
    return jsonResponse(404, { error: "Job not found" });
  }

  return jsonResponse(200, data);
}

/**
 * POST /fetch - Manually trigger single URL fetch
 */
async function handleFetchRequest(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ url: string }>(request);

  if (!body?.url) {
    return jsonResponse(400, { error: "url is required" });
  }

  const url = normalizeUrl(body.url);
  if (!url) {
    return jsonResponse(400, { error: "invalid url" });
  }

  // Check if already exists
  const sb = getServiceClient(env);
  const { data: existing } = await sb
    .from("pages")
    .select("url")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    return jsonResponse(200, { message: "URL already fetched", url });
  }

  // Enqueue fetch job (no jobId for manual fetches)
  await env.CRAWL_PRODUCER.send({
    type: "crawler.fetch",
    url,
    jobId: "",
  });

  return jsonResponse(202, { message: "Fetch queued", url });
}

/**
 * Process crawler.map message - Discover URLs with Firecrawl /map
 */
async function processMapJob(env: Env, job: CrawlerMapMessage): Promise<void> {
  const sb = getServiceClient(env);

  // Get crawl job
  const { data: crawlJob, error: jobError } = await sb
    .from("crawl_jobs")
    .select("*")
    .eq("id", job.jobId)
    .single();

  if (jobError || !crawlJob) {
    throw new Error(`Crawl job not found: ${job.jobId}`);
  }

  try {
    // Call Firecrawl /map
    const result = await firecrawlMap(env.FIRECRAWL_API_KEY, {
      url: crawlJob.seed_url,
      search: crawlJob.search_term ?? undefined,
      limit: crawlJob.max_pages ?? DEFAULT_MAX_PAGES,
      includeSubdomains: crawlJob.include_subdomains ?? false,
    });

    // Insert discovered URLs
    const urlsToInsert: TablesInsert<"discovered_urls">[] = result.links.map((link) => ({
      url: link,
      job_id: job.jobId,
      status: "pending",
    }));

    if (urlsToInsert.length > 0) {
      await sb.from("discovered_urls").upsert(urlsToInsert, {
        onConflict: "url",
        ignoreDuplicates: true,
      });
    }

    // Update job
    await sb
      .from("crawl_jobs")
      .update({
        urls_discovered: result.links.length,
        status: "fetching",
      })
      .eq("id", job.jobId);

    // Filter out URLs that already exist in pages table (unless force=true)
    let urlsToFetch = result.links.slice(0, crawlJob.max_pages ?? DEFAULT_MAX_PAGES);

    if (!crawlJob.force) {
      // Check which URLs already exist in pages table
      const { data: existingPages } = await sb
        .from("pages")
        .select("url")
        .in("url", urlsToFetch);

      const existingUrlSet = new Set(existingPages?.map((p) => p.url) || []);

      // Only fetch URLs that don't already exist
      urlsToFetch = urlsToFetch.filter((url) => !existingUrlSet.has(url));
    }

    // Enqueue fetch jobs for filtered URLs
    const fetchJobs: CrawlerFetchMessage[] = urlsToFetch.map((url) => ({
      type: "crawler.fetch",
      url,
      jobId: job.jobId,
    }));

    for (const fetchJob of fetchJobs) {
      await env.CRAWL_PRODUCER.send(fetchJob);
    }
  } catch (error) {
    // Update job status to failed
    await sb
      .from("crawl_jobs")
      .update({
        status: "failed",
        error_message:
          error instanceof FirecrawlError
            ? error.message
            : "Map operation failed",
      })
      .eq("id", job.jobId);

    throw error;
  }
}

/**
 * Process crawler.fetch message - Scrape single URL with Firecrawl /scrape
 */
async function processFetchJob(env: Env, job: CrawlerFetchMessage): Promise<void> {
  const sb = getServiceClient(env);

  // Check if URL already fetched
  const { data: existing } = await sb
    .from("pages")
    .select("url")
    .eq("url", job.url)
    .maybeSingle();

  if (existing) {
    // Already fetched, mark as complete
    if (job.jobId) {
      await sb
        .from("discovered_urls")
        .update({ status: "fetched" })
        .eq("url", job.url);
    }
    return;
  }

  // Update status to fetching
  if (job.jobId) {
    const { data: urlData } = await sb
      .from("discovered_urls")
      .select("fetch_attempts")
      .eq("url", job.url)
      .maybeSingle();

    await sb
      .from("discovered_urls")
      .update({
        status: "fetching",
        fetch_attempts: (urlData?.fetch_attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("url", job.url);
  }

  try {
    // Call Firecrawl /scrape
    const result = await firecrawlScrape(env.FIRECRAWL_API_KEY, {
      url: job.url,
      onlyMainContent: false,
      maxAge: 172800000,
    });

    // Store in pages table
    const now = new Date().toISOString();
    await sb.from("pages").upsert(
      {
        url: job.url,
        status: 200,
        fetched_at: now,
        md: result.markdown,
        updated_at: now,
        extraction_status: "pending",
      },
      { onConflict: "url" },
    );

    // Update discovered_urls status
    if (job.jobId) {
      await sb
        .from("discovered_urls")
        .update({ status: "fetched" })
        .eq("url", job.url);

      // Increment urls_fetched counter
      const { data: crawlJob } = await sb
        .from("crawl_jobs")
        .select("urls_discovered, urls_fetched")
        .eq("id", job.jobId)
        .single();

      if (crawlJob) {
        const newUrlsFetched = crawlJob.urls_fetched + 1;

        await sb
          .from("crawl_jobs")
          .update({ urls_fetched: newUrlsFetched })
          .eq("id", job.jobId);

        // Check if job complete
        if (newUrlsFetched >= crawlJob.urls_discovered) {
          await sb
            .from("crawl_jobs")
            .update({
              status: "extracting",
              completed_at: now,
            })
            .eq("id", job.jobId);
        }
      }
    }

    // Enqueue source extraction
    await env.SOURCE_PRODUCER.send({
      type: "source.extract",
      url: job.url,
    });
  } catch (error) {
    // Update discovered_urls status to failed
    if (job.jobId) {
      await sb
        .from("discovered_urls")
        .update({
          status: "failed",
          error_message:
            error instanceof FirecrawlError
              ? error.message
              : "Fetch failed",
        })
        .eq("url", job.url);
    }

    throw error;
  }
}

function normalizeUrl(input: string, base?: string): string | null {
  try {
    const resolved = base ? new URL(input, base) : new URL(input);
    if (!/^https?:$/.test(resolved.protocol)) {
      return null;
    }
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}
