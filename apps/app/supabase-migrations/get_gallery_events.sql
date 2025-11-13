-- Get events for a specific gallery by gallery_id
-- Returns complete event data with occurrences

CREATE OR REPLACE FUNCTION get_gallery_events(
  gallery_uuid uuid,
  event_limit integer DEFAULT 20
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
  WHERE e.gallery_id = gallery_uuid
  ORDER BY e.start_at DESC NULLS LAST
  LIMIT event_limit;
END;
$$;
