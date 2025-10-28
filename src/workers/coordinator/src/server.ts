/// <reference path="../worker-configuration.d.ts" />

import { jsonResponse } from "@/shared/http";
import { getStats } from "./routes/stats";
import { listCrawlJobs, startCrawl } from "./routes/crawl";
import { getDiscoveredUrls } from "./routes/crawl-enhanced";
import { getSourceEntities, getPages as getPagesEnhanced } from "./routes/source-enhanced";
import { getIdentityEntities, getCuratorQueueDirect } from "./routes/identity-enhanced";
import { getGoldenEntities, approveCluster } from "./routes/golden-enhanced";
import {
  getExtractedEntities,
  getExtractedEntity,
  updateExtractedEntity,
  bulkApproveEntities,
  bulkRejectEntities,
} from "./routes/extracted";
import {
  triggerSimilarity,
  getSimilarityPairs,
  markPairForMerge,
  dismissPair,
} from "./routes/similarity";
import {
  previewCluster,
  commitCluster,
} from "./routes/cluster";

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

    // Extracted entity routes
    if (path === "/extracted/artists" && method === "GET") {
      return getExtractedEntities("artist", request, env);
    }
    if (path === "/extracted/galleries" && method === "GET") {
      return getExtractedEntities("gallery", request, env);
    }
    if (path === "/extracted/events" && method === "GET") {
      return getExtractedEntities("event", request, env);
    }
    if (path.match(/^\/extracted\/(artist|gallery|event)\/[a-z0-9-]+$/) && method === "GET") {
      const [, , type, id] = path.split("/");
      return getExtractedEntity(type as any, id, env);
    }
    if (path.match(/^\/extracted\/(artist|gallery|event)\/[a-z0-9-]+$/) && method === "PATCH") {
      const [, , type, id] = path.split("/");
      return updateExtractedEntity(type as any, id, request, env);
    }
    if (path === "/extracted/artists/bulk-approve" && method === "POST") {
      return bulkApproveEntities("artist", request, env);
    }
    if (path === "/extracted/galleries/bulk-approve" && method === "POST") {
      return bulkApproveEntities("gallery", request, env);
    }
    if (path === "/extracted/events/bulk-approve" && method === "POST") {
      return bulkApproveEntities("event", request, env);
    }
    if (path === "/extracted/artists/bulk-reject" && method === "POST") {
      return bulkRejectEntities("artist", request, env);
    }
    if (path === "/extracted/galleries/bulk-reject" && method === "POST") {
      return bulkRejectEntities("gallery", request, env);
    }
    if (path === "/extracted/events/bulk-reject" && method === "POST") {
      return bulkRejectEntities("event", request, env);
    }

    // Similarity routes
    if (path === "/similarity/trigger" && method === "POST") {
      return triggerSimilarity(request, env);
    }
    if (path === "/similarity/pairs/artists" && method === "GET") {
      return getSimilarityPairs("artist", request, env);
    }
    if (path === "/similarity/pairs/galleries" && method === "GET") {
      return getSimilarityPairs("gallery", request, env);
    }
    if (path === "/similarity/pairs/events" && method === "GET") {
      return getSimilarityPairs("event", request, env);
    }
    if (path.match(/^\/similarity\/pairs\/[a-z0-9-]+\/(artist|gallery|event)\/merge$/) && method === "POST") {
      const [, , , linkId, type] = path.split("/");
      return markPairForMerge(linkId, type as any, request, env);
    }
    if (path.match(/^\/similarity\/pairs\/[a-z0-9-]+\/(artist|gallery|event)\/dismiss$/) && method === "POST") {
      const [, , , linkId, type] = path.split("/");
      return dismissPair(linkId, type as any, request, env);
    }

    // Cluster routes
    if (path === "/cluster/preview" && method === "POST") {
      return previewCluster(request, env);
    }
    if (path === "/cluster/commit" && method === "POST") {
      return commitCluster(request, env);
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
    if (path === "/golden/approve" && method === "POST") {
      return approveCluster(request, env);
    }

    return jsonResponse(404, { error: "Not found", path });
  } catch (error) {
    console.error("API error:", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
