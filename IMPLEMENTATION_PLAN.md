# Gallery Agents ETL Pipeline

## Overview

A 4-stage idempotent ETL pipeline for extracting, reviewing, deduplicating, and normalizing art world entities (artists, galleries, events) from crawled web pages.

```
Crawl → Extract → Review → Similarity → Golden
  ↓        ↓         ↓          ↓           ↓
Pages → Extracted → Approved → Linked → Canonical
```

**Key principles**:
- **Idempotent**: Each stage can be re-run without side effects
- **Database-driven**: Stages read from previous stage's output tables
- **Curator-in-the-loop**: Human review at critical decision points

---

## Architecture

### Data Flow

```
┌──────────────┐
│  Seed URLs   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│  Stage 1: Crawl/Extract  │──▶ discovered_urls
│  (Automated)             │──▶ pages
└──────┬───────────────────┘──▶ extracted_artists
       │                    ──▶ extracted_galleries
       │                    ──▶ extracted_events
       │                        (status: pending_review)
       ▼
┌──────────────────────────┐
│  Stage 2: Review         │
│  (Curator)               │──▶ extracted_*
└──────┬───────────────────┘    (status: approved)
       │
       ▼
┌──────────────────────────┐
│  Stage 3: Similarity     │──▶ artist_links
│  (Automated)             │──▶ gallery_links
└──────┬───────────────────┘──▶ event_links
       │                        (similarity_score: 0.0-1.0)
       │                        (curator_decision: pending)
       ▼
┌──────────────────────────┐
│  Stage 4: Golden         │──▶ golden_artists
│  (Curator + Automated)   │──▶ golden_galleries
└──────────────────────────┘──▶ golden_events
```

---

## Stage 1: Crawl & Extract

### Purpose
Discover pages from seed URLs and extract structured entities using LLM.

### Input
- **Seed URL**: Starting point for crawl (e.g., `https://moma.org/events`)
- **Parameters**: max_pages, search_term, include_subdomains

### Process
1. **Crawl Worker**: BFS crawl, discover links, store in `discovered_urls`
2. **Source Worker**: Fetch page content, store in `pages`
3. **Extraction Worker**: LLM parses HTML → structured entities
   - Artists: name, bio, website, socials
   - Galleries: name, description, address, website
   - Events: title, description, venue, dates

### Output Tables
- `discovered_urls`: All URLs found during crawl (job_id, url, status)
- `pages`: Fetched page content (url, md, extraction_status)
- `extracted_artists`: Extracted artist entities (review_status: pending_review)
- `extracted_galleries`: Extracted gallery entities (review_status: pending_review)
- `extracted_events`: Extracted event entities (review_status: pending_review)

### Idempotency
- Re-running with same seed URL: Skips already-fetched URLs (by url + job_id)
- Re-extraction: Updates existing records or creates new ones

### API Endpoints
```
POST /api/crawl/start
  { seed_url, max_pages, search_term }

GET  /api/crawl/jobs
GET  /api/crawl/jobs/{jobId}/pages
GET  /api/pages/{encodedUrl}/entities
```

---

## Stage 2: Review (Curator Approval)

### Purpose
Human curator reviews extracted entities, edits fields, and approves for next stage.

### Input
- All entities with `review_status = "pending_review"`
- Organized hierarchically: Crawl Job → Pages → Entities

### Process
1. **Select crawl job**: Curator chooses which job to review
2. **Browse pages**: See pages with entity counts
3. **Expand page**: View all entities extracted from that page
4. **Edit entity**: Click to open dialog, modify fields
5. **Bulk approve**: Select pages (all entities) or individual entities
6. **Optional**: Trigger similarity computation immediately

### Output
- Updated entities with `review_status = "approved"`
- `reviewed_at` timestamp set

### Idempotency
- Re-approving same entities: No-op (already approved)
- Editing approved entity: Updates fields, keeps approved status
- Rejecting entity: Sets `review_status = "rejected"` (excluded from similarity)

### UI Flow
```
Review Tab
├─ [Select Crawl Job ▼]
├─ [Artists | Galleries | Events]
└─ Page List
    ├─ ☑ example.com/page1 (5 entities) ▼
    │   ├─ ☑ Entity 1 [Edit] [Approved]
    │   ├─ ☐ Entity 2 [Edit] [Pending]
    │   └─ ☐ Entity 3 [Edit] [Pending]
    └─ ☐ example.com/page2 (3 entities) ▶

[Bulk Actions Bar]
  2 pages, 1 entity selected
  [Clear] [Reject] [Approve] [Approve & Queue Similarity]
```

### API Endpoints
```
GET   /api/extracted/artists?crawl_job_id=xxx&page_url=xxx
GET   /api/extracted/artists/{id}
PATCH /api/extracted/artists/{id}
POST  /api/extracted/bulk-approve-by-page
  { page_urls: [], entity_types: [], trigger_similarity: bool }
```

---

## Stage 3: Similarity (Deduplication Detection)

### Purpose
Find duplicate entities across pages/jobs using embedding similarity.

### Input
- All entities with `review_status = "approved"`
- Triggered manually by curator OR automatically after approval

### Process
1. **Embedding Generation**:
   - Concatenate entity fields (name + bio/description)
   - Generate embedding via OpenAI API
   - Store in `embedding` column (vector type)

2. **Similarity Computation**:
   - Query vector DB for similar entities (cosine similarity)
   - Threshold: 0.85+ typically indicates duplicates
   - Create links in `artist_links`, `gallery_links`, `event_links`

3. **Link Storage**:
   - Store pairs: (source_a_id, source_b_id, similarity_score)
   - Include denormalized fields for curator review
   - Default: `curator_decision = "pending"`

### Output Tables
- `artist_links`: Pairs of similar artists
- `gallery_links`: Pairs of similar galleries
- `event_links`: Pairs of similar events

Fields: `link_id, source_a_id, source_b_id, similarity_score, curator_decision, curator_notes`

### Idempotency
- Re-computing similarity: Updates existing links or creates new ones
- If entity changes: Re-trigger similarity, old links remain unless updated

### Curator Review
After similarity computation, curator reviews pairs:
- **Dismiss**: Mark `curator_decision = "dismissed"` (not duplicates)
- **Mark for Merge**: Set `curator_decision = "merged"` (proceed to golden)

### UI Flow
```
Similarity Tab
├─ [Optional: Filter by Crawl Job ▼]
├─ [Similarity Range: 85% ━━━━○━━━ 95%]
├─ [Artists | Galleries | Events]
└─ Pair List
    ├─ MoMA │ 92% │ The Museum of Modern Art
    │  [Dismiss] [Mark for Merge]
    │
    ├─ John Smith (NY) │ 88% │ John Smith (New York)
    │  [Dismiss] [Mark for Merge]
```

### API Endpoints
```
POST /api/similarity/trigger
  { entity_type, entity_ids: [], threshold: 0.85 }

GET  /api/similarity/pairs/artists?min_similarity=0.85&crawl_job_id=xxx
POST /api/similarity/pairs/{linkId}/artists/merge
POST /api/similarity/pairs/{linkId}/artists/dismiss
```

---

## Stage 4: Golden (Canonical Records)

### Purpose
Merge approved duplicate entities into single canonical "golden" records.

### Input
- Similarity pairs with `curator_decision = "merged"`
- Source entities from `extracted_*` tables

### Process
1. **Cluster Formation**:
   - Group merged pairs into clusters (transitive closure)
   - Example: A→B, B→C becomes cluster {A, B, C}

2. **Field Selection**:
   - **Most complete**: Choose entity with most non-null fields
   - **Manual override**: Curator can specify primary entity
   - **Field merging**: Combine socials, websites (arrays)

3. **Golden Record Creation**:
   - Create single record in `golden_artists`, `golden_galleries`, or `golden_events`
   - Map source entities to golden via `entity_id` reference

4. **Traceability**:
   - Maintain lineage: golden_entity ← source_entities ← pages ← crawl_jobs

### Output Tables
- `golden_artists`: Canonical artist records
- `golden_galleries`: Canonical gallery records
- `golden_events`: Canonical event records

Fields: `entity_id, name, bio, website, socials, address, updated_at`

### Idempotency
- Re-merging same cluster: Updates existing golden record
- Adding new source to cluster: Merges into existing golden record
- Breaking cluster: Splits golden records

### UI Flow
```
Golden Tab
├─ [Artists | Galleries | Events]
└─ Canonical Records Table
    ├─ The Museum of Modern Art
    │  Address: 11 W 53rd St, New York
    │  Website: moma.org
    │  Sources: 3 entities merged
    │
    ├─ Gagosian Gallery
    │  Addresses: NYC, London, Paris (multiple locations)
    │  Sources: 5 entities merged
```

### API Endpoints
```
GET  /api/golden/artists
GET  /api/cluster/preview
  { link_ids: [] } → Shows merged result before commit
POST /api/cluster/commit
  { link_ids: [] } → Creates golden record
```

---

## Complete Workflow Example: Crawling MoMA

### Objective
Extract all events, artists, and affiliated galleries from moma.org, deduplicate, and create canonical records.

### Step 1: Initiate Crawl

**Curator Action**:
```
Dashboard → Crawl Tab
  Seed URL: https://moma.org/calendar/events
  Max Pages: 100
  Search Term: "exhibition" OR "event"
  Include Subdomains: ✓
  [Start Crawl]
```

**System Action**:
- Crawl worker discovers ~150 pages
- Source worker fetches content
- Extraction worker finds:
  - 45 events (exhibitions, talks, screenings)
  - 120 artists (mentioned in exhibitions)
  - 8 galleries (partner galleries)

**Database State**:
```sql
crawl_jobs: 1 job (status: completed)
discovered_urls: 150 URLs (status: fetched)
pages: 150 pages (extraction_status: completed)
extracted_events: 45 (review_status: pending_review)
extracted_artists: 120 (review_status: pending_review)
extracted_galleries: 8 (review_status: pending_review)
```

---

### Step 2: Review Entities

**Curator Action**:
```
Dashboard → Review Tab
  [Select Crawl Job: MoMA - Oct 2025 ▼]

Events Tab:
  ✓ moma.org/calendar/2025-10
    - "Picasso Paintings" ✓ (approved)
    - "Contemporary Voices" ✓ (approved)
    - "Members Opening" ✗ (rejected - not public)

  ✓ moma.org/calendar/2025-11
    - "Abstract Expressionism" ✓ (approved)
    ...

  [Select 10 pages]
  [Approve & Queue for Similarity]
```

**System Action**:
- Updates 42 events to `review_status = "approved"` (3 rejected)
- Queues 42 events for similarity computation
- Updates 115 artists to approved (5 rejected)
- Updates 8 galleries to approved

**Database State**:
```sql
extracted_events: 42 approved, 3 rejected
extracted_artists: 115 approved, 5 rejected
extracted_galleries: 8 approved
```

---

### Step 3: Similarity Detection

**System Action** (Automated):
- Generate embeddings for all approved entities
- Compare against existing embeddings
- Find duplicates:
  - **Events**: "Picasso: Paintings" vs "Picasso Paintings and Sculptures" (92% similar)
  - **Artists**: "Pablo Picasso" found 8 times across pages (95-98% similar)
  - **Galleries**: "Gagosian" vs "Gagosian Gallery" (91% similar)

**Database State**:
```sql
artist_links: 15 pairs (high similarity)
gallery_links: 2 pairs
event_links: 3 pairs
All with curator_decision: pending
```

**Curator Action**:
```
Dashboard → Similarity Tab
  [Filter: MoMA Job]
  [Similarity: 85% ━━━━○━━━ 95%]

Artists Tab:
  Pablo Picasso (bio: Spanish painter...)
    │ 98% │
  Pablo Picasso (bio: Cubist artist...)
    [Mark for Merge]

  Gagosian
    │ 91% │
  Gagosian Gallery
    [Mark for Merge]

  MoMA
    │ 87% │
  Museum of Modern Art
    [Dismiss] ← Different context (institution vs venue)
```

**Database State**:
```sql
artist_links: 15 pairs
  - 12 marked "merged"
  - 3 marked "dismissed"
gallery_links: 1 merged, 1 dismissed
event_links: 2 merged, 1 dismissed
```

---

### Step 4: Create Golden Records

**System Action** (Triggered by merge approval):
- Clusters merged pairs:
  - **Cluster 1**: {Pablo Picasso #1, #2, #3, #4, #5, #6, #7, #8} → 1 golden artist
  - **Cluster 2**: {Gagosian, Gagosian Gallery} → 1 golden gallery
  - **Cluster 3**: {Picasso event #1, #2} → 1 golden event

- Field selection logic:
  - Pick entity with most complete bio
  - Merge all website URLs (array)
  - Merge all social links (array)
  - Use most recent date if conflicting

**Database State**:
```sql
golden_artists: 108 records
  - Pablo Picasso (merged from 8 sources)
  - 107 other unique artists

golden_galleries: 7 records
  - Gagosian Gallery (merged from 2 sources)
  - 6 other unique galleries

golden_events: 40 records
  - "Picasso: Paintings and Sculptures" (merged from 2 sources)
  - 39 other unique events
```

**Curator View**:
```
Dashboard → Golden Tab

Artists:
┌─────────────────┬────────────────────────────────┬──────────┐
│ Name            │ Bio                            │ Sources  │
├─────────────────┼────────────────────────────────┼──────────┤
│ Pablo Picasso   │ Spanish painter and sculptor,  │ 8 merged │
│                 │ co-founder of Cubism...        │          │
├─────────────────┼────────────────────────────────┼──────────┤
│ Joan Miró       │ Catalan painter, sculptor...   │ 3 merged │
└─────────────────┴────────────────────────────────┴──────────┘

Galleries:
┌──────────────────┬────────────────────────────────┬──────────┐
│ Name             │ Address                        │ Sources  │
├──────────────────┼────────────────────────────────┼──────────┤
│ Gagosian Gallery │ Multiple locations: NYC,       │ 2 merged │
│                  │ London, Paris, Hong Kong       │          │
└──────────────────┴────────────────────────────────┴──────────┘
```

---

## Idempotency Guarantees

### Stage 1: Crawl/Extract
- **Crawl same URL twice**: Skips already-discovered URLs (by url hash)
- **Re-extract same page**: Updates or inserts (upsert by page_url + entity_id)
- **Safe to retry**: Failed extractions can be rerun without duplicates

### Stage 2: Review
- **Re-approve entity**: No-op (already approved)
- **Edit approved entity**: Updates fields, maintains approved status
- **Bulk approve same pages**: Only affects pending entities

### Stage 3: Similarity
- **Re-compute similarity**: Updates existing links, creates new ones if missing
- **Re-trigger for same entity**: Replaces old similarity scores
- **Curator decisions preserved**: Re-computation doesn't override manual decisions

### Stage 4: Golden
- **Re-merge same cluster**: Updates existing golden record with latest data
- **Add entity to cluster**: Merges into existing golden record
- **Break cluster**: Curator can split golden record back into sources

---

## Database Schema Overview

### Extraction Layer
```sql
crawl_jobs (id, seed_url, status, created_at)
discovered_urls (url, job_id, status, fetch_attempts)
pages (url, md, extraction_status, fetched_at)

extracted_artists (id, page_url, name, bio, website, review_status)
extracted_galleries (id, page_url, name, description, address, review_status)
extracted_events (id, page_url, title, venue_name, start_ts, review_status)
```

### Similarity Layer
```sql
artist_links (link_id, source_a_id, source_b_id, similarity_score, curator_decision)
gallery_links (link_id, source_a_id, source_b_id, similarity_score, curator_decision)
event_links (link_id, source_a_id, source_b_id, similarity_score, curator_decision)
```

### Golden Layer
```sql
golden_artists (entity_id, name, bio, website, socials[], updated_at)
golden_galleries (entity_id, name, description, address, website, updated_at)
golden_events (entity_id, title, description, venue_text, start_ts, updated_at)
```

---

## Key Design Decisions

### 1. Why Hierarchical Review (Job → Page → Entity)?
- **Context preservation**: Curator sees entities in context of their source page
- **Efficient bulk operations**: Approve all entities from trusted pages at once
- **Traceability**: Clear lineage from crawl job to final entity

### 2. Why Separate Similarity Stage?
- **Deferred deduplication**: Extract everything first, dedupe later
- **Cross-job merging**: Find duplicates across multiple crawl jobs
- **Curator control**: Human decides which duplicates to merge

### 3. Why Idempotent Design?
- **Fault tolerance**: Workers can crash and retry without corruption
- **Incremental updates**: Add new crawls, re-merge with existing data
- **Reproducibility**: Same inputs produce same outputs

### 4. Why Curator in the Loop?
- **Quality control**: LLM extraction has ~5-10% error rate
- **Ambiguous cases**: Human judgment for "similar but not duplicate"
- **Domain expertise**: Curator knows art world context

---

## Performance Characteristics

### Crawl/Extract
- **Speed**: ~10 pages/second (parallel workers)
- **Bottleneck**: LLM extraction (rate limited to 100 req/min)
- **Scaling**: Horizontal (more workers)

### Review
- **Speed**: Human-limited (~50 entities/minute for careful review)
- **Bulk operations**: Can approve 100+ entities in one click
- **Bottleneck**: Curator attention

### Similarity
- **Speed**: ~100 entities/second (embedding generation)
- **Bottleneck**: OpenAI API rate limits
- **Optimization**: Batch processing, caching

### Golden
- **Speed**: ~1000 merges/second (pure database operations)
- **Bottleneck**: Complex cluster resolution (transitive closure)

---

## Future Enhancements

1. **Active Learning**: Use curator decisions to fine-tune similarity thresholds
2. **Auto-approve**: Low-risk entities (single mention, low ambiguity)
3. **Conflict Resolution UI**: When merging, show field-by-field diff
4. **Provenance Tracking**: Full audit log of entity transformations
5. **Multi-curator Workflow**: Voting/consensus for merge decisions
