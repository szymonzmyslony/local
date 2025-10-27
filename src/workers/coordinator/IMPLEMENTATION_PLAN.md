# Coordinator Implementation Plan

## Overview

The coordinator is the **orchestration layer** for the CityChat pipeline. It provides:
1. **Admin Dashboard UI** (React SPA)
2. **Backend API** that forwards, queries, or triggers pipeline operations
3. **Zero business logic** - all logic stays in specialized workers

---

## Architecture Patterns

### 1. Service Binding (Forward HTTP Requests)
**Use for:** Operations that have HTTP endpoints in other workers
- ✅ **Crawler operations** (POST /crawl, GET /crawl/:jobId, POST /fetch)
- Why: Crawler worker already has these endpoints, just proxy the requests

### 2. Direct Supabase Queries (Read Operations)
**Use for:** Read-only data access
- ✅ **Stats/Overview** - Aggregate counts from multiple tables
- ✅ **Curator Queue** - Query identity_links with curator_decision='pending'
- ✅ **Pages Browser** - Query pages table with filters
- ✅ **Golden Browser** - Query golden_* tables

### 3. Queue Messages (Trigger Async Work)
**Use for:** Operations that kick off async processing
- ✅ **Source extraction** - Send `source.extract` message
- ✅ **Golden materialization** - Send `golden.materialize` message
- ✅ **Identity indexing** - Send `identity.index.*` message

### 4. Supabase RPCs + Queue (Complex Operations)
**Use for:** Operations that update database AND trigger downstream work
- ✅ **Curator merge** - Call `merge_identity_entities` RPC, then send golden queue message

---

## Required Bindings

### Update `wrangler.jsonc`:

```jsonc
{
  "name": "citychat-coordinator",
  "main": "src/server.ts",
  "compatibility_date": "2025-08-03",
  "compatibility_flags": ["nodejs_compat"],

  "assets": {
    "directory": "public",
    "not_found_handling": "single-page-application"
  },

  // Service bindings - call other workers via HTTP
  "services": [
    {
      "binding": "CRAWLER",
      "service": "citychat-crawler",
      "environment": "production"
    }
  ],

  // Queue producers - send messages to trigger async work
  "queues": {
    "producers": [
      {
        "queue": "source",
        "binding": "SOURCE_PRODUCER"
      },
      {
        "queue": "golden",
        "binding": "GOLDEN_PRODUCER"
      },
      {
        "queue": "identity",
        "binding": "IDENTITY_PRODUCER"
      }
    ]
  },

  "observability": {
    "enabled": true
  },

  "workers_dev": false,
  "routes": [
    { "pattern": "admin.zinelocal.com/*", "zone_name": "zinelocal.com" }
  ]
}
```

### Update `src/server.ts` Env interface:

```typescript
declare global {
  interface Env {
    // Assets
    ASSETS?: {
      fetch: typeof fetch;
    };

    // Service bindings (other workers)
    CRAWLER: Fetcher;

    // Queue producers
    SOURCE_PRODUCER: Queue<SourceQueueMessage>;
    GOLDEN_PRODUCER: Queue<GoldenQueueMessage>;
    IDENTITY_PRODUCER: Queue<IdentityQueueMessage>;

    // Supabase
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_ANON_KEY?: string;
  }
}
```

---

## API Implementation Strategy

### Route Structure

```
src/routes/
├── index.ts          # Router dispatcher
├── stats.ts          # GET /api/stats/overview
├── crawl.ts          # Crawl operations (forwards to crawler worker)
├── curator.ts        # Entity curation (Supabase + queues)
├── pages.ts          # Pages browser (Supabase queries)
├── golden.ts         # Golden entities (Supabase queries)
└── actions.ts        # Manual triggers (queues)
```

---

## Detailed Implementation

### 1. Stats API (`src/routes/stats.ts`)

**Endpoint:** `GET /api/stats/overview`

**Strategy:** Direct Supabase queries, aggregate in coordinator

```typescript
async function getOverview(env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  // Parallel queries for performance
  const [crawlerStats, sourceStats, identityStats, goldenStats] = await Promise.all([
    // Crawler stats
    sb.from("crawl_jobs")
      .select("status")
      .in("status", ["discovering", "fetching"])
      .then(({ count }) => ({ activeJobs: count || 0 })),

    // Source stats
    sb.from("pages")
      .select("extraction_status")
      .eq("extraction_status", "pending")
      .then(({ count }) => ({ pendingExtractions: count || 0 })),

    // Identity stats (curator queue)
    sb.from("identity_links")
      .select("id")
      .eq("curator_decision", "pending")
      .eq("relation", "similar")
      .then(({ count }) => ({ pendingReviews: count || 0 })),

    // Golden stats
    sb.from("golden_events")
      .select("id")
      .then(({ count }) => ({ totalEntities: count || 0 }))
  ]);

  return jsonResponse(200, {
    crawler: crawlerStats,
    source: sourceStats,
    identity: identityStats,
    golden: goldenStats
  });
}
```

**Why this approach:**
- ✅ Simple, direct database queries
- ✅ No cross-worker communication overhead
- ✅ Fast (parallel queries)
- ❌ Queue depths not available (would need Cloudflare API - skip for now)

---

### 2. Crawl API (`src/routes/crawl.ts`)

**Endpoints:**
- `GET /api/crawl/jobs` - List crawl jobs
- `POST /api/crawl/start` - Start new crawl
- `GET /api/crawl/jobs/:jobId` - Get job details
- `POST /api/crawl/retry/:jobId` - Retry failed URLs

**Strategy:** Forward to crawler worker via service binding

```typescript
async function handleCrawl(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/crawl", "");

  // Forward to crawler worker
  if (path === "/start" && request.method === "POST") {
    // Forward POST /crawl/start → crawler POST /crawl
    const body = await request.json();
    const crawlerRequest = new Request("http://crawler/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return env.CRAWLER.fetch(crawlerRequest);
  }

  if (path.startsWith("/jobs/") && request.method === "GET") {
    // Forward GET /api/crawl/jobs/:jobId → crawler GET /crawl/:jobId
    const jobId = path.split("/")[2];
    const crawlerRequest = new Request(`http://crawler/crawl/${jobId}`);
    return env.CRAWLER.fetch(crawlerRequest);
  }

  // List jobs - query Supabase directly (crawler doesn't have this endpoint)
  if (path === "/jobs" && request.method === "GET") {
    const sb = getServiceClient(env);
    const { data: jobs, error } = await sb
      .from("crawl_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { jobs });
  }

  return jsonResponse(404, { error: "Not found" });
}
```

**Why this approach:**
- ✅ Reuse crawler's existing endpoints (no code duplication)
- ✅ Crawler maintains all crawl business logic
- ✅ Coordinator is just a thin proxy
- ⚠️ List jobs endpoint queries Supabase directly (crawler doesn't have this)

---

### 3. Curator API (`src/routes/curator.ts`)

**Endpoints:**
- `GET /api/curator/queue` - Get entity pairs for review
- `POST /api/curator/merge` - Merge entities
- `POST /api/curator/dismiss` - Dismiss false positive
- `GET /api/curator/stats` - Curator stats

**Strategy:** Supabase RPC + Golden queue message

```typescript
async function handleCurator(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/curator", "");
  const sb = getServiceClient(env);

  // Get curator queue (use Supabase RPC)
  if (path === "/queue" && request.method === "GET") {
    const entityType = url.searchParams.get("entityType");
    const minSim = parseFloat(url.searchParams.get("minSim") || "0.85");
    const maxSim = parseFloat(url.searchParams.get("maxSim") || "0.95");

    const { data, error } = await sb.rpc("get_entities_for_review", {
      filter_entity_type: entityType || null,
      min_similarity: minSim,
      max_similarity: maxSim,
      review_limit: 50
    });

    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { pairs: data });
  }

  // Merge entities
  if (path === "/merge" && request.method === "POST") {
    const { linkId } = await request.json();

    // 1. Get link details
    const { data: link } = await sb
      .from("identity_links")
      .select("entity_type, a_id, b_id")
      .eq("id", linkId)
      .single();

    if (!link) return jsonResponse(404, { error: "Link not found" });

    // 2. Update curator decision
    await sb
      .from("identity_links")
      .update({ curator_decision: "merged" })
      .eq("id", linkId);

    // 3. Call merge RPC
    await sb.rpc("merge_identity_entities", {
      t: link.entity_type,
      winner: link.a_id,
      loser: link.b_id
    });

    // 4. Trigger golden materialization via queue
    await env.GOLDEN_PRODUCER.send({
      type: "golden.materialize",
      entityType: link.entity_type,
      entityId: link.a_id // Winner becomes canonical
    });

    return jsonResponse(200, { ok: true });
  }

  // Dismiss false positive
  if (path === "/dismiss" && request.method === "POST") {
    const { linkId } = await request.json();

    await sb
      .from("identity_links")
      .update({ curator_decision: "dismissed" })
      .eq("id", linkId);

    return jsonResponse(200, { ok: true });
  }

  return jsonResponse(404, { error: "Not found" });
}
```

**Why this approach:**
- ✅ Uses existing Supabase RPCs (identity worker created them)
- ✅ Triggers golden materialization properly
- ✅ Curator logic stays simple (update + RPC + queue)
- ✅ Idempotent (can retry merge safely)

---

### 4. Pages API (`src/routes/pages.ts`)

**Endpoints:**
- `GET /api/pages` - List pages (with filters)
- `GET /api/pages/:url` - Get page details (URL-encoded)
- `POST /api/pages/extract` - Trigger re-extraction

**Strategy:** Direct Supabase queries + source queue message

```typescript
async function handlePages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/pages", "");
  const sb = getServiceClient(env);

  // List pages
  if (path === "" && request.method === "GET") {
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 50;

    let query = sb
      .from("pages")
      .select("url, status, extraction_status, fetched_at", { count: "exact" });

    if (status) query = query.eq("extraction_status", status);
    if (search) query = query.ilike("url", `%${search}%`);

    query = query
      .order("fetched_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data: pages, count, error } = await query;

    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { pages, total: count, page, limit });
  }

  // Trigger extraction
  if (path === "/extract" && request.method === "POST") {
    const { url: pageUrl } = await request.json();

    // Send message to source queue
    await env.SOURCE_PRODUCER.send({
      type: "source.extract",
      url: pageUrl
    });

    return jsonResponse(200, { ok: true, message: "Extraction queued" });
  }

  return jsonResponse(404, { error: "Not found" });
}
```

**Why this approach:**
- ✅ Simple Supabase queries with filters
- ✅ Re-extraction triggers source worker via queue
- ✅ No need for service binding to source worker (it has no HTTP endpoints)

---

### 5. Golden API (`src/routes/golden.ts`)

**Endpoints:**
- `GET /api/golden/artists` - List golden artists
- `GET /api/golden/galleries` - List golden galleries
- `GET /api/golden/events` - List golden events
- `GET /api/golden/:type/:entityId` - Get golden entity details
- `POST /api/golden/materialize` - Trigger re-materialization

**Strategy:** Direct Supabase queries + golden queue message

```typescript
async function handleGolden(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/golden", "");
  const sb = getServiceClient(env);

  // List golden artists
  if (path === "/artists" && request.method === "GET") {
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 50;

    let query = sb
      .from("golden_artists")
      .select("*", { count: "exact" });

    if (search) query = query.ilike("name", `%${search}%`);

    query = query
      .order("name", { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    const { data: artists, count, error } = await query;

    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { artists, total: count, page, limit });
  }

  // Similar for /galleries and /events

  // Trigger materialization
  if (path === "/materialize" && request.method === "POST") {
    const { entityType, entityId } = await request.json();

    // Send message to golden queue
    await env.GOLDEN_PRODUCER.send({
      type: "golden.materialize",
      entityType,
      entityId
    });

    return jsonResponse(200, { ok: true, message: "Materialization queued" });
  }

  return jsonResponse(404, { error: "Not found" });
}
```

**Why this approach:**
- ✅ Direct queries to golden_* tables
- ✅ Re-materialization via golden queue message
- ✅ Simple, no cross-worker dependencies

---

### 6. Actions API (`src/routes/actions.ts`)

**Endpoints:**
- `POST /api/actions/fetch` - Fetch single URL
- `POST /api/actions/extract` - Extract single page
- `POST /api/actions/index` - Index single entity
- `POST /api/actions/materialize` - Materialize single entity

**Strategy:** Forward or queue depending on operation

```typescript
async function handleActions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/actions", "");

  // Fetch URL (forward to crawler)
  if (path === "/fetch" && request.method === "POST") {
    const { url: pageUrl } = await request.json();

    const crawlerRequest = new Request("http://crawler/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: pageUrl })
    });

    return env.CRAWLER.fetch(crawlerRequest);
  }

  // Extract page (send source queue message)
  if (path === "/extract" && request.method === "POST") {
    const { url: pageUrl } = await request.json();

    await env.SOURCE_PRODUCER.send({
      type: "source.extract",
      url: pageUrl
    });

    return jsonResponse(200, { ok: true });
  }

  // Index entity (send identity queue message)
  if (path === "/index" && request.method === "POST") {
    const { entityType, sourceId } = await request.json();

    await env.IDENTITY_PRODUCER.send({
      type: `identity.index.${entityType}`,
      sourceId
    });

    return jsonResponse(200, { ok: true });
  }

  // Materialize entity (send golden queue message)
  if (path === "/materialize" && request.method === "POST") {
    const { entityType, entityId } = await request.json();

    await env.GOLDEN_PRODUCER.send({
      type: "golden.materialize",
      entityType,
      entityId
    });

    return jsonResponse(200, { ok: true });
  }

  return jsonResponse(404, { error: "Not found" });
}
```

**Why this approach:**
- ✅ Provides manual control over each pipeline stage
- ✅ Useful for debugging and re-processing
- ✅ Follows same patterns as other routes

---

## Implementation Checklist

### Phase 1: Setup (30 min)
- [ ] Update `wrangler.jsonc` with service binding and queue producers
- [ ] Update `src/server.ts` Env interface
- [ ] Create `src/routes/index.ts` router dispatcher
- [ ] Copy `@/shared/http.ts` and `@/shared/supabase.ts` from other workers
- [ ] Copy `@/shared/messages.ts` for queue message types

### Phase 2: API Routes (3 hours)
- [ ] Implement `src/routes/stats.ts` (Supabase queries)
- [ ] Implement `src/routes/crawl.ts` (forward to crawler worker)
- [ ] Implement `src/routes/curator.ts` (RPC + golden queue)
- [ ] Implement `src/routes/pages.ts` (Supabase queries + source queue)
- [ ] Implement `src/routes/golden.ts` (Supabase queries + golden queue)
- [ ] Implement `src/routes/actions.ts` (forward/queue)

### Phase 3: Frontend (6 hours)
- [ ] Install React Router, TanStack Query
- [ ] Create `src/lib/api.ts` client
- [ ] Create `src/components/StatsCards.tsx`
- [ ] Create `src/components/CrawlJobList.tsx`
- [ ] Create `src/components/EntityCurator.tsx` (PRIMARY FEATURE)
- [ ] Create `src/components/PagesBrowser.tsx`
- [ ] Create `src/components/GoldenBrowser.tsx`
- [ ] Add routing in `src/app.tsx`

### Phase 4: Testing (1 hour)
- [ ] Test local dev: `bun run dev`
- [ ] Test build: `bun run build`
- [ ] Test deployed: `bun run deploy`
- [ ] Verify all API routes work
- [ ] Verify service binding to crawler works
- [ ] Verify queue messages are sent correctly

---

## Key Decisions Summary

| Operation | Strategy | Why |
|-----------|----------|-----|
| **Crawl operations** | Service binding to crawler | Crawler has HTTP endpoints, just proxy |
| **Stats/overview** | Direct Supabase queries | Read-only, no business logic needed |
| **Curator merge** | Supabase RPC + golden queue | Use existing RPC, trigger downstream |
| **Pages/golden browse** | Direct Supabase queries | Simple read operations |
| **Manual triggers** | Queue messages or forward | Trigger async work in other workers |

**No business logic in coordinator** - it's purely orchestration!
