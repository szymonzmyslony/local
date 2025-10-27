# CityChat Pipeline Architecture

**Version:** 2.0
**Last Updated:** 2025-10-27

---

## Overview

CityChat is a content processing pipeline that crawls art gallery websites, extracts structured entity data (artists, galleries, events), deduplicates entities across sources, and materializes canonical "golden" records. The entire system runs on Cloudflare Workers with Supabase PostgreSQL for persistence and Cloudflare Queues for async processing.

### Design Philosophy

**1. Idempotency First**
- Every operation can be safely retried
- Re-running any stage refreshes data without corruption
- Database uses upserts and conflict resolution

**2. State in Database**
- Workers are stateless (V8 isolates)
- All progress tracked in Supabase tables
- Queues are ephemeral message buses only

**3. Decoupled Stages**
- Each worker is independent, communicates via queues
- Stages can be triggered manually or automatically
- Easy to add new workers or modify existing ones

**4. Observable & Controllable**
- Every stage exposes HTTP endpoints for manual triggering
- Coordinator dashboard provides full pipeline visibility
- Observability logging enabled on all workers

---

## Pipeline Flow

```
┌─────────────┐
│   Browser   │  User triggers crawl via dashboard
│  Dashboard  │  (admin.zinelocal.com)
└──────┬──────┘
       │ POST /crawl
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CRAWLER WORKER                             │
│  1. Discover URLs with Firecrawl /map                           │
│  2. Check pages table for existing URLs (deduplication)         │
│  3. Scrape new URLs with Firecrawl /scrape                      │
│  4. Store markdown in pages table                               │
└──────────────────┬──────────────────────────────────────────────┘
                   │ crawl queue → source queue
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SOURCE WORKER                              │
│  1. Load markdown from pages table                              │
│  2. Extract entities with OpenAI GPT-4o                         │
│  3. Store in source_artists/galleries/events                    │
└──────────────────┬──────────────────────────────────────────────┘
                   │ source queue → identity queue
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     IDENTITY WORKER                             │
│  1. Generate embeddings with OpenAI                             │
│  2. Find similar entities with pgvector (cosine similarity)     │
│  3. Create identity_links with curator_decision='pending'       │
│  4. Link event participants to artist entities                  │
└──────────────────┬──────────────────────────────────────────────┘
                   │ identity queue → golden queue
                   │
                   ├─── (High similarity) Auto-merge
                   │
                   └─── (Medium similarity) Await curator review
                           │
                           ▼
                   ┌──────────────────┐
                   │  COORDINATOR     │  Curator reviews entity pairs
                   │  DASHBOARD       │  Approves merges or dismisses
                   └────────┬─────────┘
                            │ On merge: Send golden.materialize
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GOLDEN WORKER                              │
│  1. Resolve canonical entity (merge tree traversal)             │
│  2. Aggregate data from all merged sources                      │
│  3. Materialize golden_artists/galleries/events                 │
│  4. Update last_materialized_at timestamp                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workers Deep Dive

### 1. Crawler Worker

**Location:** `src/workers/crawler/`
**Deployed URL:** `https://citychat-crawler.szymon-zmyslony.workers.dev`

#### Purpose

Discovers and scrapes web pages from art gallery websites using Firecrawl. Handles two phases:
1. **Mapping:** Discover URLs on a website (Firecrawl `/map` endpoint)
2. **Fetching:** Scrape individual pages for markdown content (Firecrawl `/scrape` endpoint)

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `seed` | string | (required) | Starting URL for crawl (e.g., https://www.moma.org/) |
| `maxPages` | number | 50 | Maximum URLs to discover (capped at 200) |
| `searchTerm` | string | undefined | Filter discovered URLs by keyword |
| `includeSubdomains` | boolean | false | Whether to crawl subdomains |
| `force` | boolean | false | **Force rescrape existing pages** |

#### Design Decisions

**1. Why split into map/fetch phases?**
- **Problem:** Original design processed up to 200 pages in a single worker invocation (83+ minutes)
- **Solution:** Split into two phases:
  - Map phase: Quick discovery (1-2 min), enqueues fetch jobs
  - Fetch phase: One page per message (30-60 sec each)
- **Benefit:** No timeout issues, better parallelization, granular progress tracking

**2. Why URL deduplication?**
- **Problem:** Crawling same domain monthly would rescrape all pages unnecessarily
- **Solution:** Before queuing fetch jobs, check `pages` table for existing URLs
- **Logic:**
  ```typescript
  if (!force) {
    const existingPages = await db.query("SELECT url FROM pages WHERE url IN (?)");
    urlsToFetch = discoveredUrls.filter(url => !existingPages.has(url));
  }
  ```
- **Benefit:** Save Firecrawl API credits, discover new pages without re-scraping old ones
- **Trade-off:** Extra database query in map phase (negligible cost)

**3. Why Firecrawl SDK?**
- **Alternatives:** Puppeteer, Playwright, Browserless, raw HTML parsing
- **Choice:** Firecrawl because:
  - Handles JavaScript rendering automatically
  - Returns clean markdown (not HTML soup)
  - Built-in rate limiting and proxy rotation
  - `/map` endpoint for sitemap discovery
- **Cost:** $$$, but worth it for reliability and developer time savings

**4. Why store raw markdown?**
- **Alternative:** Store only extracted entities
- **Choice:** Store full markdown for:
  - Re-extraction with improved prompts (no rescrape needed)
  - Debugging extraction failures
  - Future feature: full-text search
- **Trade-off:** Storage cost (~10-50KB per page), but PostgreSQL handles it fine

#### HTTP Endpoints

```
POST /crawl
Body: { seed: string, maxPages?: number, searchTerm?: string, force?: boolean }
Response: { jobId: uuid, status: "discovering" }
Actions:
  1. Create row in crawl_jobs table
  2. Send crawler.map message to crawl queue
  3. Return job ID for progress tracking

GET /crawl/:jobId
Response: { jobId, status, urlsDiscovered, urlsFetched, ... }
Actions:
  1. Call get_crawl_progress() RPC
  2. Return aggregated job stats

POST /fetch
Body: { url: string }
Response: { message: "Fetch queued", url }
Actions:
  1. Send crawler.fetch message directly (bypass job tracking)
  2. Useful for one-off page scrapes

GET /health
Response: "ok"
```

#### Queue Messages

**Produces:**
- `crawler.map` → `crawl` queue (internal)
- `crawler.fetch` → `crawl` queue (internal, many messages)
- `source.extract` → `source` queue (downstream)

**Consumes:**
- `crawler.map` from `crawl` queue
- `crawler.fetch` from `crawl` queue

**Message Formats:**
```typescript
type CrawlerMapMessage = {
  type: "crawler.map";
  jobId: string;
};

type CrawlerFetchMessage = {
  type: "crawler.fetch";
  url: string;
  jobId: string; // Empty string for manual fetches
};
```

#### Database Tables

**Writes:**
- `crawl_jobs` - Job metadata and progress counters
- `discovered_urls` - All URLs found during map phase
- `pages` - Scraped markdown content

**Reads:**
- `pages` - For deduplication check (if force=false)

#### Key Implementation Details

**Deduplication Logic (processMapJob):**
```typescript
// After Firecrawl /map returns URLs:
let urlsToFetch = result.links.slice(0, maxPages);

if (!crawlJob.force) {
  const { data: existingPages } = await sb
    .from("pages")
    .select("url")
    .in("url", urlsToFetch);

  const existingUrlSet = new Set(existingPages?.map(p => p.url));
  urlsToFetch = urlsToFetch.filter(url => !existingUrlSet.has(url));
}

// Queue only new URLs
for (const url of urlsToFetch) {
  await env.CRAWL_PRODUCER.send({ type: "crawler.fetch", url, jobId });
}
```

**Progress Tracking:**
- `urlsDiscovered` = Total URLs found by /map
- `urlsFetched` = Successfully scraped pages (incremented after each fetch)
- Job status: `discovering` → `fetching` → `extracting` → `complete` or `failed`

**Wrangler Config:**
```jsonc
{
  "name": "citychat-crawler",
  "compatibility_flags": ["nodejs_compat"], // For Firecrawl SDK
  "queues": {
    "producers": [
      { "queue": "source", "binding": "SOURCE_PRODUCER" },
      { "queue": "crawl", "binding": "CRAWL_PRODUCER" }
    ],
    "consumers": [
      { "queue": "crawl", "max_batch_size": 1, "max_batch_timeout": 30 }
    ]
  }
}
```

---

### 2. Source Worker

**Location:** `src/workers/source/`
**Deployed URL:** `https://citychat-source.szymon-zmyslony.workers.dev`

#### Purpose

Extracts structured entity data (artists, galleries, events) from page markdown using OpenAI's structured output API. Acts as the bridge between raw content and structured knowledge.

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | string | (required) | Page URL to extract entities from |
| Model | - | gpt-4o | OpenAI model for extraction |
| Max Tokens | - | 50,000 chars | Markdown truncated to this length |

#### Design Decisions

**1. Why OpenAI structured output?**
- **Alternatives:** Named entity recognition (NER), regex parsing, custom ML model
- **Choice:** OpenAI `generateObject` with Zod schema because:
  - Handles natural language variations ("Pablo Picasso" vs "Picasso")
  - Extracts relationships (artist → gallery, event → participants)
  - Zod ensures type-safe outputs
  - Easy to iterate on schema without retraining
- **Cost:** ~$0.01 per page, acceptable for quality

**2. Why 50KB markdown limit?**
- **Context:** GPT-4o has 128K token limit (~400KB text)
- **Choice:** 50KB because:
  - Captures full content of most pages
  - Keeps API costs reasonable
  - Reduces latency (smaller prompts = faster response)
- **Trade-off:** Very long pages get truncated, but rarely contains unique entities past 50KB

**3. Why store extraction status?**
- **Problem:** Need to know which pages are pending, processing, failed
- **Solution:** `extraction_status` enum on `pages` table
- **States:**
  - `pending` - Scraped but not yet extracted
  - `processing` - Currently being extracted by worker
  - `complete` - Entities extracted successfully
  - `failed` - Extraction error (bad markdown, API timeout, etc.)
- **Benefit:** Dashboard can show pending extraction queue, retry failed pages

**4. Why upsert on (page_url, name)?**
- **Problem:** Re-extracting a page shouldn't create duplicate entities
- **Solution:** Unique constraint on `(page_url, name)` in source_* tables
- **Logic:** If same artist name appears on same page, update existing row
- **Benefit:** Idempotent extraction, can re-run anytime

#### HTTP Endpoints

```
POST /ingest-md
Body: { url: string, markdown: string }
Response: { ok: true, queued: false }
Actions:
  1. Upsert to pages table with provided markdown
  2. Extract entities immediately (no queue)
  3. Useful for manual ingestion or testing

POST /extract/:url (URL-encoded)
Response: { ok: true, url }
Actions:
  1. Check if page exists and has markdown
  2. Extract entities immediately
  3. Useful for retrying failed extractions

GET /extract/pending
Response: { pending: number, urls: [...] }
Actions:
  1. Query pages WHERE extraction_status='pending'
  2. Return list of URLs awaiting extraction

GET /health
Response: "ok"
```

#### Queue Messages

**Produces:**
- `identity.index.artist` → `identity` queue (one per artist)
- `identity.index.gallery` → `identity` queue (one per gallery)
- `identity.index.event` → `identity` queue (one per event)

**Consumes:**
- `source.extract` from `source` queue

**Message Format:**
```typescript
type SourceQueueMessage = {
  type: "source.extract";
  url: string;
};

// Outgoing:
type IdentityIndexArtist = {
  type: "identity.index.artist";
  sourceArtistId: uuid;
};
// (similar for gallery and event)
```

#### Database Tables

**Writes:**
- `source_artists` - Extracted artist mentions (name, bio, website, socials)
- `source_galleries` - Extracted gallery mentions (name, website, address, description)
- `source_events` - Extracted event mentions (title, dates, venue, participants)
- `pages.extraction_status` - Update status after processing

**Reads:**
- `pages` - Load markdown for extraction

#### Key Implementation Details

**Extraction Flow (extractForUrl):**
```typescript
// 1. Mark as processing
await db.update("pages").set({ extraction_status: "processing" });

// 2. Extract with OpenAI
const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
const extracted = await extractFromMarkdown(openai, page.md, page.url);

// 3. Insert entities (upsert on conflict)
await Promise.all([
  insertArtists(env, sb, page.url, extracted.artists),
  insertGalleries(env, sb, page.url, extracted.galleries),
  insertEvents(env, sb, page.url, extracted.events),
]);

// 4. Mark as complete
await db.update("pages").set({ extraction_status: "complete" });

// 5. Send identity queue messages for each entity
```

**Entity Schema (Zod):**
```typescript
const ArtistZ = z.object({
  name: z.string(),
  bio: z.string().optional(),
  website: z.string().url().optional(),
  socials: z.array(z.string().url()).optional(),
});

const PageExtractZ = z.object({
  artists: z.array(ArtistZ).optional(),
  galleries: z.array(GalleryZ).optional(),
  events: z.array(EventZ).optional(),
});

// GPT-4o returns JSON matching this schema
const { object } = await generateObject({
  model: openai("gpt-5"),
  schema: PageExtractZ,
  prompt: `Extract artists, galleries, and events from markdown...`
});
```

**Error Handling:**
- On extraction failure: Update `extraction_status='failed'`, retry message
- API timeout: Cloudflare Workers 30s CPU limit, handled by queue retry
- Invalid output: Zod validation catches malformed responses

**Wrangler Config:**
```jsonc
{
  "name": "citychat-source",
  "compatibility_flags": ["nodejs_compat"], // For AI SDK
  "queues": {
    "producers": [
      { "queue": "identity", "binding": "IDENTITY_PRODUCER" }
    ],
    "consumers": [
      { "queue": "source", "max_batch_size": 10, "max_batch_timeout": 10 }
    ]
  }
}
```

---

### 3. Identity Worker

**Location:** `src/workers/identity/`
**Deployed URL:** `https://citychat-identity.szymon-zmyslony.workers.dev`

#### Purpose

Creates canonical entity identities by:
1. Generating embeddings for entity names/descriptions
2. Finding similar entities across sources using vector similarity
3. Creating identity_links for curator review
4. Merging approved duplicates
5. Linking event participants to artist entities

#### Configuration Options

| Similarity Threshold | Artist | Gallery | Event | Rationale |
|---------------------|--------|---------|-------|-----------|
| Auto-merge (>0.95) | 0.95 | 0.95 | 0.97 | Very high confidence, skip curator |
| Curator review | 0.86-0.95 | 0.86-0.95 | 0.88-0.97 | Medium confidence, needs human review |
| Ignore (<threshold) | <0.86 | <0.86 | <0.88 | Too dissimilar, not duplicates |

**Note:** Events have higher threshold because event names are more generic ("Summer Exhibition" appears on many sites).

#### Design Decisions

**1. Why pgvector with cosine similarity?**
- **Alternatives:** Exact name match, Levenshtein distance, external vector DB (Pinecone, Weaviate)
- **Choice:** pgvector (PostgreSQL extension) because:
  - Keeps everything in Supabase (no extra service)
  - Cosine similarity handles name variations ("MoMA" vs "Museum of Modern Art")
  - Fast with HNSW index (< 10ms for top-5 search)
  - Can use same DB transaction for consistency
- **Trade-off:** Limited to ~1M vectors per table before needing sharding (acceptable for art gallery entities)

**2. Why curator decision workflow?**
- **Problem:** High similarity doesn't always mean same entity ("David Zwirner" the gallery vs "David Zwirner" the person)
- **Solution:** Three-tier approach:
  - Score >0.95: Auto-merge (very confident)
  - Score 0.85-0.95: Create `identity_link` with `curator_decision='pending'`
  - Score <0.85: Ignore (too different)
- **Benefit:** Balances automation (high confidence) with human oversight (edge cases)

**3. Why store similarity links separately?**
- **Alternative:** Directly merge entities without tracking
- **Choice:** Separate `identity_links` table because:
  - Curator needs to see WHY entities were matched (score, attributes)
  - Can dismiss false positives without losing merge history
  - Analytics: Track curator accuracy over time
- **Schema:**
  ```sql
  CREATE TABLE identity_links (
    entity_type entity_type NOT NULL,
    a_id uuid REFERENCES identity_entities(id),
    b_id uuid REFERENCES identity_entities(id),
    relation text NOT NULL, -- 'similar', 'participant', etc
    score float NOT NULL,
    curator_decision curator_decision DEFAULT 'pending',
    UNIQUE(entity_type, a_id, b_id, relation)
  );
  ```

**4. Why use OpenAI embeddings instead of custom model?**
- **Alternatives:** Sentence transformers (SBERT), fine-tuned BERT on art data
- **Choice:** OpenAI `text-embedding-ada-002` because:
  - General-purpose, works well out of box
  - 1536 dimensions (good balance of quality vs storage)
  - ~$0.0001 per entity (negligible cost)
  - No model hosting/maintenance
- **Trade-off:** Could fine-tune on art domain for better accuracy, but baseline is already very good

#### HTTP Endpoints

```
POST /index
Body: { entity_type: string, source_id: uuid }
Response: { ok: true, queued: number }
Actions:
  1. Load source entity by ID
  2. Generate embedding
  3. Find similar entities
  4. Create identity_links
  5. Send golden.materialize messages

POST /merge
Body: { entity_type: string, winner: uuid, loser: uuid }
Response: { ok: true }
Actions:
  1. Call merge_identity_entities RPC
  2. Updates all loser references to point to winner
  3. Send golden.materialize for winner

GET /health
Response: "ok"
```

#### Queue Messages

**Produces:**
- `golden.materialize` → `golden` queue (after creating/merging entities)

**Consumes:**
- `identity.index.artist`, `identity.index.gallery`, `identity.index.event` from `identity` queue

**Message Formats:**
```typescript
type IdentityQueueMessage =
  | { type: "identity.index.artist"; sourceArtistId: uuid }
  | { type: "identity.index.gallery"; sourceGalleryId: uuid }
  | { type: "identity.index.event"; sourceEventId: uuid };

// Outgoing:
type GoldenMaterializeMessage = {
  type: "golden.materialize";
  entityType: "artist" | "gallery" | "event";
  entityId: uuid;
};
```

#### Database Tables

**Writes:**
- `identity_entities` - Canonical entity records with embeddings
- `identity_links` - Similarity links between entities
- `identity_event_artists` - Event → Artist participant edges
- `source_*.identity_entity_id` - Backfill foreign key to canonical entity

**Reads:**
- `source_artists`, `source_galleries`, `source_events` - Load entity data
- Calls `match_identity_entities(entity_type, embedding_vector, k)` RPC

#### Key Implementation Details

**Similarity Matching (findSimilarIdentities):**
```typescript
// 1. Generate embedding
const embedding = await embedder.embed(entityName);

// 2. Find similar entities via pgvector
const { data } = await sb.rpc("match_identity_entities", {
  t: entityType,
  q: toPgVector(embedding),
  k: 5 // Top 5 matches
});

// 3. Filter by threshold and create links
for (const match of data) {
  if (match.distance < threshold) continue; // Too dissimilar

  await sb.from("identity_links").upsert({
    entity_type: entityType,
    a_id: currentEntityId,
    b_id: match.id,
    relation: "similar",
    score: match.distance,
    curator_decision: match.distance > 0.95 ? null : "pending"
  });

  // Auto-merge if very confident
  if (match.distance > 0.95) {
    await sb.rpc("merge_identity_entities", { ... });
  }
}
```

**pgvector Function (match_identity_entities):**
```sql
CREATE OR REPLACE FUNCTION match_identity_entities(
  t entity_type,
  q vector(1536),
  k integer
) RETURNS TABLE(id uuid, distance real) AS $$
  SELECT id,
         1 - (embedding <=> q) as distance  -- Cosine similarity (0-1)
    FROM identity_entities
   WHERE entity_type = t
     AND embedding IS NOT NULL
   ORDER BY embedding <=> q  -- Cosine distance (lower = more similar)
   LIMIT k;
$$ LANGUAGE sql STABLE;
```

**Event Participant Linking:**
- Events extracted with `participants: string[]` (artist names)
- For each participant name:
  1. Generate embedding
  2. Search for matching artist entity
  3. If found: Create `identity_event_artists` edge
  4. If not found: Create new artist entity + edge
- Result: Event → Artist relationships for exhibition lineups

**Wrangler Config:**
```jsonc
{
  "name": "citychat-identity",
  "compatibility_flags": ["nodejs_compat"], // For OpenAI embeddings
  "queues": {
    "producers": [
      { "queue": "golden", "binding": "GOLDEN_PRODUCER" }
    ],
    "consumers": [
      { "queue": "identity", "max_batch_size": 10, "max_batch_timeout": 10 }
    ]
  }
}
```

---

### 4. Golden Worker

**Location:** `src/workers/golden/`
**Deployed URL:** `https://citychat-golden.szymon-zmyslony.workers.dev`

#### Purpose

Materializes canonical "golden" entity records by aggregating data from all merged source entities. Produces the clean, deduplicated data that powers the final application.

#### Configuration Options

**Aggregation Strategies:**
| Field Type | Strategy | Rationale |
|-----------|----------|-----------|
| Name | Most frequent | Most common spelling is likely correct |
| Bio/Description | Longest | Longest text usually most comprehensive |
| Website | Most frequent | Primary URL across sources |
| Socials | Union (unique) | Collect all social media accounts |
| Dates | Most frequent | Events: prefer most common date |

#### Design Decisions

**1. Why "golden" layer instead of querying sources directly?**
- **Alternative:** Application queries source_* tables and deduplicates on-the-fly
- **Choice:** Pre-materialized golden_* tables because:
  - **Performance:** Sub-millisecond queries vs multi-table joins + merge logic
  - **Consistency:** All apps see same canonical data
  - **Simplicity:** Application code doesn't need merge tree logic
- **Trade-off:** Stale data risk (mitigated by last_materialized_at timestamp)

**2. Why aggregate with "most frequent" strategy?**
- **Alternative:** Manual curator choice, ML confidence scoring
- **Choice:** Statistical aggregation because:
  - Simple, deterministic, explainable
  - If 3 sources say "Pablo Picasso" and 1 says "P. Picasso", pick "Pablo Picasso"
  - Works well in practice (can always override manually)
- **Edge cases:** Ties resolved by first occurrence (arbitrary but consistent)

**3. Why track last_materialized_at?**
- **Problem:** How to know if golden record is stale after new source added?
- **Solution:** Timestamp on `identity_entities.last_materialized_at`
- **Logic:**
  ```typescript
  // In identity worker after creating new link:
  if (entity.updated_at > entity.last_materialized_at) {
    // Golden record is stale, send golden.materialize message
  }
  ```
- **Benefit:** Dashboard can show "X entities need rematerialization"

**4. Why separate golden_event_artists table?**
- **Alternative:** Store participants as JSON array in golden_events
- **Choice:** Separate edge table because:
  - Can query "all events for artist X" efficiently
  - Can join to golden_artists for enriched data
  - Follows normalized design (easier to extend)
- **Schema:**
  ```sql
  CREATE TABLE golden_event_artists (
    event_entity_id uuid REFERENCES identity_entities(id),
    artist_entity_id uuid REFERENCES identity_entities(id),
    PRIMARY KEY (event_entity_id, artist_entity_id)
  );
  ```

#### HTTP Endpoints

```
POST /materialize
Body: { entityType: string, entityId: uuid }
Response: { ok: true }
Actions:
  1. Resolve canonical entity (merge tree traversal)
  2. Get all entities in merge family
  3. Load source data for all family members
  4. Aggregate using strategies (most frequent, longest, etc.)
  5. Upsert to golden_* table
  6. Update last_materialized_at timestamp

GET /health
Response: "ok"
```

#### Queue Messages

**Produces:** None (terminal stage)

**Consumes:**
- `golden.materialize` from `golden` queue

**Message Format:**
```typescript
type GoldenQueueMessage = {
  type: "golden.materialize";
  entityType: "artist" | "gallery" | "event";
  entityId: uuid;
};
```

#### Database Tables

**Writes:**
- `golden_artists` - Canonical artist records
- `golden_galleries` - Canonical gallery records
- `golden_events` - Canonical event records
- `golden_event_artists` - Event → Artist edges
- `identity_entities.last_materialized_at` - Update timestamp

**Reads:**
- `identity_entities` - Get canonical entity ID
- `source_artists`, `source_galleries`, `source_events` - Load all source data
- Calls `resolve_canonical(entity_id)` RPC - Follow merge tree to winner
- Calls `identity_family(canonical_id)` RPC - Get all merged entity IDs

#### Key Implementation Details

**Materialization Flow (materializeArtist):**
```typescript
// 1. Resolve canonical entity (follow merge tree)
const canonicalId = await sb.rpc("resolve_canonical", { e: entityId });

// 2. Get all entities in merge family
const familyIds = await sb.rpc("identity_family", { canon: canonicalId });
// Returns: [canonicalId, merged1, merged2, ...]

// 3. Load source data for entire family
const { data } = await sb
  .from("source_artists")
  .select("name, bio, website, socials")
  .in("identity_entity_id", familyIds);

// 4. Aggregate
const golden = {
  entity_id: canonicalId,
  name: mostFrequent(data.map(d => d.name)),
  bio: longest(data.map(d => d.bio)),
  website: mostFrequent(data.map(d => d.website)),
  socials: uniqueStrings(data.flatMap(d => d.socials)),
  updated_at: new Date().toISOString()
};

// 5. Upsert
await sb.from("golden_artists").upsert(golden, { onConflict: "entity_id" });

// 6. Update timestamp
await sb
  .from("identity_entities")
  .update({ last_materialized_at: now })
  .eq("id", canonicalId);
```

**Aggregation Helpers:**
```typescript
function mostFrequent<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const val of values) {
    if (!val) continue;
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function longest(values: (string | null)[]): string | null {
  return values
    .filter(v => v)
    .sort((a, b) => b!.length - a!.length)[0] ?? null;
}

function uniqueStrings(values: (string | null)[]): string[] {
  return [...new Set(values.filter(v => v))];
}
```

**Merge Tree Resolution (resolve_canonical RPC):**
```sql
-- Follows merge links to find ultimate winner entity
CREATE OR REPLACE FUNCTION resolve_canonical(e uuid)
RETURNS uuid AS $$
  WITH RECURSIVE tree AS (
    SELECT id, ARRAY[id] as path
      FROM identity_entities
     WHERE id = e
    UNION
    SELECT winner.id, tree.path || winner.id
      FROM tree
      JOIN identity_links link ON link.a_id = tree.id OR link.b_id = tree.id
      JOIN identity_entities winner ON
        (winner.id = link.a_id OR winner.id = link.b_id)
        AND winner.id != tree.id
        AND link.curator_decision = 'merged'
     WHERE NOT (winner.id = ANY(tree.path))
  )
  SELECT id FROM tree ORDER BY array_length(path, 1) DESC LIMIT 1;
$$ LANGUAGE sql STABLE;
```

**Wrangler Config:**
```jsonc
{
  "name": "citychat-golden",
  "queues": {
    "consumers": [
      { "queue": "golden", "max_batch_size": 10, "max_batch_timeout": 10 }
    ]
  }
}
```

---

### 5. Coordinator Worker (Dashboard)

**Location:** `src/workers/coordinator/`
**Deployed URL:** `https://admin.zinelocal.com`

#### Purpose

Admin dashboard for monitoring and controlling the entire pipeline. Provides:
- Crawl job management (start, monitor, retry)
- **Entity curator workflow** (review and merge duplicates)
- Pages browser (view scraped content, trigger re-extraction)
- Golden entities browser (view canonical records)
- Manual action triggers (re-run any pipeline stage)

#### Configuration Options

**No Authentication** (internal tool)
- Dashboard accessible to anyone with URL
- Consider adding Cloudflare Access if exposing beyond team

**Tech Stack:**
- Backend: Cloudflare Worker (TypeScript)
- Frontend: React 18 + Vite + TailwindCSS
- UI Components: shadcn/ui (Radix primitives)
- Data Fetching: TanStack Query (React Query)
- Routing: React Router v6

#### Design Decisions

**1. Why React SPA instead of server-rendered?**
- **Alternatives:** Next.js, Remix, server-side rendering
- **Choice:** Client-side SPA because:
  - Cloudflare Workers serve static assets efficiently
  - Rich interactivity needed (curator workflow, real-time updates)
  - Vite build outputs to `./public`, served by worker
  - No SSR complexity for admin dashboard
- **Trade-off:** Initial load slower, but acceptable for internal tool

**2. Why no authentication?**
- **Current:** Anyone with URL can access
- **Rationale:**
  - Internal tool for 1-5 users
  - URL not publicly discoverable
  - Faster development (no auth boilerplate)
- **Future:** Add Cloudflare Access for SSO when needed

**3. Why separate coordinator worker vs client-side API calls?**
- **Alternative:** Frontend calls crawler/source/identity workers directly
- **Choice:** Coordinator as API gateway because:
  - Centralizes business logic (merge workflow, validation)
  - Can add rate limiting, caching, analytics
  - Simpler frontend code (single API client)
- **Trade-off:** Extra network hop, but negligible latency

**4. Why entity curator is PRIMARY feature?**
- **Observation:** Automated matching gets ~90% accuracy
- **Problem:** 10% false positives pollute golden data
- **Solution:** Human-in-the-loop curator workflow
- **UX:** Side-by-side comparison, one-click approve/dismiss
- **Result:** 99%+ golden data accuracy with minimal human time

#### Key Features

**Crawl Job Management:**
- Create form with force rescrape checkbox
- List view with status, progress, timestamps
- Detail view with URL-level status (pending, fetched, failed)
- "Retry Failed URLs" action

**Entity Curator (Core Feature):**
```tsx
// Review interface
<EntityPairCard>
  <EntityPanel entity={pair.entityA}>
    <DisplayName>{entityA.name}</DisplayName>
    <Attributes bio={entityA.bio} website={entityA.website} />
    <Sources count={entityA.sources.length}>
      {entityA.sources.map(s => <SourceCard source={s} />)}
    </Sources>
  </EntityPanel>

  <EntityPanel entity={pair.entityB}>
    {/* Similar layout */}
  </EntityPanel>

  <SimilarityScore score={pair.score} />

  <Actions>
    <Button onClick={mergePair}>Merge</Button>
    <Button onClick={dismissPair}>Dismiss</Button>
  </Actions>
</EntityPairCard>
```

**API Endpoints:**
```
GET /api/stats/overview
Response: { crawler: {...}, source: {...}, identity: {...}, golden: {...} }

GET /api/crawl/jobs
POST /api/crawl/start { seed, maxPages, force }

GET /api/curator/queue?entityType=artist&minSim=0.85
POST /api/curator/merge { linkId }
POST /api/curator/dismiss { linkId }

GET /api/pages?status=pending&search=moma
GET /api/golden/artists?search=picasso

POST /api/actions/fetch { url }
POST /api/actions/extract { url }
POST /api/actions/materialize { entityType, entityId }
```

**Implementation Pattern:**
```typescript
// Backend route handler
export async function handleCurator(request: Request, env: Env) {
  const url = new URL(request.url);

  if (url.pathname.endsWith('/merge') && request.method === 'POST') {
    const { linkId } = await request.json();
    const sb = getServiceClient(env);

    // Get link details
    const { data: link } = await sb
      .from('identity_links')
      .select('entity_type, a_id, b_id')
      .eq('id', linkId)
      .single();

    // Update curator decision
    await sb
      .from('identity_links')
      .update({ curator_decision: 'merged' })
      .eq('id', linkId);

    // Merge entities
    await sb.rpc('merge_identity_entities', {
      t: link.entity_type,
      winner: link.a_id,
      loser: link.b_id
    });

    // Trigger golden materialization
    await env.GOLDEN_PRODUCER.send({
      type: 'golden.materialize',
      entityType: link.entity_type,
      entityId: link.a_id
    });

    return jsonResponse(200, { ok: true });
  }
}
```

**Frontend API Client:**
```typescript
// Uses TanStack Query for caching + optimistic updates
const mergeMutation = useMutation({
  mutationFn: (linkId) => api.mergePair(linkId),
  onSuccess: () => {
    queryClient.invalidateQueries(['curator-queue']);
  }
});

<button onClick={() => mergeMutation.mutate(linkId)}>
  {mergeMutation.isPending ? 'Merging...' : 'Merge'}
</button>
```

**Wrangler Config:**
```jsonc
{
  "name": "citychat-coordinator",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [
    { "pattern": "admin.zinelocal.com/*", "zone_name": "zinelocal.com" }
  ],
  "queues": {
    "producers": [
      { "queue": "source", "binding": "SOURCE_PRODUCER" },
      { "queue": "golden", "binding": "GOLDEN_PRODUCER" }
    ]
  }
}
```

**Deployment:**
```bash
cd src/workers/coordinator
bun install
bun run build  # Vite builds React app to ./public
bunx wrangler deploy
```

---

### 6. Landing Page & App Workers

**Landing Page:** `src/workers/landing-page/` → `https://zinelocal.com`
**App:** `src/workers/app/` → `https://chat.zinelocal.com`

#### Purpose

- **Landing Page:** Static marketing site (HTML/CSS)
- **App:** AI chat interface using Cloudflare AI and Durable Objects

**Note:** These are separate from the CityChat pipeline and maintained independently.

---

## Cross-Cutting Concerns

### Idempotency

**Principle:** Every operation can be retried without side effects.

**Implementation:**
- Database upserts with conflict resolution (`ON CONFLICT DO UPDATE`)
- Unique constraints prevent duplicates
- Queue messages are retriable (failures → retry, not dead letter queue)

**Examples:**
```typescript
// Source extraction is idempotent
await sb.from("source_artists").upsert({
  page_url,
  name,
  bio,
  ...
}, { onConflict: "page_url,name" });

// Golden materialization is idempotent
await sb.from("golden_artists").upsert({
  entity_id,
  name,
  ...
}, { onConflict: "entity_id" });
```

### Error Handling

**Queue Retry Strategy:**
- Cloudflare Queues: Automatic exponential backoff
- Max retries: 3 (then message discarded)
- Batch size: 1-10 (smaller = more parallelism, higher overhead)

**Worker-Level:**
```typescript
async queue(batch: MessageBatch, env: Env) {
  for (const message of batch.messages) {
    try {
      await processMessage(message.body, env);
      message.ack(); // Success
    } catch (error) {
      console.error("Processing error:", error);
      message.retry(); // Retry with backoff
    }
  }
}
```

**Database Transactions:**
- Most operations are single writes (upsert)
- No multi-table transactions needed (eventual consistency is OK)
- If needed: Supabase supports PostgreSQL transactions

### Observability

**Logging:**
```jsonc
{
  "observability": {
    "logs": {
      "enabled": false, // Disable default logs (noisy)
      "head_sampling_rate": 1,
      "invocation_logs": true,
      "persist": true
    }
  }
}
```

**Monitoring:**
- Cloudflare Dashboard: Request volume, error rate, CPU time
- Wrangler tail: `bunx wrangler tail --worker <name>`
- Supabase logs: SQL queries, slow queries

**Alerting (Future):**
- Dead letter queue depth > 10
- Extraction failure rate > 5%
- Queue processing lag > 5 minutes

### Performance

**Bottlenecks:**
1. **Firecrawl API:** Rate limited to ~10 req/sec (contact for increase)
2. **OpenAI API:** Rate limited by tier (can upgrade)
3. **Database:** Supabase free tier 500 MB, ~100 concurrent connections

**Optimizations:**
- Batch queue consumers (up to 10 messages at once)
- pgvector HNSW index (< 10ms similarity search)
- Connection pooling (Supabase Pooler)

**Scalability:**
- Workers: Autoscale to 100K+ requests/sec (Cloudflare handles it)
- Database: Upgrade Supabase tier when >1M entities
- Queues: No limit (Cloudflare scales automatically)

---

## Database Schema

### Core Tables

**pages** - Scraped content
```sql
CREATE TABLE pages (
  url TEXT PRIMARY KEY,
  status INT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  md TEXT,
  extraction_status extraction_status DEFAULT 'pending',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**source_artists/galleries/events** - Extracted entities
```sql
CREATE TABLE source_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url TEXT NOT NULL REFERENCES pages(url),
  name TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  socials TEXT[],
  identity_entity_id UUID REFERENCES identity_entities(id),
  UNIQUE(page_url, name)
);
```

**identity_entities** - Canonical entities with embeddings
```sql
CREATE TABLE identity_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  display_name TEXT NOT NULL,
  embedding vector(1536),
  last_materialized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON identity_entities USING hnsw (embedding vector_cosine_ops);
```

**identity_links** - Similarity links and merges
```sql
CREATE TABLE identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  a_id UUID REFERENCES identity_entities(id),
  b_id UUID REFERENCES identity_entities(id),
  relation TEXT NOT NULL,
  score FLOAT NOT NULL,
  curator_decision curator_decision DEFAULT 'pending',
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, a_id, b_id, relation)
);
```

**golden_artists/galleries/events** - Materialized records
```sql
CREATE TABLE golden_artists (
  entity_id UUID PRIMARY KEY REFERENCES identity_entities(id),
  name TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  socials TEXT[],
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Helper Functions

**match_identity_entities** - Vector similarity search
```sql
CREATE OR REPLACE FUNCTION match_identity_entities(
  t entity_type,
  q vector(1536),
  k integer
) RETURNS TABLE(id uuid, distance real) AS $$
  SELECT id, 1 - (embedding <=> q) as distance
    FROM identity_entities
   WHERE entity_type = t AND embedding IS NOT NULL
   ORDER BY embedding <=> q
   LIMIT k;
$$ LANGUAGE sql STABLE;
```

**resolve_canonical** - Follow merge tree to winner
```sql
CREATE OR REPLACE FUNCTION resolve_canonical(e uuid)
RETURNS uuid AS $$
  -- (Recursive CTE to traverse merge links)
$$ LANGUAGE sql STABLE;
```

**get_entities_for_review** - Curator queue
```sql
CREATE OR REPLACE FUNCTION get_entities_for_review(
  filter_entity_type entity_type DEFAULT NULL,
  min_similarity FLOAT DEFAULT 0.85,
  max_similarity FLOAT DEFAULT 0.95,
  review_limit INT DEFAULT 50
) RETURNS TABLE(...) AS $$
  SELECT il.id AS link_id,
         il.a_id, il.b_id,
         il.score AS similarity_score,
         ea.display_name AS entity_a_name,
         eb.display_name AS entity_b_name
    FROM identity_links il
    JOIN identity_entities ea ON ea.id = il.a_id
    JOIN identity_entities eb ON eb.id = il.b_id
   WHERE il.curator_decision = 'pending'
     AND il.relation = 'similar'
     AND il.score BETWEEN min_similarity AND max_similarity
   ORDER BY il.score DESC
   LIMIT review_limit;
$$ LANGUAGE plpgsql STABLE;
```

---

## Deployment Guide

### Prerequisites

1. Cloudflare account with Workers/Queues enabled
2. Supabase project with PostgreSQL database
3. API keys: Firecrawl, OpenAI

### Initial Setup

**1. Configure Queues:**
```bash
./scripts/setup-queues.sh
# Creates: crawl, source, identity, golden queues
```

**2. Apply Database Migrations:**
```bash
cd supabase
supabase db push
# Applies all migrations in supabase/migrations/
```

**3. Set Worker Secrets:**
```bash
# Crawler
cd src/workers/crawler
bunx wrangler secret put FIRECRAWL_API_KEY
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Source
cd ../source
bunx wrangler secret put OPENAI_API_KEY
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Identity
cd ../identity
bunx wrangler secret put OPENAI_API_KEY
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Golden
cd ../golden
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Coordinator
cd ../coordinator
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put OPENAI_API_KEY
```

**4. Deploy Workers:**
```bash
# Deploy each worker
for worker in crawler source identity golden coordinator; do
  cd src/workers/$worker
  bunx wrangler deploy
done
```

### Testing End-to-End

**1. Start a Crawl:**
```bash
curl -X POST https://citychat-crawler.szymon-zmyslony.workers.dev/crawl \
  -H "content-type: application/json" \
  -d '{"seed": "https://www.davidzwirner.com/", "maxPages": 10}'
```

**2. Monitor Progress:**
```bash
# Check crawl status
curl https://citychat-crawler.szymon-zmyslony.workers.dev/crawl/<JOB_ID>

# Check Supabase tables
SELECT COUNT(*) FROM pages WHERE extraction_status='complete';
SELECT COUNT(*) FROM source_artists;
SELECT COUNT(*) FROM identity_entities;
SELECT COUNT(*) FROM golden_artists;
```

**3. Review Entities in Dashboard:**
```
https://admin.zinelocal.com/curator
```

### Local Development

**Run individual worker:**
```bash
cd src/workers/<worker>
bunx wrangler dev --remote  # Uses real queues
```

**Watch logs:**
```bash
bunx wrangler tail --worker <name>
```

---

## Troubleshooting

### Common Issues

**1. Queue messages not being consumed**
- Check consumer is deployed: `bunx wrangler deployments list`
- Verify queue binding in wrangler.jsonc
- Check queue depth: Cloudflare Dashboard → Queues

**2. Extraction failing with timeout**
- Reduce markdown size (currently 50KB limit)
- Check OpenAI API rate limits
- Verify `nodejs_compat` flag in wrangler.jsonc

**3. Similarity scores > 1.0**
- Check `match_identity_entities` function uses `<=>` (cosine distance)
- Verify formula: `1 - (embedding <=> q)` for similarity

**4. Golden records not updating**
- Check `last_materialized_at` timestamp
- Manually trigger: `POST /materialize { entityType, entityId }`
- Verify queue messages sent after merge

### Debug Commands

```bash
# View queue messages
curl https://citychat-crawler.szymon-zmyslony.workers.dev/crawl/<JOB_ID>

# Check extraction status
curl https://citychat-source.szymon-zmyslony.workers.dev/extract/pending

# Manually trigger extraction
curl -X POST https://citychat-source.szymon-zmyslony.workers.dev/extract/https%3A%2F%2Fexample.com

# View worker logs
bunx wrangler tail --worker citychat-crawler

# Check database
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM pages GROUP BY status;"
```

---

## Future Enhancements

### Short-Term (V1.1)

- [ ] Batch curator operations (approve 10 pairs at once)
- [ ] Keyboard shortcuts in curator (M=merge, D=dismiss)
- [ ] Real-time dashboard updates (WebSocket or polling)
- [ ] Export golden data (CSV download)

### Medium-Term (V1.2)

- [ ] Analytics dashboard (crawl velocity, extraction accuracy)
- [ ] Cloudflare Access integration (SSO)
- [ ] Multi-curator workflow (require 2 approvals)
- [ ] Undo merge (revert curator decision)

### Long-Term (V2.0)

- [ ] ML feedback loop (train on curator decisions)
- [ ] Automatic re-crawl scheduling (monthly updates)
- [ ] Multi-tenancy (multiple organizations)
- [ ] Public API for golden data access

---

## Appendix: Design Rationale Summary

| Decision | Rationale |
|----------|-----------|
| Cloudflare Workers | Serverless, autoscaling, <30s CPU time constraint forces good design |
| Cloudflare Queues | Simple, reliable, no dead letter queues (forces idempotency) |
| Supabase PostgreSQL | Managed Postgres, pgvector for embeddings, generous free tier |
| Firecrawl | Best-in-class scraping, handles JS, returns clean markdown |
| OpenAI GPT-4o | State-of-art extraction, structured output, no model hosting |
| pgvector | Keep embeddings in DB, fast HNSW index, no external vector DB |
| Curator workflow | Balance automation with human oversight for 99%+ accuracy |
| Golden layer | Pre-materialized for performance, consistency, simplicity |
| URL deduplication | Save API credits, faster crawls, allow same domain multiple times |
| React dashboard | Rich interactivity, modern UX, Vite build efficiency |
| No authentication | Internal tool, faster development, add SSO later if needed |

---

**Last Updated:** 2025-10-27
**Contributors:** CityChat Team
**License:** Internal Use Only
