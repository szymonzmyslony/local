-- Migration: Fix embedding dimensions to 1536 (OpenAI text-embedding-3-small default)
-- Current: vector(384) in search_galleries_filtered
-- Target: vector(1536)

-- First, check the actual column dimensions
-- Run: SELECT column_name, udt_name, character_maximum_length
--      FROM information_schema.columns
--      WHERE table_name IN ('event_info', 'gallery_info') AND column_name = 'embedding';

-- If the columns are already vector(1536), we only need to update the function signature
-- If not, we need to:
-- 1. Drop existing embeddings (they're wrong dimension)
-- 2. Alter column types
-- 3. Update function

-- Step 1: Clear existing embeddings (they're wrong dimension if not 1536)
UPDATE event_info SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE gallery_info SET embedding = NULL WHERE embedding IS NOT NULL;

-- Step 2: Alter column types to vector(1536)
ALTER TABLE event_info
  ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);

ALTER TABLE gallery_info
  ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);

-- Step 3: Update search_galleries_filtered function signature
CREATE OR REPLACE FUNCTION search_galleries_filtered(
  query_embedding vector(1536),  -- Changed from vector(384)
  match_count integer DEFAULT 20,
  match_threshold float DEFAULT 0.3,  -- Lowered from 0.5 for more permissive results
  filter_district text DEFAULT NULL,
  filter_weekday integer DEFAULT NULL,
  filter_time_minutes integer DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  about text,
  district text,
  address text,
  tags text[],
  main_url text,
  about_url text,
  events_page text,
  instagram text,
  phone text,
  email text,
  google_maps_url text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id::text,
    gi.name,
    gi.about,
    gi.district::text,
    gi.address,
    COALESCE(gi.tags, ARRAY[]::text[]) as tags,
    g.main_url,
    g.about_url,
    g.events_page,
    gi.instagram,
    gi.phone,
    gi.email,
    gi.google_maps_url
  FROM gallery_info gi
  JOIN galleries g ON g.id = gi.gallery_id
  LEFT JOIN gallery_hours gh ON gh.gallery_id = g.id
    AND (filter_weekday IS NULL OR gh.weekday = filter_weekday)
  WHERE
    -- Embedding must exist and meet threshold
    gi.embedding IS NOT NULL
    AND (1 - (gi.embedding <=> query_embedding)) >= match_threshold

    -- District filter (if provided)
    AND (
      filter_district IS NULL OR filter_district = ''
      OR gi.district::text = filter_district
    )

    -- Hours filter (only apply if BOTH weekday AND time are specified)
    AND (
      filter_weekday IS NULL
      OR filter_time_minutes IS NULL
      OR (
        gh.weekday IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(gh.open_minutes::jsonb) AS range
          WHERE
            range->0 IS NOT NULL
            AND range->1 IS NOT NULL
            AND filter_time_minutes >= (range->0)::int
            AND filter_time_minutes <= (range->1)::int
        )
      )
    )

  -- Order by embedding similarity (closest first)
  ORDER BY gi.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_galleries_filtered IS 'Semantic search for galleries with district and hours filtering. Uses vector(1536) embeddings from OpenAI text-embedding-3-small';
