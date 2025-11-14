-- Migration: Drop unused functions and fix get_gallery_events to work without event_occurrences
-- Keep: search_galleries_filtered, get_gallery_events
-- Drop: text_search_events, text_search_galleries, match_events, match_events_with_data, match_galeries, match_gallery_with_data

-- Drop unused event functions
DROP FUNCTION IF EXISTS text_search_events(text, integer);
DROP FUNCTION IF EXISTS match_events(integer, numeric, vector);
DROP FUNCTION IF EXISTS match_events(integer, numeric, text);
DROP FUNCTION IF EXISTS match_events_with_data(integer, numeric, vector);
DROP FUNCTION IF EXISTS match_events_with_data(integer, numeric, text);

-- Drop unused gallery functions
DROP FUNCTION IF EXISTS text_search_galleries(text, text, integer);
DROP FUNCTION IF EXISTS match_galeries(integer, numeric, vector);
DROP FUNCTION IF EXISTS match_galeries(integer, numeric, text);
DROP FUNCTION IF EXISTS match_gallery_with_data(integer, numeric, vector);
DROP FUNCTION IF EXISTS match_gallery_with_data(integer, numeric, text);

-- Drop event_occurrence composite type (no longer needed)
DROP TYPE IF EXISTS event_occurrence_result CASCADE;

-- Drop and recreate get_gallery_events without occurrences (return type changed)
DROP FUNCTION IF EXISTS get_gallery_events(uuid, integer);

-- Recreate get_gallery_events without occurrences
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
  timezone text,
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
    e.timezone,
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
  ORDER BY e.start_at ASC
  LIMIT event_limit;
END;
$$;

COMMENT ON FUNCTION get_gallery_events IS 'Get events for a specific gallery, ordered by start_at ascending';
