-- Semantic search for events with date and artist filtering
-- Filters by start date and artists, then ranks by embedding similarity
-- Returns complete event data with linked gallery info

CREATE OR REPLACE FUNCTION search_events_filtered(
  query_embedding vector(1536),
  match_count integer DEFAULT 20,
  match_threshold float DEFAULT 0.3,
  filter_start_after timestamptz DEFAULT NULL,
  filter_artists text[] DEFAULT NULL
)
RETURNS TABLE (
  event_id text,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  status text,
  ticket_url text,
  artists text[],
  tags text[],
  images text[],
  gallery_id text,
  gallery_name text,
  gallery_main_url text,
  gallery_district text,
  gallery_address text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id::text as event_id,
    e.title,
    ei.description,
    e.start_at,
    e.end_at,
    e.timezone,
    e.status::text,
    e.ticket_url,
    COALESCE(ei.artists, ARRAY[]::text[]) as artists,
    COALESCE(ei.tags, ARRAY[]::text[]) as tags,
    COALESCE(ei.images, ARRAY[]::text[]) as images,
    g.id::text as gallery_id,
    gi.name as gallery_name,
    g.main_url as gallery_main_url,
    gi.district::text as gallery_district,
    gi.address as gallery_address
  FROM event_info ei
  JOIN events e ON e.id = ei.event_id
  LEFT JOIN galleries g ON g.id = e.gallery_id
  LEFT JOIN gallery_info gi ON gi.gallery_id = g.id
  WHERE
    -- Embedding must exist and meet threshold
    ei.embedding IS NOT NULL
    AND (1 - (ei.embedding <=> query_embedding)) >= match_threshold

    -- Date filter: events starting after specified date
    AND (
      filter_start_after IS NULL
      OR e.start_at > filter_start_after
    )

    -- Artist filter: match ANY artist in the array (overlap operator)
    AND (
      filter_artists IS NULL
      OR filter_artists = ARRAY[]::text[]
      OR ei.artists && filter_artists
    )

  -- Order by embedding similarity (closest first)
  ORDER BY ei.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_events_filtered IS 'Semantic search for events with date and artist filtering. Uses vector(1536) embeddings from OpenAI text-embedding-3-small.';
