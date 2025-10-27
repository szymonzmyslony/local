# Admin Dashboard PRD: CityChat Coordinator

**Version:** 1.0
**URL:** admin.zinelocal.com
**Purpose:** Monitor, control, and curate the CityChat content processing pipeline

---

## 1. Product Overview

The Coordinator Dashboard is the central control panel for managing the entire CityChat pipeline - from crawling websites to curating golden entities. It enables operators to:
- Start and monitor crawl jobs
- Review and merge duplicate entities (curator workflow)
- Browse scraped content and extracted entities
- Trigger manual processing at any stage
- Monitor pipeline health and queue status

### Core Principles
- **Direct Control:** Every pipeline stage can be triggered manually
- **Transparency:** Full visibility into what's being processed
- **Curation-First:** The curator workflow is the primary feature
- **Idempotent:** All actions can be safely retried

---

## 2. User Stories

### As a Curator
- I want to review entity pairs flagged as "similar" so I can merge duplicates
- I want to see why entities were matched (similarity score, shared attributes)
- I want to approve merges or dismiss false positives with one click
- I want to see the impact of merges (how many sources consolidated)

### As an Operator
- I want to start a crawl job for a new gallery website
- I want to see crawl progress (URLs discovered vs. fetched)
- I want to manually trigger extraction for a specific page
- I want to browse golden entities to verify data quality

### As a Developer
- I want to see queue depths and processing rates
- I want to trigger re-processing when code changes
- I want to inspect raw markdown and extracted entities
- I want to check similarity scoring is working correctly

---

## 3. Features & Requirements

### 3.1 Pipeline Overview (Dashboard Home)

**Requirements:**
- Show status cards for each pipeline stage:
  - **Crawler:** Active jobs, total pages, last crawl time
  - **Source:** Pending extractions, entities extracted today
  - **Identity:** Pending curator reviews, new links today
  - **Golden:** Entities materialized, last update time
- Show queue depths (crawl, source, identity, golden)
- Quick actions: "Start Crawl", "Review Entities", "Browse Data"

**API Endpoints:**
```
GET /api/stats/overview
Response: {
  crawler: { activeJobs: 2, totalPages: 1523, lastCrawl: "2025-10-27T..." },
  source: { pendingExtractions: 45, extractedToday: 234 },
  identity: { pendingReviews: 18, linksToday: 42 },
  golden: { totalEntities: 856, lastMaterialized: "2025-10-27T..." },
  queues: { crawl: 12, source: 45, identity: 8, golden: 3 }
}
```

### 3.2 Crawl Job Management

**Requirements:**
- **List View:** Table of crawl jobs with columns:
  - Seed URL
  - Status (discovering, fetching, extracting, complete, failed)
  - Progress (urlsFetched / urlsDiscovered)
  - Force flag indicator (icon/badge if true)
  - Created/Updated timestamps
  - Actions (View Details, Restart if failed)
- **Create Form:** Start new crawl
  - Input: Seed URL, Max Pages (default 50), Search Term (optional)
  - **Force Rescrape Checkbox** (default: unchecked)
    - Label: "Force rescrape existing pages"
    - Help text: "By default, only new URLs are scraped. Enable this to rescrape URLs that already exist in the database."
  - Validation: Valid URL, max pages ≤ 200
  - Submit → Creates job and redirects to detail view
- **Detail View:** Single crawl job
  - Progress bar (urlsFetched / urlsDiscovered)
  - Show "Skipped X URLs (already scraped)" if force=false and URLs were filtered
  - URL list with status (pending, fetching, fetched, failed, skipped)
  - Error messages if any
  - Action: "Retry Failed URLs"

**API Endpoints:**
```
GET /api/crawl/jobs
Response: { jobs: [...] }

POST /api/crawl/start
Body: { seed: string, maxPages?: number, searchTerm?: string, force?: boolean }
Response: { jobId: string }
Implementation: Forward to crawler worker POST /crawl endpoint

GET /api/crawl/jobs/:jobId
Response: {
  job: {
    id, seedUrl, status, urlsDiscovered, urlsFetched,
    force, createdAt, updatedAt
  },
  urls: [...]
}

POST /api/crawl/retry/:jobId
Response: { retriedCount: number }
```

**URL Deduplication Logic (Implemented in Crawler Worker):**
1. Crawler discovers URLs via Firecrawl /map
2. All discovered URLs are inserted into `discovered_urls` table
3. **Before queuing fetch jobs:**
   - If `force=false` (default): Query `pages` table, filter out URLs that already exist
   - If `force=true`: Queue all discovered URLs for fetch
4. Only new/unscraped URLs are queued for fetching
5. **Result:** Same domain can be crawled multiple times to discover new pages, but existing pages aren't re-scraped (saves API credits)

**Dashboard Implementation:**
```tsx
// Crawl form component
<form onSubmit={handleSubmit}>
  <input name="seed" placeholder="https://example.com" />
  <input name="maxPages" type="number" defaultValue={50} />
  <input name="searchTerm" placeholder="gallery" />

  <label>
    <input type="checkbox" name="force" />
    Force rescrape existing pages
    <small>By default, only new URLs are scraped</small>
  </label>

  <button type="submit">Start Crawl</button>
</form>

// API call
const startCrawl = async (data) => {
  return fetchApi('/crawl/start', {
    method: 'POST',
    body: JSON.stringify({
      seed: data.seed,
      maxPages: data.maxPages || 50,
      searchTerm: data.searchTerm,
      force: data.force || false
    })
  });
};
```

### 3.3 Entity Curator (PRIMARY FEATURE)

**Requirements:**
- **Queue View:** List of entity pairs needing review
  - Filter by entity type (artist, gallery, event)
  - Filter by similarity range (default 0.85-0.95)
  - Sort by similarity score (highest first)
- **Review Card:** For each pair, show:
  - Entity A and B side-by-side:
    - Display name
    - All source attributes (name variants, bio, website, etc.)
    - Source URLs where found
  - Similarity score (0-1)
  - Action buttons:
    - **Merge** (primary) - Marks curator_decision='merged', triggers golden.materialize
    - **Dismiss** (secondary) - Marks curator_decision='dismissed'
    - **Skip** - Don't decide now, show next pair
- **Bulk Actions:** Select multiple pairs and approve/dismiss together
- **Stats:** Show total pending, reviewed today, accuracy metrics

**API Endpoints:**
```
GET /api/curator/queue?entityType=artist&minSim=0.85&maxSim=0.95&limit=50
Response: {
  pairs: [
    {
      linkId: uuid,
      entityA: { id, name, bio, website, socials, sources: [...] },
      entityB: { id, name, bio, website, socials, sources: [...] },
      score: 0.92,
      createdAt: "..."
    }
  ]
}

POST /api/curator/merge
Body: { linkId: uuid }
Response: { ok: true }
Actions:
1. Update identity_links SET curator_decision='merged' WHERE id=linkId
2. Call merge_identity_entities RPC
3. Send golden.materialize message for winner entity

POST /api/curator/dismiss
Body: { linkId: uuid }
Response: { ok: true }
Actions:
1. Update identity_links SET curator_decision='dismissed' WHERE id=linkId

POST /api/curator/bulk-merge
Body: { linkIds: uuid[] }
Response: { merged: number }

GET /api/curator/stats
Response: {
  pending: 18,
  reviewedToday: 42,
  mergedToday: 28,
  dismissedToday: 14
}
```

**Implementation:**
- Use `get_entities_for_review` RPC for queue
- JOIN `source_*` tables to show all attributes per entity
- Use `merge_identity_entities` RPC for merge action
- Send `golden.materialize` message after merge

### 3.4 Pages Browser

**Requirements:**
- **List View:** Table of scraped pages
  - Columns: URL, Status, Markdown Length, Extraction Status, Fetched At
  - Filters: extraction_status (pending, processing, complete, failed)
  - Search by URL
  - Pagination (50 per page)
- **Detail View:** Single page
  - Display markdown (truncated, expandable)
  - Show extracted entities (artists, galleries, events)
  - Action: "Re-extract" (sends source.extract message)

**API Endpoints:**
```
GET /api/pages?status=pending&page=1&limit=50&search=moma
Response: {
  pages: [...],
  total: 234,
  page: 1,
  limit: 50
}

GET /api/pages/:url (URL-encoded)
Response: {
  page: { url, status, md, extraction_status, fetched_at },
  entities: {
    artists: [...],
    galleries: [...],
    events: [...]
  }
}

POST /api/pages/extract
Body: { url: string }
Response: { ok: true }
Actions:
1. Send source.extract message to queue
```

**Implementation:**
- Query `pages` table with filters
- JOIN `source_*` tables by page_url for entity list
- Use URL encoding for page detail route

### 3.5 Golden Entities Browser

**Requirements:**
- **Entity Type Tabs:** Artists | Galleries | Events
- **List View:** Cards showing:
  - Display name
  - Key attributes (bio, website, address)
  - Last materialized timestamp
  - Source count (how many sources consolidated)
- **Search:** By name
- **Detail View:** Full entity with:
  - All attributes
  - List of source records that feed into it
  - Action: "Re-materialize" (sends golden.materialize message)

**API Endpoints:**
```
GET /api/golden/artists?search=picasso&page=1&limit=50
Response: { artists: [...], total, page, limit }

GET /api/golden/galleries?search=&page=1&limit=50
Response: { galleries: [...], total, page, limit }

GET /api/golden/events?search=&page=1&limit=50
Response: { events: [...], total, page, limit }

GET /api/golden/artists/:entityId
Response: {
  entity: { id, name, bio, website, socials, last_materialized_at },
  sources: [{ source_id, name, bio, website, page_url }]
}

POST /api/golden/materialize
Body: { entityType: string, entityId: uuid }
Response: { ok: true }
Actions:
1. Send golden.materialize message
```

**Implementation:**
- Query `golden_*` tables
- JOIN `identity_entities` to get last_materialized_at
- JOIN `source_*` via identity_entity_id for source list

### 3.6 Manual Actions

**Requirements:**
- Trigger any pipeline stage manually:
  - **Fetch URL:** Scrape single URL (no crawl job)
  - **Extract Page:** Re-run AI extraction on existing page
  - **Index Entity:** Re-index entity with new embedding
  - **Materialize Entity:** Re-build golden record

**API Endpoints:**
```
POST /api/actions/fetch
Body: { url: string }
Response: { ok: true }
Actions: Forward to crawler worker /fetch endpoint

POST /api/actions/extract
Body: { url: string }
Response: { ok: true }
Actions: Send source.extract message

POST /api/actions/index
Body: { entityType: string, sourceId: uuid }
Response: { ok: true }
Actions: Send identity.index.* message

POST /api/actions/materialize
Body: { entityType: string, entityId: uuid }
Response: { ok: true }
Actions: Send golden.materialize message
```

---

## 4. Technical Architecture

### 4.1 Tech Stack

**Backend (Cloudflare Worker):**
- Runtime: Cloudflare Workers (V8 isolate)
- Language: TypeScript
- Framework: Minimal (native fetch API)
- Database: Supabase PostgreSQL (via REST API)
- Queue: Cloudflare Queues (producer bindings)

**Frontend (Single Page App):**
- Framework: React 18 + TypeScript
- Build: Vite
- Styling: TailwindCSS
- UI Components: shadcn/ui (Radix UI primitives)
- Data Fetching: TanStack Query (React Query)
- Routing: React Router v6
- Deployment: Served as static assets by worker

### 4.2 File Structure

```
src/workers/coordinator/
├── PRD.md (this file)
├── coordinator.ts (worker entry point)
├── wrangler.jsonc (already configured)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── routes/ (API route handlers)
│   │   ├── stats.ts
│   │   ├── crawl.ts
│   │   ├── curator.ts
│   │   ├── pages.ts
│   │   ├── golden.ts
│   │   └── actions.ts
│   ├── lib/
│   │   ├── supabase.ts (client factory)
│   │   └── queues.ts (message helpers)
│   └── frontend/ (React app)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ui/ (shadcn components)
│       │   ├── PipelineOverview.tsx
│       │   ├── CrawlJobList.tsx
│       │   ├── EntityCurator.tsx
│       │   ├── PagesBrowser.tsx
│       │   └── GoldenBrowser.tsx
│       ├── hooks/
│       │   ├── useCrawlJobs.ts
│       │   ├── useCuratorQueue.ts
│       │   └── useGoldenEntities.ts
│       └── lib/
│           ├── api.ts (fetch wrapper)
│           └── types.ts
└── public/ (Vite build output)
```

### 4.3 Data Flow

```
Browser → Coordinator Worker → Supabase / Other Workers / Queues

Example: Merge Entity
1. User clicks "Merge" on entity pair
2. Frontend: POST /api/curator/merge { linkId }
3. Backend:
   a. Update identity_links.curator_decision = 'merged'
   b. Call merge_identity_entities RPC
   c. Send golden.materialize message to queue
   d. Return { ok: true }
4. Frontend: Refetch curator queue (remove merged pair)
5. Golden worker: Processes message, materializes entity
```

---

## 5. API Implementation Guide

### 5.1 Worker Entry Point (`coordinator.ts`)

```typescript
import { handleApiRequest } from './src/routes';

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // Serve frontend static assets
    // (Vite builds to ./public, served via assets binding)
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    // SPA fallback: serve index.html for all routes
    return env.ASSETS.fetch(new URL('/index.html', url.origin));
  },
} satisfies ExportedHandler<Env>;
```

### 5.2 Route Handler Pattern

```typescript
// src/routes/index.ts
export async function handleApiRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');

  // Route matching
  if (path.startsWith('/stats')) {
    return handleStats(request, env);
  }
  if (path.startsWith('/crawl')) {
    return handleCrawl(request, env);
  }
  if (path.startsWith('/curator')) {
    return handleCurator(request, env);
  }
  if (path.startsWith('/pages')) {
    return handlePages(request, env);
  }
  if (path.startsWith('/golden')) {
    return handleGolden(request, env);
  }
  if (path.startsWith('/actions')) {
    return handleActions(request, env);
  }

  return new Response('Not found', { status: 404 });
}
```

### 5.3 Example Route: Curator Merge

```typescript
// src/routes/curator.ts
import { getServiceClient } from '@/shared/supabase';
import { jsonResponse } from '@/shared/http';

export async function handleCurator(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/curator', '');

  if (path === '/merge' && request.method === 'POST') {
    const body = await request.json();
    const { linkId } = body;

    if (!linkId) {
      return jsonResponse(400, { error: 'linkId required' });
    }

    const sb = getServiceClient(env);

    // 1. Get link details to find winner/loser
    const { data: link } = await sb
      .from('identity_links')
      .select('entity_type, a_id, b_id')
      .eq('id', linkId)
      .single();

    if (!link) {
      return jsonResponse(404, { error: 'Link not found' });
    }

    // 2. Update curator decision
    await sb
      .from('identity_links')
      .update({ curator_decision: 'merged' })
      .eq('id', linkId);

    // 3. Merge entities (RPC handles canonical logic)
    await sb.rpc('merge_identity_entities', {
      t: link.entity_type,
      winner: link.a_id,
      loser: link.b_id,
    });

    // 4. Trigger golden materialization
    await env.GOLDEN_PRODUCER.send({
      type: 'golden.materialize',
      entityType: link.entity_type,
      entityId: link.a_id, // Winner becomes canonical
    });

    return jsonResponse(200, { ok: true });
  }

  if (path === '/dismiss' && request.method === 'POST') {
    const body = await request.json();
    const { linkId } = body;

    const sb = getServiceClient(env);
    await sb
      .from('identity_links')
      .update({ curator_decision: 'dismissed' })
      .eq('id', linkId);

    return jsonResponse(200, { ok: true });
  }

  if (path === '/queue' && request.method === 'GET') {
    const entityType = url.searchParams.get('entityType');
    const minSim = parseFloat(url.searchParams.get('minSim') || '0.85');
    const maxSim = parseFloat(url.searchParams.get('maxSim') || '0.95');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const sb = getServiceClient(env);
    const { data } = await sb.rpc('get_entities_for_review', {
      filter_entity_type: entityType || null,
      min_similarity: minSim,
      max_similarity: maxSim,
      review_limit: limit,
    });

    // Enhance with full entity details (names, attributes, sources)
    const pairs = await Promise.all(data.map(async (row) => {
      // Fetch entity A and B details based on entity_type
      const tableMap = {
        artist: 'source_artists',
        gallery: 'source_galleries',
        event: 'source_events',
      };
      const table = tableMap[row.entity_type];

      const [entityA, entityB] = await Promise.all([
        sb.from(table).select('*').eq('identity_entity_id', row.entity_a_id),
        sb.from(table).select('*').eq('identity_entity_id', row.entity_b_id),
      ]);

      return {
        linkId: row.link_id,
        entityA: {
          id: row.entity_a_id,
          name: row.entity_a_name,
          sources: entityA.data || [],
        },
        entityB: {
          id: row.entity_b_id,
          name: row.entity_b_name,
          sources: entityB.data || [],
        },
        score: row.similarity_score,
        createdAt: row.created_at,
      };
    }));

    return jsonResponse(200, { pairs });
  }

  return new Response('Not found', { status: 404 });
}
```

---

## 6. Frontend Implementation Guide

### 6.1 Setup (package.json)

```json
{
  "name": "citychat-coordinator",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.24.1",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.0",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35"
  }
}
```

### 6.2 Main App Structure

```tsx
// src/frontend/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardLayout } from './components/DashboardLayout';
import { PipelineOverview } from './components/PipelineOverview';
import { CrawlJobList } from './components/CrawlJobList';
import { EntityCurator } from './components/EntityCurator';
import { PagesBrowser } from './components/PagesBrowser';
import { GoldenBrowser } from './components/GoldenBrowser';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<PipelineOverview />} />
            <Route path="/crawl" element={<CrawlJobList />} />
            <Route path="/curator" element={<EntityCurator />} />
            <Route path="/pages" element={<PagesBrowser />} />
            <Route path="/golden/:type" element={<GoldenBrowser />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### 6.3 API Client

```typescript
// src/frontend/lib/api.ts
const BASE_URL = '/api';

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  // Stats
  getOverview: () => fetchApi('/stats/overview'),

  // Crawl
  getCrawlJobs: () => fetchApi('/crawl/jobs'),
  startCrawl: (data: { seed: string; maxPages?: number }) =>
    fetchApi('/crawl/start', { method: 'POST', body: JSON.stringify(data) }),
  getCrawlJob: (jobId: string) => fetchApi(`/crawl/jobs/${jobId}`),

  // Curator
  getCuratorQueue: (params: {
    entityType?: string;
    minSim?: number;
    maxSim?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.entityType) query.set('entityType', params.entityType);
    if (params.minSim) query.set('minSim', params.minSim.toString());
    if (params.maxSim) query.set('maxSim', params.maxSim.toString());
    return fetchApi(`/curator/queue?${query}`);
  },
  mergePair: (linkId: string) =>
    fetchApi('/curator/merge', { method: 'POST', body: JSON.stringify({ linkId }) }),
  dismissPair: (linkId: string) =>
    fetchApi('/curator/dismiss', { method: 'POST', body: JSON.stringify({ linkId }) }),

  // Pages
  getPages: (params: { status?: string; page: number; search?: string }) => {
    const query = new URLSearchParams({ page: params.page.toString() });
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    return fetchApi(`/pages?${query}`);
  },
  getPage: (url: string) => fetchApi(`/pages/${encodeURIComponent(url)}`),
  extractPage: (url: string) =>
    fetchApi('/pages/extract', { method: 'POST', body: JSON.stringify({ url }) }),

  // Golden
  getGoldenArtists: (params: { search?: string; page: number }) => {
    const query = new URLSearchParams({ page: params.page.toString() });
    if (params.search) query.set('search', params.search);
    return fetchApi(`/golden/artists?${query}`);
  },
  // ... similar for galleries and events
};
```

### 6.4 Key Component: Entity Curator

```tsx
// src/frontend/components/EntityCurator.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function EntityCurator() {
  const [entityType, setEntityType] = useState<string>('artist');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['curator-queue', entityType],
    queryFn: () => api.getCuratorQueue({ entityType }),
  });

  const mergeMutation = useMutation({
    mutationFn: api.mergePair,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curator-queue'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: api.dismissPair,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curator-queue'] });
    },
  });

  if (isLoading) return <div>Loading...</div>;

  const pairs = data?.pairs || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Entity Curator</h1>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="artist">Artists</option>
          <option value="gallery">Galleries</option>
          <option value="event">Events</option>
        </select>
      </div>

      <div className="text-sm text-gray-600">
        {pairs.length} pairs pending review
      </div>

      <div className="space-y-4">
        {pairs.map((pair: any) => (
          <div key={pair.linkId} className="border rounded-lg p-6 bg-white shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold">
                Similarity: {(pair.score * 100).toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Entity A */}
              <div className="border-r pr-6">
                <h3 className="font-semibold mb-2">Entity A</h3>
                <div className="text-sm text-gray-600 mb-1">
                  Name: {pair.entityA.name}
                </div>
                <div className="text-xs text-gray-500">
                  {pair.entityA.sources.length} source(s)
                </div>
                {pair.entityA.sources.map((source: any) => (
                  <div key={source.id} className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <div><strong>Name:</strong> {source.name}</div>
                    {source.bio && <div><strong>Bio:</strong> {source.bio.slice(0, 100)}...</div>}
                    {source.website && <div><strong>Website:</strong> {source.website}</div>}
                    <div className="text-gray-500 mt-1">From: {source.page_url}</div>
                  </div>
                ))}
              </div>

              {/* Entity B */}
              <div className="pl-6">
                <h3 className="font-semibold mb-2">Entity B</h3>
                <div className="text-sm text-gray-600 mb-1">
                  Name: {pair.entityB.name}
                </div>
                <div className="text-xs text-gray-500">
                  {pair.entityB.sources.length} source(s)
                </div>
                {pair.entityB.sources.map((source: any) => (
                  <div key={source.id} className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <div><strong>Name:</strong> {source.name}</div>
                    {source.bio && <div><strong>Bio:</strong> {source.bio.slice(0, 100)}...</div>}
                    {source.website && <div><strong>Website:</strong> {source.website}</div>}
                    <div className="text-gray-500 mt-1">From: {source.page_url}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => mergeMutation.mutate(pair.linkId)}
                disabled={mergeMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {mergeMutation.isPending ? 'Merging...' : 'Merge'}
              </button>
              <button
                onClick={() => dismissMutation.mutate(pair.linkId)}
                disabled={dismissMutation.isPending}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pairs.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No pairs pending review. Great job!
        </div>
      )}
    </div>
  );
}
```

---

## 7. Implementation Steps

### Phase 1: Backend Setup (2-3 hours)
1. **Create package.json** with dependencies
2. **Update coordinator.ts** with routing skeleton
3. **Create route handlers** (stats, crawl, curator, pages, golden, actions)
4. **Test each endpoint** with curl/Postman

### Phase 2: Frontend Setup (1-2 hours)
6. **Initialize Vite + React** project in `src/frontend/`
7. **Configure Tailwind CSS** and basic layout
8. **Create API client** (`api.ts`) with fetch wrapper
9. **Set up React Router** and QueryClient
10. **Build navigation layout** (sidebar, header)

### Phase 3: Core Features (4-6 hours)
11. **Pipeline Overview** - Stats cards and quick actions
12. **Entity Curator** - Review interface with merge/dismiss
13. **Crawl Job List** - Table with create form
14. **Pages Browser** - List and detail views
15. **Golden Browser** - Entity cards with search

### Phase 4: Polish (2-3 hours)
16. **Error handling** - Toast notifications, retry logic
17. **Loading states** - Skeletons, spinners
18. **Responsive design** - Mobile-friendly layout
19. **Keyboard shortcuts** - Curator hotkeys (M=merge, D=dismiss, S=skip)

### Phase 5: Deploy (1 hour)
20. **Build frontend** - `bun run build` (outputs to `./public`)
21. **Configure wrangler** - Already done! (admin.zinelocal.com)
22. **Deploy worker** - `bunx wrangler deploy`
23. **Test in production** - Verify all features work

---

## 8. Environment Variables

**Worker Secrets (Cloudflare):**
```bash
# Set via: bunx wrangler secret put <NAME>
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
OPENAI_API_KEY=sk-...
```

**Note:** No authentication required for internal admin dashboard

---

## 9. Security Considerations

### Authentication
- **Current:** No authentication (internal tool)
- **Future:** Add Cloudflare Access for SSO if needed
- Dashboard is accessible to anyone with the admin.zinelocal.com URL
- Consider adding authentication if exposing beyond internal team

### Rate Limiting
- Not critical for internal tool with 1-5 users
- Add if abuse occurs (Cloudflare Rate Limiting rules)

### Input Validation
- Validate all user inputs (URLs, UUIDs, entity types)
- Sanitize before passing to database
- Use Supabase RLS if needed (currently using service role)

### CORS
- Not needed (frontend served by same worker)
- API endpoints same-origin

---

## 10. Testing Strategy

### Manual Testing Checklist
- [ ] Can start a crawl job
- [ ] Can view crawl progress
- [ ] Can review entity pairs
- [ ] Can merge entities
- [ ] Can dismiss false positives
- [ ] Merged entity appears in golden table
- [ ] Can browse pages
- [ ] Can trigger re-extraction
- [ ] Can search golden entities
- [ ] Dashboard works on mobile
- [ ] Force rescrape checkbox works correctly
- [ ] Deduplication skips existing URLs when force=false

### Future: Automated Tests
- Unit tests for route handlers
- Integration tests for API endpoints
- E2E tests for curator workflow

---

## 11. Future Enhancements

### V1.1 (Nice to Have)
- Batch merge/dismiss (select multiple pairs)
- Keyboard shortcuts for curator (M/D/S)
- Real-time updates (WebSocket for queue status)
- Export data (CSV download for entities)
- Undo merge (mark as pending again)

### V1.2 (Advanced)
- Analytics dashboard (crawl velocity, extraction accuracy)
- Entity conflict resolver (3+ entities matched)
- Manual entity editing (fix mistakes)
- Audit log (who merged/dismissed what)
- Cloudflare Access integration (SSO)

### V2.0 (Major)
- Multi-tenancy (multiple orgs)
- Approval workflows (require 2 reviews)
- ML feedback loop (train on curator decisions)
- Bulk operations (merge all >0.95 automatically)

---

## 12. Success Metrics

### Week 1 Goals
- Dashboard deployed to admin.zinelocal.com
- Can start crawls and see progress
- Can review and merge 50+ entity pairs

### Month 1 Goals
- 500+ entities curated
- 95%+ curator accuracy (dismissed entities truly different)
- 10+ crawl jobs completed
- Pipeline running smoothly end-to-end

---

## Appendix: Quick Reference

### Commands
```bash
# Development
cd src/workers/coordinator
bun install
bun run dev  # Start Vite dev server

# Build
bun run build  # Vite builds to ./public

# Deploy
bunx wrangler deploy  # Deploys to admin.zinelocal.com

# Set secrets (if not already set)
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put OPENAI_API_KEY

# Tail logs
bunx wrangler tail
```

### Useful SQL Queries
```sql
-- Pending curator reviews
SELECT COUNT(*) FROM identity_links
WHERE curator_decision = 'pending' AND relation = 'similar';

-- Entities needing materialization
SELECT COUNT(*) FROM identity_entities
WHERE last_materialized_at < updated_at;

-- Crawl job status
SELECT status, COUNT(*) FROM crawl_jobs GROUP BY status;

-- Pages by extraction status
SELECT extraction_status, COUNT(*) FROM pages GROUP BY extraction_status;
```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-27
**Status:** Ready for Implementation
