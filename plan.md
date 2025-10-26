# CityChat — Cloudflare Workers Architecture & 3‑Layer Design (Single File Doc)

This document describes the **end‑to‑end design** of CityChat’s data pipeline with a focus on the **Cloudflare Workers architecture** and **clean separation by layer**. Each layer is implemented as an **independent Worker** that can run on its own via HTTP, and optionally chain to the next layer via **Queues**.

---

## 0) First Principles & Constraints

- **Strong typing in Postgres**
  - Use **ENUMs** (not domains) for categorical fields:
    - `entity_type`: `'artist' | 'gallery' | 'event'`
    - `link_relation`: `'similar' | 'same'`
    - `link_created_by`: `'system' | 'human'`
- **Page uniqueness by URL**
  - `pages.url` is the **primary key**; you upsert pages by URL.
- **AI‑only extraction**
  - Firecrawl provides **Markdown** per page.
  - We extract **typed objects** with **AI + Zod** (no JSON‑LD heuristics).
- **Identity has only two link types**
  - `similar` (automatic, cosine similarity above threshold)
  - `same` (human, curator merge)
- **No generic edges**
  - Only one typed relation: **event → artist**.
- **Enrichment, not destructive upserts**
  - Source records what each page says (per‑page uniqueness).
  - Identity creates “one entity per real thing” and suggests merges.
  - Golden materializes the canonical “best view” from **winner + losers**.

---

## 1) Cloudflare Workers & Queues — Topology

We deploy **four** Workers. Each can be run **independently**:

1) **Coordinator** (public ingress + curator actions)
2) **Source Worker** (Layer 1)
3) **Identity Worker** (Layer 2)
4) **Golden Worker** (Layer 3)

### Message Flow (when chained)

```mermaid
flowchart LR
  A[Coordinator\nHTTP] -->|SOURCE.enqueue| B[Source Worker]
  B -->|IDENTITY.enqueue| C[Identity Worker]
  C -->|GOLDEN.enqueue| D[Golden Worker]

  E[Curator UI] -->|/mark-same| A
  Independence by Design

Each Worker supports an HTTP trigger so it can be run standalone:
	•	Coordinator
	•	POST /ingest-md — upserts a page (URL is PK), optionally enqueues SOURCE.
	•	POST /mark-same — human merge (sets alias_of), optionally enqueues GOLDEN.
	•	Source Worker
	•	POST /ingest-md — same as Coordinator (if you want to bypass it).
	•	Queue consumer: SOURCE → extract → write source_* → optionally enqueue IDENTITY.
	•	Identity Worker
	•	POST /index — accept Source IDs to index on demand.
	•	Queue consumer: IDENTITY → create/fetch identities, suggest similar, build event→artist links → optionally enqueue GOLDEN.
	•	Golden Worker
	•	POST /materialize — materialize any identity ID on demand.
	•	Queue consumer: GOLDEN → materialize canonical rows.

You can run just one Worker (e.g., Source) in a dev sandbox using HTTP. Queues are optional until you want the full pipeline.

Bindings & Secrets (typical)
	•	SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (database)
	•	OPENAI_API_KEY (AI object extraction)
	•	AI (Cloudflare Workers AI) for embeddings (Identity layer)
	•	Optional queue bindings: SOURCE, IDENTITY, GOLDEN + DLQs

⸻

2) Data Model Overview (Tables by Layer)

The DDL lives in separate migrations per layer so each layer remains deployable independently.

Layer 1 — Source (What each page says)
	•	pages
	•	url (PK), md, status, fetched_at, timestamps
	•	source_artists
	•	id (PK), page_url → pages.url, name, bio?, website?, socials[], timestamps
	•	Unique: (page_url, name)
	•	(Later: nullable identity_entity_id FK added by Identity)
	•	source_galleries
	•	id (PK), page_url, name, website?, address?, description?
	•	Unique: (page_url, name)
	•	(Later: identity_entity_id FK)
	•	source_events
	•	id (PK), page_url, title, description?, url?, start_ts?, end_ts?, venue_name?, participants[]
	•	Unique: (page_url, title)
	•	(Later: identity_entity_id FK)

Layer 2 — Identity (Who it really is)
	•	ENUMs
	•	entity_type, link_relation, link_created_by
	•	identity_entities
	•	id (PK), entity_type, display_name, alias_of? (FK self), embedding vector(384), timestamps
	•	identity_links
	•	id (PK), entity_type, a_id, b_id, relation, score?, created_by
	•	Unique: (entity_type, a_id, b_id, relation)
	•	identity_event_artists
	•	Composite PK: (event_entity_id, artist_entity_id)
	•	FK backfills added to Source
	•	source_artists.identity_entity_id (nullable)
	•	source_galleries.identity_entity_id (nullable)
	•	source_events.identity_entity_id (nullable)
	•	DB helpers
	•	match_identity_entities(t, vector, k) — cosine NN
	•	resolve_canonical(id) — follow alias_of to the winner
	•	identity_family(canon_id) — winner + all losers

Layer 3 — Golden (Best current view)
	•	golden_artists
	•	entity_id (PK → identity_entities.id), name, bio?, website?, socials[]
	•	golden_galleries
	•	entity_id (PK), name, website?, address?, description?
	•	golden_events
	•	entity_id (PK), title, description?, url?, start_ts?, end_ts?, venue_text?
	•	golden_event_artists
	•	Composite PK: (event_entity_id, artist_entity_id)

⸻

3) Layer Responsibilities & Interfaces (Deep Dive)

Layer 1 — Source Worker

Purpose
Convert page Markdown into typed source rows. Do not attempt cross‑site deduplication here.

Inputs
	•	HTTP: POST /ingest-md { url, markdown }
	•	Queue: SOURCE messages: { type: "source.extract", url }

Process
	1.	Upsert pages[url] with md (URL is PK).
	2.	Use AI (Zod) to extract:
	•	artists[] with { name, bio?, website?, socials[] }
	•	galleries[] with { name, website?, address?, description? }
	•	events[] with { title, description?, url?, start_ts?, end_ts?, venue_name?, participants[] }
	3.	Insert into source_* tables with per‑page uniqueness.
	4.	Optionally enqueue Identity messages (one per inserted row) if IDENTITY queue binding is present; otherwise expose POST /emit-identity in dev or keep standalone.

Outputs
	•	DB rows: source_artists, source_galleries, source_events
	•	Optional queue: IDENTITY messages:
	•	{ type: "identity.index.artist",  sourceArtistId }
	•	{ type: "identity.index.gallery", sourceGalleryId }
	•	{ type: "identity.index.event",   sourceEventId }

Idempotency
	•	Same page URL = safe upsert.
	•	Same (page_url, name/title) = insert‑ignore.

⸻

Layer 2 — Identity Worker

Purpose
Create one identity per real entity, compute embeddings, auto‑tag similar, record event→artist links, and enable human merges.

Inputs
	•	HTTP:
	•	POST /index — index a specific Source row by ID (dev or batch fixes)
	•	POST /merge — alias loser to winner (same), records identity_links with created_by='human'
	•	Queue:
	•	IDENTITY messages from Source

Process
	1.	Create identity (if missing) for the source row:
	•	Build an embedding text (e.g., for artist: name + bio + website + socials).
	•	INSERT INTO identity_entities (...) with entity_type, display_name, embedding.
	•	Write back source_*.identity_entity_id.
	2.	Suggest similar:
	•	NN search within same entity_type.
	•	If similarity ≥ threshold, insert identity_links(relation='similar', created_by='system').
	3.	Event participants → artist identities:
	•	For each participant name, find NN artist; if below threshold, create stub artist identity.
	•	Insert identity_event_artists(event_entity_id, artist_entity_id).
	4.	Merges (same):
	•	Curator calls /merge with (entity_type, winner_id, loser_id).
	•	DB sets alias_of on loser = winner; also records identity_links(..., 'same', 'human').
	•	Nothing moves; Golden resolves the canonical.

Outputs
	•	Updated identity_entities, identity_links, identity_event_artists
	•	Backfilled FKs on source_*
	•	Optional queue to Golden:
	•	{ type: "golden.materialize", entityType, entityId }

Idempotency
	•	identity_links unique key prevents duplicates.
	•	identity_event_artists composite PK prevents duplicate edges.

Thresholds (tuneable)
	•	Artists ~0.86; Galleries ~0.86; Events ~0.88.

⸻

Layer 3 — Golden Worker

Purpose
Produce canonical, enriched records ready for APIs/UI.

Inputs
	•	HTTP: POST /materialize { entityType, entityId }
	•	Queue: GOLDEN messages from Identity

Process (per identity)
	1.	Canonical: winner_id = resolve_canonical(entityId).
	2.	Family: identity_family(winner_id) → { winner } ∪ losers.
	3.	Aggregate: read all source_* rows linked to any family member.
	4.	Reduce:
	•	Most‑frequent: name, website, start_ts, url
	•	Longest: bio, description
	•	Set union: socials, participants
	5.	Write: upsert into golden_* by entity_id=winner_id.
	6.	Edges:
	•	Read identity_event_artists for winner_id.
	•	Canonicalize each artist_entity_id with resolve_canonical.
	•	Insert into golden_event_artists (composite PK).

Outputs
	•	golden_artists, golden_galleries, golden_events, golden_event_artists

Idempotency
	•	Upserts by entity_id; composite PK on edges.

⸻

4) Extraction Contract (Zod)

Shared across orchestrations; this is exactly what the AI returns for a page.
artists: Array<{
  name: string
  bio?: string
  website?: string // URL
  socials?: string[]
}>

galleries: Array<{
  name: string
  website?: string // URL
  address?: string
  description?: string
}>

events: Array<{
  title: string
  description?: string
  url?: string      // URL
  start_ts?: string // ISO 8601
  end_ts?: string   // ISO 8601
  venue_name?: string
  participants?: string[] // plain names; identity resolves to artist IDs
}>Run standalone or chained:
	1.	Coordinator (optional)
	•	POST /ingest-md { url, markdown }
	•	Upserts pages[url], enqueues SOURCE.
	2.	Source Worker
	•	Loads pages.md, extracts one event with participants=["Yoko Ono"].
	•	Inserts one row into source_events.
	•	Emits { type: "identity.index.event", sourceEventId }.
	3.	Identity Worker
	•	Creates an event identity with embedding, links source_events.identity_entity_id.
	•	Finds/creates an artist identity “Yoko Ono”.
	•	Inserts identity_event_artists(event_entity_id, artist_entity_id).
	•	Suggests similar to other near‑duplicate events (e.g. city listings).
	•	Emits { type: "golden.materialize", entityType: "event", entityId }.
	4.	Golden Worker
	•	Resolves the canonical event (winner).
	•	Aggregates all event source rows across winner + losers, reduces fields.
	•	Upserts one golden_events row and golden_event_artists edge(s).
	5.	Curator merges duplicates later
	•	UI calls POST /mark-same (Coordinator) → DB sets alias_of on loser and logs identity_links(..., 'same').
	•	Identity (or Coordinator) emits a Golden job for the winner → Golden re‑materializes (still one canonical event).

⸻

6) Ops Notes
	•	Run any Worker alone
	•	Use the HTTP endpoints: /ingest-md, /index, /materialize.
	•	Queues are optional while developing.
	•	Security
	•	Expose only Coordinator publicly; lock /mark-same with curator auth.
	•	Workers use Supabase service role server‑side only.
	•	Tuning & quality
	•	Start with simple thresholds; measure precision/recall for similar.
	•	Later, Golden reducers can incorporate trust (e.g., official domains).
	•	Re‑extraction
	•	Re‑POST the same URL to refresh its Markdown; Source re‑extracts and inserts new source rows (respecting per‑page uniqueness).

⸻

7) Quick Reference — Interfaces

Queues (when chaining)
	•	SOURCE: { type: "source.extract", url }
	•	IDENTITY:
	•	{ type: "identity.index.artist",  sourceArtistId }
	•	{ type: "identity.index.gallery", sourceGalleryId }
	•	{ type: "identity.index.event",   sourceEventId }
	•	GOLDEN: { type: "golden.materialize", entityType, entityId }

HTTP (to run each layer independently)
	•	Coordinator:
	•	POST /ingest-md { url, markdown }
	•	POST /mark-same { entity_type, winner_id, loser_id }
	•	Source Worker:
	•	POST /ingest-md { url, markdown } (dev shortcut; same as Coordinator if used alone)
	•	Identity Worker:
	•	POST /index { entity_type, source_id }
	•	POST /merge { entity_type, winner_id, loser_id }
	•	Golden Worker:
	•	POST /materialize { entityType, entityId }

⸻

8) Why This Layout Works
	•	Independent layers: Any Worker can be started, tested, and deployed on its own.
	•	Simple contracts: HTTP & Queue messages are tiny and explicit.
	•	Minimal state mutation: Merges set alias_of; no record moving; provenance intact.
	•	Scales to new sources: Source just adds evidence; Identity/Golden do the heavy lifting.
	•	Curator‑friendly: System proposes similar; humans mark same; Golden stays canonical automatically.