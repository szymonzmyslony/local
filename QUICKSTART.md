# Gallery Agents Quick Start

Scrapes gallery websites → classifies with GPT-5 → stores in D1 → generates embeddings → enables semantic search with Vectorize.

---

## Setup

### 1. Install & Configure

```bash
bun install

# Create .env (not committed)
cat > .env << EOF
FIRECRAWL_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
EOF
```

### 2. Create D1 Database

```bash
bunx wrangler d1 create gallery-db
bunx wrangler d1 execute gallery-db --local --file=./schema.sql
```

### 3. Create Vectorize Indexes

**⚠️ Vectorize is ALWAYS remote, even in dev!**

```bash
# Create indexes
bunx wrangler vectorize create gallery-list --dimensions=1536 --metric=cosine
bunx wrangler vectorize create gallery-events --dimensions=1536 --metric=cosine

# Create metadata indexes (enables filtering)
bunx wrangler vectorize create-metadata-index gallery-events --property-name=start --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=category --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=eventType --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=price --type=number
bunx wrangler vectorize create-metadata-index gallery-list --property-name=galleryType --type=string
```

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

### D1 Database

```bash
# Count data
bunx wrangler d1 execute gallery-db --local --command="SELECT COUNT(*) FROM galleries"
bunx wrangler d1 execute gallery-db --local --command="SELECT COUNT(*) FROM events"
bunx wrangler d1 execute gallery-db --local --command="SELECT COUNT(*) FROM scraped_pages"

# View events
bunx wrangler d1 execute gallery-db --local \
  --command="SELECT title, event_type, start, price FROM events LIMIT 10"

# View pages by classification
bunx wrangler d1 execute gallery-db --local \
  --command="SELECT classification, COUNT(*) FROM scraped_pages GROUP BY classification"
```

### Vectorize

```bash
# View index info (shows vector count)
bunx wrangler vectorize get gallery-events
bunx wrangler vectorize get gallery-list

# List all indexes
bunx wrangler vectorize list

# View metadata indexes
bunx wrangler vectorize list-metadata-index gallery-events
bunx wrangler vectorize list-metadata-index gallery-list

# Query vectors (requires embedding vector - see src/utils/vectorize.ts for usage)
# Use searchEvents() or searchGalleries() from your code to query with filters
```

---

## Reset / Clear Data

### Local D1 Database

**⚠️ Deleting `.wrangler/` removes all local data!**

```bash
# Full reset
rm -rf .wrangler/state/v3/d1
bunx wrangler d1 execute gallery-db --local --file=./schema.sql

# Or truncate tables
bunx wrangler d1 execute gallery-db --local --command="DELETE FROM events"
bunx wrangler d1 execute gallery-db --local --command="DELETE FROM scraped_pages"
bunx wrangler d1 execute gallery-db --local --command="DELETE FROM galleries"
```

### Durable Object State

```bash
rm -rf .wrangler/state/v3/do
```

### Vectorize (⚠️ Remote - affects production!)

```bash
# Delete and recreate indexes
bunx wrangler vectorize delete gallery-events
bunx wrangler vectorize delete gallery-list

bunx wrangler vectorize create gallery-list --dimensions=1536 --metric=cosine
bunx wrangler vectorize create gallery-events --dimensions=1536 --metric=cosine

# Recreate metadata indexes
bunx wrangler vectorize create-metadata-index gallery-events --property-name=start --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=category --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=eventType --type=string
bunx wrangler vectorize create-metadata-index gallery-events --property-name=price --type=number
bunx wrangler vectorize create-metadata-index gallery-list --property-name=galleryType --type=string
```

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

**"no such table: galleries"**

```bash
bunx wrangler d1 execute gallery-db --local --file=./schema.sql
```

**GPT-5 schema validation errors**

- Check logs for detailed error messages
- Event extraction failures return empty array (non-blocking)

**Vectorize warnings about not supported**

- Normal! Vectorize is always remote, set `"remote": true` in `wrangler.jsonc`

---

## Deploy to Production

```bash
# Create remote database
bunx wrangler d1 create gallery-db --remote
bunx wrangler d1 execute gallery-db --remote --file=./schema.sql

# Set secrets
echo "your_key" | bunx wrangler secret put FIRECRAWL_API_KEY
echo "your_key" | bunx wrangler secret put OPENAI_API_KEY

# Deploy
bunx wrangler deploy
```

**Note:** Vectorize indexes are already remote - same ones used in dev and prod!
