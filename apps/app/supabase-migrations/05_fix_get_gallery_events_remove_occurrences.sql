-- Fix get_gallery_events by removing event_occurrences reference
-- The event_occurrences table doesn't exist, causing the function to fail
-- Removes occurrences field from return type

DROP FUNCTION IF EXISTS get_gallery_events(uuid, integer);

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
  gallery jsonb
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
    ) as gallery
  FROM events e
  LEFT JOIN event_info ei ON ei.event_id = e.id
  LEFT JOIN galleries g ON g.id = e.gallery_id
  LEFT JOIN gallery_info gi ON gi.gallery_id = g.id
  WHERE e.gallery_id = gallery_uuid
    AND e.start_at > '2025-10-14T00:00:00Z'::timestamptz  -- Only future events
  ORDER BY e.start_at ASC NULLS LAST  -- Upcoming events first
  LIMIT event_limit;
END;
$$;

COMMENT ON FUNCTION get_gallery_events IS 'Get upcoming events for a specific gallery. Filters to only show events after 2025-10-14, ordered by start date (soonest first). Returns events without occurrences data.';
