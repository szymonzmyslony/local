# CityChat Worker Pipeline

This repository is now a pure Cloudflare Workers project implementing the CityChat ingestion pipeline. Each layer is an independent worker and the stages pass work through Cloudflare Queues while persisting state in Supabase.

```
Seed URL → crawl queue → source queue → identity queue → golden queue
```

## Workers at a Glance

| Worker | Path | What it does |
| --- | --- | --- |
| Crawler | `src/workers/crawler` | Accepts `/crawl { seed, maxPages }`, enqueues crawl jobs, consumes the `CRAWL` queue, scrapes Markdown with Firecrawl, writes to `pages`, and emits `source.extract` jobs. |
| Coordinator | `src/workers/coordinator` | Optional ingress exposing `/ingest-md` & `/mark-same`; upserts Markdown manually and publishes `SOURCE`/`GOLDEN` jobs. |
| Source | `src/workers/source` | Consumes `SOURCE` jobs (or `/ingest-md`), extracts artists/galleries/events with the AI SDK + OpenAI, writes `source_*`, and emits `IDENTITY` jobs. |
| Identity | `src/workers/identity` | Consumes `IDENTITY` jobs, creates/merges identities with embeddings, links events→artists, and emits `GOLDEN` jobs. |
| Golden | `src/workers/golden` | Consumes `GOLDEN` jobs, resolves canonical families, aggregates source evidence, and upserts `golden_*` tables plus canonical event→artist edges. |

Shared helpers live in `src/shared`, and Supabase typings are generated into `src/types/database_types.ts`.

## Environment & Queue Setup

Create four queues in Cloudflare: `crawl`, `source`, `identity`, `golden`.

```bash
# once per account (requires `bunx wrangler login`)
./scripts/setup-queues.sh
```

| Worker | Required bindings |
| --- | --- |
| crawler | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`, queue producers `CRAWL_PRODUCER` & `SOURCE_PRODUCER`, queue consumer `crawl` |
| coordinator | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, queue producers `SOURCE_PRODUCER`, `GOLDEN_PRODUCER` |
| source | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, queue producer `IDENTITY_PRODUCER`, queue consumer `source` |
| identity | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, queue producer `GOLDEN_PRODUCER`, queue consumer `identity` |
| golden | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, queue consumer `golden` |

During development place these values in each worker’s `.dev.vars` (Wrangler automatically loads `.env` in the project root too).

## Working on a Worker

```bash
cd src/workers/<worker>
bunx wrangler types
bunx wrangler dev --listen 127.0.0.1:<port>
```

> ⚠️ `wrangler dev --local` keeps queue messages inside a single process. To test the full queue chain, either run remote dev (`bunx wrangler dev`) or deploy the workers so Cloudflare queues deliver messages between them.

## End-to-End Crawl

1. Start all workers (`crawler`, `coordinator`, `source`, `identity`, `golden`) in separate terminals or deploy them.
2. Kick off a crawl:

   ```bash
   curl -X POST http://127.0.0.1:8787/crawl \
     -H "content-type: application/json" \
     -d '{ "seed": "https://www.moma.org/", "maxPages": 20 }'
   ```

   The endpoint responds immediately (`202`) after enqueueing a `CRAWL` job.

3. The crawler worker consumes the job, fetches Markdown via Firecrawl, upserts it into Supabase, and emits `source.extract` messages. The Source, Identity, and Golden workers process their respective queues, refreshing `source_*`, `identity_*`, and `golden_*` tables. All operations rely on upserts, so re-running a crawl for the same site is idempotent.

## Typical Commands

- Regenerate Supabase typings: `bunx supabase gen types --lang=typescript --project-id <id> --schema public > src/types/database_types.ts`
- Type-check the workspace: `bunx tsc --noEmit`
- Deploy a worker: `bunx wrangler deploy --config wrangler.jsonc`

The repository no longer contains legacy UI or agent code. The root now just holds shared configuration and the `src` tree containing workers and shared utilities.
