# CityChat Workers Architecture

This repo packages the CityChat pipeline as three Cloudflare Workers plus a thin coordinator. Each Worker is deployable on its own, and the stages communicate over Queues.

## Layers

- **Coordinator** (`src/workers/coordinator`) — exposes `/ingest-md` and `/mark-same`. It upserts Markdown into `pages` and publishes to the `SOURCE` queue.
- **Source** (`src/workers/source`) — consumes `SOURCE` messages or `/ingest-md`, extracts artists/galleries/events with the AI SDK + OpenAI, writes `source_*` tables, and emits per-row jobs to the `IDENTITY` queue.
- **Identity** (`src/workers/identity`) — consumes `IDENTITY` messages or `/index`, maps source rows to `identity_entities`, runs embeddings/similarity via the AI SDK, links event participants, and enqueues Golden materialization.
- **Golden** (`src/workers/golden`) — consumes `GOLDEN` messages or `/materialize`, resolves canonical identities, aggregates source evidence, and upserts `golden_*` tables plus canonical event→artist edges.

Each worker folder contains its own `wrangler.jsonc`, `worker-configuration.d.ts`, and expects environment variables served from `.env` in the project root (Wrangler automatically loads them).

## Running Types & Dev

```
cd src/workers/<worker>
bunx wrangler types
bunx wrangler dev
```

Queues should be created for `SOURCE`, `IDENTITY`, and `GOLDEN` before running the full pipeline.
