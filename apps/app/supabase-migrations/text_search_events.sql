-- Full text search for events by title and artist names
-- Returns complete event data with occurrences and gallery info

CREATE OR REPLACE FUNCTION text_search_events(
  search_query text DEFAULT NULL,
  search_limit integer DEFAULT 10
)
RETURNS TABLE (
  event_id text,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  ticket_url text,
  artists text[],
  tags text[],
  images text[],
  gallery jsonb,
  occurrences jsonb
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
    e.status::text,
    e.ticket_url,
    COALESCE(ei.artists, ARRAY[]::text[]) as artists,
    COALESCE(ei.tags, ARRAY[]::text[]) as tags,
    COALESCE(ei.images, ARRAY[]::text[]) as images,
    jsonb_build_object(
      'id', g.id,
      'name', gi.name,
      'main_url', g.main_url,
      'normalized_main_url', g.normalized_main_url
    ) as gallery,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', eo.id,
          'start_at', eo.start_at,
          'end_at', eo.end_at,
          'timezone', eo.timezone
        )
      )
      FROM event_occurrences eo
      WHERE eo.event_id = e.id
    ) as occurrences
  FROM events e
  LEFT JOIN event_info ei ON ei.event_id = e.id
  LEFT JOIN galleries g ON g.id = e.gallery_id
  LEFT JOIN gallery_info gi ON gi.gallery_id = g.id
  WHERE
    CASE
      -- If search_query is provided, search in title and artists
      WHEN search_query IS NOT NULL AND search_query != '' THEN
        (
          -- Search in event title using websearch_to_tsquery
          to_tsvector('english', e.title) @@ websearch_to_tsquery('english', search_query)
          OR
          -- Search in artist names (array elements)
          EXISTS (
            SELECT 1
            FROM unnest(COALESCE(ei.artists, ARRAY[]::text[])) AS artist
            WHERE to_tsvector('english', artist) @@ websearch_to_tsquery('english', search_query)
          )
        )
      -- If no search query, return all events
      ELSE TRUE
    END
  ORDER BY e.start_at DESC NULLS LAST
  LIMIT search_limit;
END;
$$;
