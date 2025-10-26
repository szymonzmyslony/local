# CityChat Pipeline Architecture

The repository implements CityChat's ingestion pipeline entirely with Cloudflare Workers. Each layer is an independent Worker that communicates via Cloudflare Queues and stores state in Supabase. All operations are idempotent, so any layer can be re-run without breaking the pipeline.

```
Seed URL ──> crawl queue ──> source queue ──> identity queue ──> golden queue
                     │             │                  │                  │
                 Supabase.pages    │                  │                  │
                                   ▼                  ▼                  ▼
                           Supabase.source_*   Supabase.identity_*  Supabase.golden_*
```

## Layers & Hand-offs

### 1. Crawler Worker (`src/workers/crawler`)
- **Ingress**: `POST /crawl { seed, maxPages? }` enqueues a `crawl` queue job and returns immediately (`202`).
- **Queue Consumer**: pulls `crawl` jobs, fetches Markdown with Firecrawl, upserts into `pages`, and emits `source.extract` messages to the `source` queue for each visited URL.
- **Idempotency**: upserts on `pages`; visiting the same URL just refreshes Markdown and replays downstream queues.
- **Reads**:
  - `crawl` queue messages `{ seed, maxPages }`
  - HTML from the requested URL to discover same-origin links
  - Firecrawl API response for Markdown
- **Writes**:
  - `pages` upserted with latest markdown / timestamps
- **Emits**:
  - `source.extract` messages onto the `source` queue (one per successfully scraped page)

### 2. Source Worker (`src/workers/source`)
- **Ingress**: `POST /ingest-md { url, markdown }` (primarily for tests/manual runs).
- **Queue Consumer**: handles `source.extract`, loads Markdown from `pages`, extracts artists/galleries/events using AI SDK + OpenAI, writes to `source_*`, and emits `identity.index.*` jobs onto the `identity` queue.
- **Idempotency**: upserts to `pages`; `source_*` inserts ignore conflicts on `(page_url, name/title)`.
- **Reads**:
  - `source` queue messages `{ type: "source.extract", url }`
  - Supabase `pages.md` for the requested URL
- **Writes**:
  - `source_artists`, `source_galleries`, `source_events` (per-page unique rows)
- **Emits**:
  - `identity.index.artist/gallery/event` messages containing the inserted source row IDs

### 3. Identity Worker (`src/workers/identity`)
- **Ingress**: `POST /index { entity_type, source_id }` for manual re-indexing; `POST /merge` for human merges.
- **Queue Consumer**: processes `identity.index.*` messages, creates/updates `identity_entities` with embeddings, links event participants, records similarities, and emits `golden.materialize` jobs.
- **Idempotency**: embeddings overwrite previous values; linking operations use upserts; similarity insert uses upsert with unique key `(entity_type, a_id, b_id, relation)`.
- **Reads**:
  - `identity` queue messages naming source IDs
  - Supabase `source_*` rows referenced by the IDs
  - Supabase helper functions (`match_identity_entities`, `resolve_canonical`)
- **Writes**:
  - `identity_entities` (new identities or updated embeddings)
  - `source_*` backfill of `identity_entity_id`
  - `identity_links`, `identity_event_artists`
- **Emits**:
  - `golden.materialize` messages for canonical identities (including newly created participant artists)

### 4. Golden Worker (`src/workers/golden`)
- **Ingress**: `POST /materialize { entityType, entityId }`.
- **Queue Consumer**: consumes `golden.materialize`, resolves canonical families, aggregates source evidence, and upserts `golden_*` plus canonical `golden_event_artists` edges.
- **Idempotency**: everything is keyed by `entity_id`, so re-materializing refreshes the canonical view.
- **Reads**:
  - `golden` queue messages `{ entityType, entityId }`
  - Supabase `identity_entities`, `identity_family`, `source_*`, `identity_event_artists`
- **Writes**:
  - `golden_artists`, `golden_galleries`, `golden_events`, `golden_event_artists`
- **Emits**:
  - No further queue messages (Golden layer is terminal)

### Optional: Coordinator Worker (`src/workers/coordinator`)
- **Ingress**: `/ingest-md` and `/mark-same`. Useful for debugging and curator merges but not required for automated crawl.
- **Output**: emits `source.extract` and `golden.materialize` jobs as needed.
- **Reads**:
  - `/mark-same` invokes Supabase RPC `merge_identity_entities`
- **Writes**:
  - `pages` via `/ingest-md`
- **Emits**:
  - `source.extract` (after ingest)
  - `golden.materialize` (after merge)

## Queue Payloads

| Queue | Message format | Produced by | Consumed by |
| --- | --- | --- | --- |
| `crawl` | `{ type: "crawler.crawl", seed, maxPages? }` | Crawler HTTP endpoint | Crawler queue consumer |
| `source` | `{ type: "source.extract", url }` | Crawler & Coordinator | Source worker |
| `identity` | `{ type: "identity.index.*", source*Id }` | Source worker | Identity worker |
| `golden` | `{ type: "golden.materialize", entityType, entityId }` | Identity worker & Coordinator | Golden worker |

Queue names are **lowercase** to satisfy Cloudflare constraints. Every worker keeps its queue bindings in its local `wrangler.jsonc` and regenerates `worker-configuration.d.ts` via `bunx wrangler types`.

## Running Workers Independently

Each worker is a standalone HTTP service:
- Crawler: `/crawl`, `/health`
- Source: `/ingest-md`, `/health`
- Identity: `/index`, `/merge`, `/health`
- Golden: `/materialize`, `/health`
- Coordinator: `/ingest-md`, `/mark-same`, `/health`

This allows targeted reprocessing. For example, re-extract a single page by calling `/ingest-md` on Source; re-materialize a golden record via `/materialize`. Since each step is idempotent, it is safe to re-run individual workers as many times as needed.

## Environment Expectations

All workers need Supabase credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Additionally:
- Crawler: `FIRECRAWL_API_KEY`
- Source & Identity: `OPENAI_API_KEY`

Queues must exist beforehand (`./scripts/setup-queues.sh` creates `crawl`, `source`, `identity`, `golden`).

## Local vs Remote Dev

- **Remote dev (`bunx wrangler dev --config ... --remote`)** runs code in Cloudflare and uses the actual queues. Use this mode for end-to-end testing without deploying.
- **Local stub (`--local`)** keeps queue messages inside the process—useful for quick iteration, but messages won’t reach other workers running in different terminals.

## Failure & Recovery

- Crawling: if Firecrawl fails for a URL, the job skips it. Re-enqueueing the seed is safe; visited-set lives per job.
- Downstream: queue retries are handled by Cloudflare. Re-running `/crawl`, `/ingest-md`, `/index`, or `/materialize` simply refreshes data.
- Supabase schema includes helper functions (`resolve_canonical`, `match_identity_entities`) that operate on the latest embeddings; maintain them when changing embedding dimensions.

## Deployment Checklist

1. `bunx wrangler login`
2. `./scripts/setup-queues.sh`
3. Ensure secrets are configured (`bunx wrangler secret put ...` or dash).
4. Deploy each worker:
   ```
   cd src/workers/<worker>
   bunx wrangler deploy --config wrangler.jsonc
   ```
5. Trigger `/crawl` with a seed URL and monitor Supabase for new data.

With this architecture, the pipeline can ingest a new site end-to-end or let you manually fix isolated records by calling the relevant worker, all while keeping the state consistent in Supabase.
