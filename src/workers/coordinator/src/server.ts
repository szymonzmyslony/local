/// <reference path="../worker-configuration.d.ts" />

import { jsonResponse } from "@/shared/http";
import { getStats } from "./routes/stats";
import { listCrawlJobs, startCrawl } from "./routes/crawl";
import { getDiscoveredUrls } from "./routes/crawl-enhanced";
import { getSourceEntities, getPages as getPagesEnhanced } from "./routes/source-enhanced";
import { getIdentityEntities, getCuratorQueueDirect } from "./routes/identity-enhanced";
import { getGoldenEntities } from "./routes/golden-enhanced";
import { mergeEntities, dismissLink } from "./routes/curator";

const SPA_INDEX = "/index.html";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApiRoutes(request, env);
    }

    const assets = (env as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (assets) {
      const urlPath = url.pathname;

      if (request.method === "GET" && (urlPath === "/" || urlPath === "")) {
        const indexResponse = await assets.fetch(
          new Request(new URL(SPA_INDEX, url.origin), request)
        );
        if (indexResponse.status !== 404) return indexResponse;
      }

      const response = await assets.fetch(request);
      if (response.status !== 404) return response;

      if (request.method === "GET") {
        const indexResponse = await assets.fetch(
          new Request(new URL(SPA_INDEX, url.origin), request)
        );
        if (indexResponse.status !== 404) return indexResponse;
      }
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;

async function handleApiRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api", "");
  const method = request.method;

  try {
    if (path === "/stats/overview" && method === "GET") {
      return getStats(env);
    }

    if (path === "/crawl/jobs" && method === "GET") {
      return listCrawlJobs(env);
    }
    if (path === "/crawl/start" && method === "POST") {
      return startCrawl(request, env);
    }
    if (path.startsWith("/crawl/jobs/") && path.endsWith("/urls") && method === "GET") {
      const jobId = path.split("/")[3];
      return getDiscoveredUrls(jobId, env);
    }

    // Identity routes
    if (path === "/identity/curator/queue" && method === "GET") {
      return getCuratorQueueDirect(request, env);
    }
    if (path === "/identity/entities/artists" && method === "GET") {
      return getIdentityEntities("artist", request, env);
    }
    if (path === "/identity/entities/galleries" && method === "GET") {
      return getIdentityEntities("gallery", request, env);
    }
    if (path === "/identity/entities/events" && method === "GET") {
      return getIdentityEntities("event", request, env);
    }

    // Curator routes (merge/dismiss business logic)
    if (path === "/curator/merge" && method === "POST") {
      return mergeEntities(request, env);
    }
    if (path === "/curator/dismiss" && method === "POST") {
      return dismissLink(request, env);
    }

    // Source entities routes
    if (path === "/source/pages" && method === "GET") {
      return getPagesEnhanced(request, env);
    }
    if (path === "/source/entities/artists" && method === "GET") {
      return getSourceEntities("artists", request, env);
    }
    if (path === "/source/entities/galleries" && method === "GET") {
      return getSourceEntities("galleries", request, env);
    }
    if (path === "/source/entities/events" && method === "GET") {
      return getSourceEntities("events", request, env);
    }

    // Golden routes
    if (path === "/golden/artists" && method === "GET") {
      return getGoldenEntities("artists", request, env);
    }
    if (path === "/golden/galleries" && method === "GET") {
      return getGoldenEntities("galleries", request, env);
    }
    if (path === "/golden/events" && method === "GET") {
      return getGoldenEntities("events", request, env);
    }

    return jsonResponse(404, { error: "Not found", path });
  } catch (error) {
    console.error("API error:", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
