-- Migration: Simplify architecture - extracted entities → clusters → golden
-- Date: 2025-10-28
-- Purpose: Drop identity layer, rename source_* to extracted_*, add clustering

-- ===================================================================
-- PART 1: Create new enums
-- ===================================================================

CREATE TYPE review_status AS ENUM (
  'pending_review',  -- Awaiting curator review
  'approved',        -- Approved for indexing
  'rejected',        -- Rejected/skip
  'modified'         -- Edited by curator
);

CREATE TYPE similarity_decision AS ENUM (
  'pending',    -- Needs curator review
  'merged',     -- Merged into cluster
  'dismissed'   -- Not duplicates
);

CREATE TYPE merge_type AS ENUM (
  'auto_similarity',  -- From auto-detected similarity
  'manual_cluster'    -- From manual clustering UI
);

-- ===================================================================
-- PART 2: Clean all data (fresh start)
-- ===================================================================

-- Truncate all tables (we don't care about existing data)
TRUNCATE TABLE golden_event_artists CASCADE;
TRUNCATE TABLE golden_artists CASCADE;
TRUNCATE TABLE golden_galleries CASCADE;
TRUNCATE TABLE golden_events CASCADE;
TRUNCATE TABLE source_artists CASCADE;
TRUNCATE TABLE source_galleries CASCADE;
TRUNCATE TABLE source_events CASCADE;
TRUNCATE TABLE pages CASCADE;
TRUNCATE TABLE discovered_urls CASCADE;
TRUNCATE TABLE crawl_jobs CASCADE;
TRUNCATE TABLE identity_event_artists CASCADE;
TRUNCATE TABLE identity_links CASCADE;
TRUNCATE TABLE identity_entities CASCADE;

-- ===================================================================
-- PART 3: Drop identity layer aggressively
-- ===================================================================

-- Drop all foreign key constraints first
ALTER TABLE golden_artists DROP CONSTRAINT IF EXISTS golden_artists_entity_id_fkey;
ALTER TABLE golden_galleries DROP CONSTRAINT IF EXISTS golden_galleries_entity_id_fkey;
ALTER TABLE golden_events DROP CONSTRAINT IF EXISTS golden_events_entity_id_fkey;
ALTER TABLE source_artists DROP CONSTRAINT IF EXISTS source_artists_identity_entity_id_fkey;
ALTER TABLE source_galleries DROP CONSTRAINT IF EXISTS source_galleries_identity_entity_id_fkey;
ALTER TABLE source_events DROP CONSTRAINT IF EXISTS source_events_identity_entity_id_fkey;

-- Drop identity tables
DROP TABLE IF EXISTS identity_event_artists CASCADE;
DROP TABLE IF EXISTS identity_links CASCADE;
DROP TABLE IF EXISTS identity_entities CASCADE;

-- Drop identity functions
DROP FUNCTION IF EXISTS identity_family(UUID);
DROP FUNCTION IF EXISTS resolve_canonical(UUID);
DROP FUNCTION IF EXISTS merge_identity_entities(entity_type, UUID, UUID);
DROP FUNCTION IF EXISTS match_identity_entities(entity_type, vector, integer);
DROP FUNCTION IF EXISTS get_entities_for_review(entity_type, float, float, integer);

-- Drop obsolete enums (will recreate curator_decision with better name)
DROP TYPE IF EXISTS link_created_by;
DROP TYPE IF EXISTS link_relation;
DROP TYPE IF EXISTS curator_decision;

-- ===================================================================
-- PART 4: Rename source_* tables to extracted_*
-- ===================================================================

ALTER TABLE source_artists RENAME TO extracted_artists;
ALTER TABLE source_galleries RENAME TO extracted_galleries;
ALTER TABLE source_events RENAME TO extracted_events;

-- Rename indexes and constraints
ALTER INDEX IF EXISTS source_artists_pkey RENAME TO extracted_artists_pkey;
ALTER INDEX IF EXISTS source_artists_page_url_name_key RENAME TO extracted_artists_page_url_name_key;
ALTER INDEX IF EXISTS source_galleries_pkey RENAME TO extracted_galleries_pkey;
ALTER INDEX IF EXISTS source_galleries_page_url_name_key RENAME TO extracted_galleries_page_url_name_key;
ALTER INDEX IF EXISTS source_events_pkey RENAME TO extracted_events_pkey;
ALTER INDEX IF EXISTS source_events_page_url_title_key RENAME TO extracted_events_page_url_title_key;

-- ===================================================================
-- PART 5: Add new columns to extracted_* tables
-- ===================================================================

-- Add to extracted_artists
ALTER TABLE extracted_artists
DROP COLUMN IF EXISTS identity_entity_id,
ADD COLUMN embedding vector(1536),
ADD COLUMN cluster_id UUID,
ADD COLUMN review_status review_status DEFAULT 'pending_review',
ADD COLUMN reviewed_by TEXT,
ADD COLUMN reviewed_at TIMESTAMPTZ;

-- Add to extracted_galleries
ALTER TABLE extracted_galleries
DROP COLUMN IF EXISTS identity_entity_id,
ADD COLUMN embedding vector(1536),
ADD COLUMN cluster_id UUID,
ADD COLUMN review_status review_status DEFAULT 'pending_review',
ADD COLUMN reviewed_by TEXT,
ADD COLUMN reviewed_at TIMESTAMPTZ;

-- Add to extracted_events
ALTER TABLE extracted_events
DROP COLUMN IF EXISTS identity_entity_id,
ADD COLUMN embedding vector(1536),
ADD COLUMN cluster_id UUID,
ADD COLUMN review_status review_status DEFAULT 'pending_review',
ADD COLUMN reviewed_by TEXT,
ADD COLUMN reviewed_at TIMESTAMPTZ;

-- Create indexes for extracted_* tables
CREATE INDEX idx_extracted_artists_review_status ON extracted_artists(review_status);
CREATE INDEX idx_extracted_artists_cluster ON extracted_artists(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_extracted_artists_embedding ON extracted_artists USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE INDEX idx_extracted_galleries_review_status ON extracted_galleries(review_status);
CREATE INDEX idx_extracted_galleries_cluster ON extracted_galleries(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_extracted_galleries_embedding ON extracted_galleries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE INDEX idx_extracted_events_review_status ON extracted_events(review_status);
CREATE INDEX idx_extracted_events_cluster ON extracted_events(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_extracted_events_embedding ON extracted_events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- ===================================================================
-- PART 6: Create extracted_*_links tables (similarity pairs)
-- ===================================================================

CREATE TABLE extracted_artist_links (
  source_a_id UUID NOT NULL REFERENCES extracted_artists(id) ON DELETE CASCADE,
  source_b_id UUID NOT NULL REFERENCES extracted_artists(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  curator_decision similarity_decision DEFAULT 'pending',
  curator_decided_at TIMESTAMPTZ,
  curator_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_a_id, source_b_id),
  CHECK (source_a_id < source_b_id) -- Prevent duplicate pairs
);

CREATE INDEX idx_extracted_artist_links_pending ON extracted_artist_links(similarity_score DESC)
  WHERE curator_decision = 'pending';

CREATE TABLE extracted_gallery_links (
  source_a_id UUID NOT NULL REFERENCES extracted_galleries(id) ON DELETE CASCADE,
  source_b_id UUID NOT NULL REFERENCES extracted_galleries(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  curator_decision similarity_decision DEFAULT 'pending',
  curator_decided_at TIMESTAMPTZ,
  curator_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_a_id, source_b_id),
  CHECK (source_a_id < source_b_id)
);

CREATE INDEX idx_extracted_gallery_links_pending ON extracted_gallery_links(similarity_score DESC)
  WHERE curator_decision = 'pending';

CREATE TABLE extracted_event_links (
  source_a_id UUID NOT NULL REFERENCES extracted_events(id) ON DELETE CASCADE,
  source_b_id UUID NOT NULL REFERENCES extracted_events(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  curator_decision similarity_decision DEFAULT 'pending',
  curator_decided_at TIMESTAMPTZ,
  curator_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_a_id, source_b_id),
  CHECK (source_a_id < source_b_id)
);

CREATE INDEX idx_extracted_event_links_pending ON extracted_event_links(similarity_score DESC)
  WHERE curator_decision = 'pending';

-- ===================================================================
-- PART 7: Update golden_* tables to use cluster_id
-- ===================================================================

-- STEP 1: Drop all foreign key constraints on golden_event_artists first
ALTER TABLE golden_event_artists DROP CONSTRAINT IF EXISTS golden_event_artists_artist_entity_id_fkey;
ALTER TABLE golden_event_artists DROP CONSTRAINT IF EXISTS golden_event_artists_event_entity_id_fkey;
ALTER TABLE golden_event_artists DROP CONSTRAINT IF EXISTS golden_event_artists_pkey;

-- STEP 2: Now we can safely drop primary keys and entity_id columns
-- golden_artists
ALTER TABLE golden_artists DROP CONSTRAINT IF EXISTS golden_artists_pkey CASCADE;
ALTER TABLE golden_artists DROP COLUMN IF EXISTS entity_id;
ALTER TABLE golden_artists ADD COLUMN cluster_id UUID PRIMARY KEY;

-- golden_galleries
ALTER TABLE golden_galleries DROP CONSTRAINT IF EXISTS golden_galleries_pkey CASCADE;
ALTER TABLE golden_galleries DROP COLUMN IF EXISTS entity_id;
ALTER TABLE golden_galleries ADD COLUMN cluster_id UUID PRIMARY KEY;

-- golden_events
ALTER TABLE golden_events DROP CONSTRAINT IF EXISTS golden_events_pkey CASCADE;
ALTER TABLE golden_events DROP COLUMN IF EXISTS entity_id;
ALTER TABLE golden_events ADD COLUMN cluster_id UUID PRIMARY KEY;

-- STEP 3: Rename golden_event_artists to cluster_event_participants
ALTER TABLE golden_event_artists RENAME TO cluster_event_participants;
ALTER TABLE cluster_event_participants RENAME COLUMN artist_entity_id TO artist_cluster_id;
ALTER TABLE cluster_event_participants RENAME COLUMN event_entity_id TO event_cluster_id;

-- STEP 4: Add new primary key and foreign keys
ALTER TABLE cluster_event_participants
  ADD CONSTRAINT cluster_event_participants_pkey PRIMARY KEY (event_cluster_id, artist_cluster_id),
  ADD CONSTRAINT cluster_event_participants_artist_fkey
    FOREIGN KEY (artist_cluster_id) REFERENCES golden_artists(cluster_id) ON DELETE CASCADE,
  ADD CONSTRAINT cluster_event_participants_event_fkey
    FOREIGN KEY (event_cluster_id) REFERENCES golden_events(cluster_id) ON DELETE CASCADE;

CREATE INDEX idx_cluster_event_participants_artist ON cluster_event_participants(artist_cluster_id);

-- ===================================================================
-- PART 8: Create merge history table
-- ===================================================================

CREATE TABLE merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL,
  entity_type entity_type NOT NULL,
  merged_source_ids UUID[] NOT NULL,
  merge_type merge_type NOT NULL,
  field_selections JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_merge_history_cluster ON merge_history(cluster_id);
CREATE INDEX idx_merge_history_type_created ON merge_history(entity_type, created_at DESC);

-- ===================================================================
-- PART 9: Create helper functions for new architecture
-- ===================================================================

-- Get artist similarity pairs for curator review
CREATE OR REPLACE FUNCTION get_artist_pairs_for_review(
  min_similarity FLOAT DEFAULT 0.85,
  max_similarity FLOAT DEFAULT 0.95,
  review_limit INT DEFAULT 50
)
RETURNS TABLE (
  source_a_id UUID,
  source_b_id UUID,
  similarity_score FLOAT,
  source_a_name TEXT,
  source_b_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    eal.source_a_id,
    eal.source_b_id,
    eal.similarity_score,
    ea1.name AS source_a_name,
    ea2.name AS source_b_name,
    eal.created_at
  FROM extracted_artist_links eal
  JOIN extracted_artists ea1 ON ea1.id = eal.source_a_id
  JOIN extracted_artists ea2 ON ea2.id = eal.source_b_id
  WHERE eal.curator_decision = 'pending'
    AND eal.similarity_score >= min_similarity
    AND eal.similarity_score <= max_similarity
  ORDER BY eal.similarity_score DESC
  LIMIT review_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Same for galleries
CREATE OR REPLACE FUNCTION get_gallery_pairs_for_review(
  min_similarity FLOAT DEFAULT 0.85,
  max_similarity FLOAT DEFAULT 0.95,
  review_limit INT DEFAULT 50
)
RETURNS TABLE (
  source_a_id UUID,
  source_b_id UUID,
  similarity_score FLOAT,
  source_a_name TEXT,
  source_b_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    egl.source_a_id,
    egl.source_b_id,
    egl.similarity_score,
    eg1.name AS source_a_name,
    eg2.name AS source_b_name,
    egl.created_at
  FROM extracted_gallery_links egl
  JOIN extracted_galleries eg1 ON eg1.id = egl.source_a_id
  JOIN extracted_galleries eg2 ON eg2.id = egl.source_b_id
  WHERE egl.curator_decision = 'pending'
    AND egl.similarity_score >= min_similarity
    AND egl.similarity_score <= max_similarity
  ORDER BY egl.similarity_score DESC
  LIMIT review_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Same for events
CREATE OR REPLACE FUNCTION get_event_pairs_for_review(
  min_similarity FLOAT DEFAULT 0.85,
  max_similarity FLOAT DEFAULT 0.95,
  review_limit INT DEFAULT 50
)
RETURNS TABLE (
  source_a_id UUID,
  source_b_id UUID,
  similarity_score FLOAT,
  source_a_title TEXT,
  source_b_title TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    eel.source_a_id,
    eel.source_b_id,
    eel.similarity_score,
    ee1.title AS source_a_title,
    ee2.title AS source_b_title,
    eel.created_at
  FROM extracted_event_links eel
  JOIN extracted_events ee1 ON ee1.id = eel.source_a_id
  JOIN extracted_events ee2 ON ee2.id = eel.source_b_id
  WHERE eel.curator_decision = 'pending'
    AND eel.similarity_score >= min_similarity
    AND eel.similarity_score <= max_similarity
  ORDER BY eel.similarity_score DESC
  LIMIT review_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Vector similarity search for extracted artists
CREATE OR REPLACE FUNCTION find_similar_artists(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ea.id,
    ea.name,
    1 - (ea.embedding <=> query_embedding) AS similarity
  FROM extracted_artists ea
  WHERE ea.embedding IS NOT NULL
    AND ea.cluster_id IS NULL -- Only match unclustered entities
    AND 1 - (ea.embedding <=> query_embedding) >= match_threshold
  ORDER BY ea.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Same for galleries
CREATE OR REPLACE FUNCTION find_similar_galleries(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    eg.id,
    eg.name,
    1 - (eg.embedding <=> query_embedding) AS similarity
  FROM extracted_galleries eg
  WHERE eg.embedding IS NOT NULL
    AND eg.cluster_id IS NULL
    AND 1 - (eg.embedding <=> query_embedding) >= match_threshold
  ORDER BY eg.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Same for events
CREATE OR REPLACE FUNCTION find_similar_events(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.88,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ee.id,
    ee.title,
    1 - (ee.embedding <=> query_embedding) AS similarity
  FROM extracted_events ee
  WHERE ee.embedding IS NOT NULL
    AND ee.cluster_id IS NULL
    AND 1 - (ee.embedding <=> query_embedding) >= match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ===================================================================
-- PART 10: Add comments for documentation
-- ===================================================================

COMMENT ON TYPE review_status IS 'Curator review status for extracted entities';
COMMENT ON TYPE similarity_decision IS 'Curator decision on whether entities are duplicates';
COMMENT ON TYPE merge_type IS 'How entities were merged (auto vs manual)';

COMMENT ON TABLE extracted_artists IS 'AI-extracted artist entities from pages (source of truth)';
COMMENT ON TABLE extracted_galleries IS 'AI-extracted gallery entities from pages (source of truth)';
COMMENT ON TABLE extracted_events IS 'AI-extracted event entities from pages (source of truth)';

COMMENT ON COLUMN extracted_artists.embedding IS 'OpenAI embedding vector (computed after approval)';
COMMENT ON COLUMN extracted_artists.cluster_id IS 'Groups merged entities into clusters';
COMMENT ON COLUMN extracted_artists.review_status IS 'Curator review status';

COMMENT ON TABLE extracted_artist_links IS 'Similarity relationships between extracted artists';
COMMENT ON TABLE merge_history IS 'Audit trail of entity clustering/merging';
COMMENT ON TABLE cluster_event_participants IS 'Artists participating in events (at cluster level)';

COMMENT ON TABLE golden_artists IS 'Final consolidated artist records (one per cluster)';
COMMENT ON TABLE golden_galleries IS 'Final consolidated gallery records (one per cluster)';
COMMENT ON TABLE golden_events IS 'Final consolidated event records (one per cluster)';

COMMENT ON COLUMN golden_artists.cluster_id IS 'Links to cluster of extracted entities';
