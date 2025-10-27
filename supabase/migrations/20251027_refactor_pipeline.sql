-- ============================================
-- Pipeline Refactor Migration
-- Adds crawl job tracking, URL discovery, and curator tools
-- ============================================

-- ============================================
-- NEW ENUMS
-- ============================================

CREATE TYPE crawl_status AS ENUM (
  'discovering',  -- Running Firecrawl /map
  'fetching',     -- Scraping discovered URLs
  'extracting',   -- AI extraction phase
  'complete',     -- Finished
  'failed'        -- Error
);

CREATE TYPE url_fetch_status AS ENUM (
  'pending',   -- Discovered, not yet fetched
  'fetching',  -- Currently scraping
  'fetched',   -- Content stored
  'failed'     -- Scrape failed
);

CREATE TYPE extraction_status AS ENUM (
  'pending',     -- Not yet extracted
  'processing',  -- AI extraction running
  'complete',    -- Done
  'failed'       -- Error
);

CREATE TYPE curator_decision AS ENUM (
  'pending',    -- Needs review
  'merged',     -- Curator merged
  'dismissed'   -- Not duplicate
);

-- ============================================
-- NEW TABLES
-- ============================================

-- Track Firecrawl /map operations
CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_url TEXT NOT NULL,
  max_pages INT DEFAULT 50,
  search_term TEXT,
  include_subdomains BOOLEAN DEFAULT FALSE,
  status crawl_status NOT NULL DEFAULT 'discovering',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  urls_discovered INT NOT NULL DEFAULT 0,
  urls_fetched INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

-- URLs discovered by Firecrawl /map
CREATE TABLE discovered_urls (
  url TEXT PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status url_fetch_status NOT NULL DEFAULT 'pending',
  fetch_attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_discovered_urls_job_status ON discovered_urls(job_id, status);
CREATE INDEX idx_discovered_urls_pending ON discovered_urls(status) WHERE status = 'pending';

-- ============================================
-- MODIFY EXISTING TABLES
-- ============================================

-- Add extraction tracking to pages
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS extraction_status extraction_status NOT NULL DEFAULT 'pending';

CREATE INDEX idx_pages_extraction_pending ON pages(extraction_status)
  WHERE extraction_status = 'pending';

-- Add materialization tracking to identity_entities
ALTER TABLE identity_entities
  ADD COLUMN IF NOT EXISTS last_materialized_at TIMESTAMPTZ;

CREATE INDEX idx_identity_entities_stale ON identity_entities(last_materialized_at NULLS FIRST);

-- Add curator fields to identity_links (reuse existing similarity tracking)
ALTER TABLE identity_links
  ADD COLUMN IF NOT EXISTS curator_decision curator_decision NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS curator_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS curator_notes TEXT;

CREATE INDEX idx_identity_links_curator_review ON identity_links(entity_type, curator_decision, score DESC)
  WHERE curator_decision = 'pending' AND relation = 'similar';

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_crawl_jobs_updated_at
  BEFORE UPDATE ON crawl_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Get crawl job progress
CREATE OR REPLACE FUNCTION get_crawl_progress(job_uuid UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'jobId', j.id,
    'seedUrl', j.seed_url,
    'status', j.status,
    'urlsDiscovered', j.urls_discovered,
    'urlsFetched', j.urls_fetched,
    'urlsPending', COUNT(*) FILTER (WHERE u.status = 'pending'),
    'urlsFailed', COUNT(*) FILTER (WHERE u.status = 'failed'),
    'createdAt', j.created_at,
    'updatedAt', j.updated_at
  )
  FROM crawl_jobs j
  LEFT JOIN discovered_urls u ON u.job_id = j.id
  WHERE j.id = job_uuid
  GROUP BY j.id;
$$ LANGUAGE sql STABLE;

-- Get entities needing curator review
CREATE OR REPLACE FUNCTION get_entities_for_review(
  filter_entity_type entity_type DEFAULT NULL,
  min_similarity FLOAT DEFAULT 0.85,
  max_similarity FLOAT DEFAULT 0.95,
  review_limit INT DEFAULT 50
)
RETURNS TABLE (
  link_id UUID,
  entity_a_id UUID,
  entity_b_id UUID,
  entity_type entity_type,
  similarity_score FLOAT,
  entity_a_name TEXT,
  entity_b_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    il.id AS link_id,
    il.a_id AS entity_a_id,
    il.b_id AS entity_b_id,
    il.entity_type,
    il.score AS similarity_score,
    ea.display_name AS entity_a_name,
    eb.display_name AS entity_b_name,
    il.created_at
  FROM identity_links il
  JOIN identity_entities ea ON ea.id = il.a_id
  JOIN identity_entities eb ON eb.id = il.b_id
  WHERE il.curator_decision = 'pending'
    AND il.relation = 'similar'
    AND il.score >= min_similarity
    AND il.score <= max_similarity
    AND (filter_entity_type IS NULL OR il.entity_type = filter_entity_type)
  ORDER BY il.score DESC
  LIMIT review_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE crawl_jobs IS 'Tracks Firecrawl /map operations and progress';
COMMENT ON TABLE discovered_urls IS 'URLs discovered by /map, queued for /scrape';
COMMENT ON COLUMN pages.extraction_status IS 'AI extraction progress for page content';
COMMENT ON COLUMN identity_entities.last_materialized_at IS 'Last golden materialization timestamp';
COMMENT ON COLUMN identity_links.curator_decision IS 'Curator review decision for similar entities';
COMMENT ON FUNCTION get_crawl_progress IS 'Real-time crawl job progress summary';
COMMENT ON FUNCTION get_entities_for_review IS 'Entity pairs needing curator review (similarity 0.85-0.95)';
