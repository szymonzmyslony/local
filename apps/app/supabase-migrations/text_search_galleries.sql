-- Full text search for galleries by name and district filter
-- Returns complete gallery data except raw html

CREATE OR REPLACE FUNCTION text_search_galleries(
  search_query text DEFAULT NULL,
  filter_district text DEFAULT NULL,
  search_limit integer DEFAULT 10
)
RETURNS TABLE (
  id text,
  name text,
  about text,
  about_url text,
  address text,
  district text,
  email text,
  phone text,
  main_url text,
  normalized_main_url text,
  events_page text,
  instagram text,
  tags text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id::text,
    gi.name,
    gi.about,
    g.about_url,
    gi.address,
    gi.district::text,
    gi.email,
    gi.phone,
    g.main_url,
    g.normalized_main_url,
    g.events_page,
    gi.instagram,
    COALESCE(gi.tags, ARRAY[]::text[]) as tags
  FROM galleries g
  LEFT JOIN gallery_info gi ON gi.gallery_id = g.id
  WHERE
    -- Search by name if provided
    (
      search_query IS NULL OR search_query = ''
      OR to_tsvector('english', COALESCE(gi.name, '')) @@ websearch_to_tsquery('english', search_query)
    )
    AND
    -- Filter by district if provided
    (
      filter_district IS NULL OR filter_district = ''
      OR gi.district::text = filter_district
    )
  ORDER BY gi.name ASC NULLS LAST
  LIMIT search_limit;
END;
$$;
