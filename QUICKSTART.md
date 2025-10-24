# Gallery Agents Quick Start

Scrapes gallery websites → classifies with GPT-5 → stores in Supabase → extracts via Cloudflare Workflows + Queues → generates embeddings.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Coordinator │────▶│ Gallery Agent│────▶│ CrawlerWorkflow  │
│   Agent     │     │  (Durable)   │     │  (scrapes pages) │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                                   ▼
                                         ┌──────────────────┐
                                         │ Extraction Queue │
                                         │  (Cloudflare)    │
                                         └────────┬─────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────┐
                    ▼                             ▼                         ▼
         ┌────────────────────┐      ┌─────────────────────┐    ┌─────────────────────┐
         │ GalleryInfoWorkflow│      │ArtistExtraction     │    │ EventExtraction     │
         │  (extract gallery) │      │Workflow             │    │ Workflow            │
         └──────────┬─────────┘      └──────────┬──────────┘    └──────────┬──────────┘
                    │                           │                           │
                    └───────────────────────────┴───────────────────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   Supabase   │
                                         │  (Postgres)  │
                                         └──────────────┘
```

**Flow:**
1. **Coordinator** manages galleries per city
2. **Gallery Agent** (Durable Object) schedules scraping
3. **CrawlerWorkflow** uses Firecrawl to scrape pages
4. Scraped pages are classified and enqueued for extraction
5. **Extraction Queue** distributes jobs to workflow handlers
6. **Extraction Workflows** (Gallery/Artist/Event) extract structured data using GPT-5
7. Data stored in **Supabase** with embeddings for semantic search

---

## Setup

### 1. Install & Configure

```bash
bun install

# Create .env (not committed)
cat > .env << EOF
FIRECRAWL_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
EOF
```

### 2. Set up Supabase

The project uses Supabase (Postgres) for data storage. Ensure your Supabase project has the required schema:

**Tables:**
- `galleries` - Gallery information (name, website, type, city, timezone)
- `artists` - Artist information (name, bio, website)
- `events` - Event information (title, description, dates, type, category, price)
- `scraped_pages` - Raw scraped pages (URL, markdown, classification)
- `event_artists` - Junction table linking events to artists

**Note:** Embeddings are stored as JSON strings in `embedding` columns (1536 dimensions from OpenAI's `text-embedding-3-small`)

### 3. Cloudflare Queues

Queues are automatically configured via `wrangler.jsonc`. The `extraction-jobs` queue handles extraction workflow creation.

**Queue Configuration:**
- Producer binding: `EXTRACTION_QUEUE`
- Consumer: Processes up to 10 messages per batch
- Timeout: 10 seconds per batch

---

## Run

```bash
bunx wrangler dev
```

In another terminal:

```bash
PORT=<your-port>  # From wrangler dev output

# Seed galleries
curl -X POST http://localhost:$PORT/agents/coordinator-agent/warsaw \
  -H "Content-Type: application/json" \
  -d @seed-galleries.json

# Check status (wait ~2-3 min for scraping)
curl http://localhost:$PORT/agents/coordinator-agent/warsaw | jq
```

---

## Query Data

### Via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor or Table Editor
3. Query your data directly

### Via Supabase Client (from code)

```typescript
import { createSupabaseClient } from './utils/supabase';

const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Count galleries
const { count } = await client.from('galleries').select('*', { count: 'exact', head: true });

// Get recent events
const { data: events } = await client
  .from('events')
  .select('title, event_type, start, price')
  .order('created_at', { ascending: false })
  .limit(10);

// View pages by classification
const { data: pageStats } = await client
  .from('scraped_pages')
  .select('classification')
  .then(result => {
    // Group and count in application code
    const counts = {};
    result.data?.forEach(page => {
      counts[page.classification] = (counts[page.classification] || 0) + 1;
    });
    return counts;
  });
```

### Semantic Search with Embeddings

Embeddings are stored as JSON strings in the `embedding` column. To perform semantic search:

```typescript
// 1. Generate embedding for search query
const embedding = await embedQuery("contemporary art exhibition");

// 2. Query Supabase with cosine similarity
// Note: Requires pg_vector extension and proper indexing in Supabase
const { data } = await client.rpc('match_events', {
  query_embedding: embedding,
  match_threshold: 0.7,
  match_count: 10
});
```

---

## Reset / Clear Data

### Supabase Tables

Use the Supabase dashboard SQL Editor or client:

```sql
-- Clear all data (respects foreign key constraints)
DELETE FROM event_artists;
DELETE FROM events;
DELETE FROM scraped_pages;
DELETE FROM artists;
DELETE FROM galleries;
```

Or via Supabase client:

```typescript
const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

await client.from('event_artists').delete().neq('event_id', '');
await client.from('events').delete().neq('id', '');
await client.from('scraped_pages').delete().neq('id', '');
await client.from('artists').delete().neq('id', '');
await client.from('galleries').delete().neq('id', '');
```

### Durable Object State (Local)

```bash
rm -rf .wrangler/state/v3/do
```

### Cloudflare Queue State (Local)

Queues are persisted in `.wrangler/` during local development:

```bash
rm -rf .wrangler/state/v3/queues
```

**Note:** In production, queues are managed by Cloudflare and don't require manual cleanup

---

## API Routes

### Coordinator (city-level)

```bash
GET  /agents/coordinator-agent/warsaw        # List all galleries + aggregated data
POST /agents/coordinator-agent/warsaw        # Bootstrap new galleries
     Body: {"urls": ["https://gallery.com"]}
```

### Gallery (per-gallery)

```bash
GET /agents/gallery-agent/u-jazdowski-pl-wydarzenia           # Get cached results
GET /agents/gallery-agent/u-jazdowski-pl-wydarzenia?workflow  # Check workflow status
```

---

## Troubleshooting

**"Failed to connect to Supabase"**

- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly in `.env`
- Check that your Supabase project is active
- Ensure tables exist in your Supabase database

**GPT-5 schema validation errors: "response did not match schema"**

The extraction schemas now have lenient validation:
- `artistNames` defaults to empty array if missing
- `start` and `end` timestamps are optional (nullable in DB)
- Check logs for detailed AI responses
- Events without required fields (title, description, eventType, category) will fail validation

**Queue errors: "instance.already_exists"**

This is **normal** during message retries:
- The queue consumer acknowledges duplicate workflow creation
- No action needed - workflow is already running
- Check workflow status via the Gallery Agent API

**Workflow execution timeouts**

Each workflow step has a 10-minute timeout. If Firecrawl or OpenAI is slow:
- Check `SCRAPE_CONFIG.STEP_TIMEOUT_MS` in `src/agents/workflows.ts`
- Monitor workflow logs via `bunx wrangler tail`
- Workflows automatically resume from the last completed step

**"IoContext timed out due to inactivity"**

This warning appears when background tasks (like workflows) take longer than the HTTP request context:
- This is **expected behavior** with Cloudflare Workflows
- Workflows continue running independently
- Check workflow status through the Gallery Agent API

---

## Deploy to Production

### 1. Configure Production Secrets

```bash
# Set secrets (will be prompted for values)
bunx wrangler secret put FIRECRAWL_API_KEY
bunx wrangler secret put OPENAI_API_KEY
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_ANON_KEY
```

### 2. Ensure Supabase Production Setup

Make sure your production Supabase project has:
- All required tables created
- Proper indexes on frequently queried columns
- Row-level security policies configured (if needed)
- `pg_vector` extension enabled for embedding search (optional)

### 3. Deploy to Cloudflare

```bash
bunx wrangler deploy
```

This deploys:
- Durable Objects (CoordinatorAgent, GalleryAgent)
- Workflows (CrawlerWorkflow, GalleryInfoWorkflow, ArtistExtractionWorkflow, EventExtractionWorkflow)
- Queue consumer for `extraction-jobs`
- HTTP handler for API routes

**Notes:**
- Queues are automatically provisioned in production
- Workflows run with the same configuration as local dev
- Monitor logs with `bunx wrangler tail --env production`
