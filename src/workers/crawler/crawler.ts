/// <reference path="./worker-configuration.d.ts" />

import { jsonResponse, readJson } from "@/shared/http";
import type { CrawlerQueueMessage, SourceQueueMessage } from "@/shared/messages";
import { getServiceClient, type SupabaseServiceClient } from "@/shared/supabase";

interface CrawlRequest {
  seed: string;
  maxPages?: number;
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

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const DEFAULT_MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 25_000;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/crawl" && request.method === "POST") {
      const body = await readJson<CrawlRequest>(request);
      if (!body?.seed) {
        return jsonResponse(400, { error: "seed is required" });
      }

      const seed = normalizeUrl(body.seed);
      if (!seed) {
        return jsonResponse(400, { error: "invalid seed url" });
      }

      const maxPages = sanitizeMaxPages(body.maxPages);

      await env.CRAWL_PRODUCER.send({
        type: "crawler.crawl",
        seed,
        maxPages,
      });

      return jsonResponse(202, { ok: true, enqueued: true, seed, maxPages });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<CrawlerQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        const { body } = message;
        if (body.type !== "crawler.crawl") {
          message.ack();
          continue;
        }

        await processCrawlJob(env, body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, CrawlerQueueMessage>;

async function processCrawlJob(env: Env, job: CrawlerQueueMessage) {
  const seed = normalizeUrl(job.seed);
  if (!seed) {
    return;
  }

  const maxPages = sanitizeMaxPages(job.maxPages);
  const supabase = getServiceClient(env);
  const origin = new URL(seed).origin;
  const visitQueue: string[] = [seed];
  const visited = new Set<string>();
  let processed = 0;

  while (visitQueue.length && processed < maxPages) {
    const current = visitQueue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const markdown = await fetchMarkdown(current, env);
    if (!markdown) {
      continue;
    }

    await storePage(supabase, current, markdown);
    await env.SOURCE_PRODUCER.send({ type: "source.extract", url: current });
    processed += 1;

    if (processed >= maxPages) {
      break;
    }

    const neighbours = await discoverLinks(current, origin);
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour) && !visitQueue.includes(neighbour)) {
        visitQueue.push(neighbour);
      }
    }
  }
}

function sanitizeMaxPages(value: number | undefined): number {
  if (!value || value <= 0) {
    return DEFAULT_MAX_PAGES;
  }
  return Math.min(value, 200);
}

async function fetchMarkdown(url: string, env: Env): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(FIRECRAWL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        onlyMainContent: false,
        maxAge: 172800000,
        parsers: ["pdf"],
        formats: ["markdown"],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return extractMarkdown(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractMarkdown(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.markdown,
    (record.data as Record<string, unknown> | undefined)?.markdown,
  ];

  const dataField = record.data;
  if (Array.isArray(dataField)) {
    for (const item of dataField) {
      if (item && typeof item === "object" && "markdown" in item) {
        candidates.push((item as Record<string, unknown>).markdown);
      }
    }
  } else if (dataField && typeof dataField === "object") {
    const content = (dataField as Record<string, unknown>).content;
    if (content && typeof content === "object") {
      if ("markdown" in (content as Record<string, unknown>)) {
        candidates.push((content as Record<string, unknown>).markdown);
      }
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object" && "markdown" in item) {
            candidates.push((item as Record<string, unknown>).markdown);
          }
        }
      }
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate;
    }
  }

  return null;
}

async function discoverLinks(url: string, origin: string): Promise<string[]> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "CityChatCrawler/1.0" } });
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    const links = new Set<string>();

    const matcher = html.matchAll(/href\s*=\s*['"]([^'"#]+)['"]/gi);
    for (const match of matcher) {
      const raw = match[1];
      const normalized = normalizeUrl(raw, url);
      if (!normalized) continue;
      if (!normalized.startsWith(origin)) continue;
      links.add(normalized);
    }

    return Array.from(links);
  } catch {
    return [];
  }
}

async function storePage(sb: SupabaseServiceClient, url: string, markdown: string) {
  const now = new Date().toISOString();
  await sb
    .from("pages")
    .upsert(
      {
        url,
        status: 200,
        fetched_at: now,
        md: markdown,
        updated_at: now,
      },
      { onConflict: "url" },
    );
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
