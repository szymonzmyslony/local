create or replace function public.get_gallery_events_for_market(
  gallery_uuid uuid,
  filter_market text,
  event_limit integer default 20
)
returns table(
  event_id text,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  status text,
  ticket_url text,
  source_url text,
  artists text[],
  tags text[],
  images text[],
  gallery jsonb
)
language sql
stable
set search_path = public, extensions
as $$
  select
    e.id::text,
    e.title,
    ei.description,
    e.start_at,
    e.end_at,
    e.timezone,
    e.status::text,
    e.ticket_url,
    e.source_url,
    coalesce(ei.artists, array[]::text[]),
    coalesce(ei.tags, array[]::text[]),
    coalesce(ei.images, array[]::text[]),
    jsonb_build_object(
      'id', g.id,
      'name', gi.name,
      'main_url', g.main_url,
      'normalized_main_url', g.normalized_main_url,
      'area', coalesce(gi.area, gi.district::text),
      'address', gi.address
    )
  from public.events e
  left join public.event_info ei on ei.event_id = e.id
  join public.galleries g on g.id = e.gallery_id
  left join public.gallery_info gi on gi.gallery_id = g.id
  where e.gallery_id = gallery_uuid
    and g.market = filter_market
    and filter_market in ('ldn', 'waw')
    and e.published
    and coalesce(e.end_at, e.start_at) >= now()
  order by e.start_at asc
  limit greatest(1, least(event_limit, 100));
$$;

create or replace function public.search_galleries_for_market(
  filter_market text,
  query_embedding vector,
  match_count integer default 20,
  match_threshold double precision default 0.3,
  filter_district text default null,
  filter_weekday integer default null,
  filter_time_minutes integer default null
)
returns table(
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
language sql
stable
set search_path = public, extensions
as $$
  select
    g.id::text,
    gi.name,
    gi.about,
    coalesce(gi.area, gi.district::text),
    gi.address,
    coalesce(gi.tags, array[]::text[]),
    g.main_url,
    g.about_url,
    g.events_page,
    gi.instagram,
    gi.phone,
    gi.email,
    gi.google_maps_url
  from public.gallery_info gi
  join public.galleries g on g.id = gi.gallery_id
  left join public.gallery_hours gh
    on gh.gallery_id = g.id
    and (filter_weekday is null or gh.weekday = filter_weekday)
  where g.market = filter_market
    and filter_market in ('ldn', 'waw')
    and g.observation_status <> 'archived'
    and gi.embedding is not null
    and (1 - (gi.embedding <=> query_embedding)) >= match_threshold
    and (
      filter_district is null
      or filter_district = ''
      or coalesce(gi.area, gi.district::text) ilike '%' || filter_district || '%'
    )
    and (
      filter_weekday is null
      or filter_time_minutes is null
      or exists (
        select 1
        from jsonb_array_elements(gh.open_minutes) as range
        where range->0 is not null
          and range->1 is not null
          and filter_time_minutes >= (range->0)::integer
          and filter_time_minutes <= (range->1)::integer
      )
    )
  order by gi.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 100));
$$;

create or replace function public.search_events_for_market(
  filter_market text,
  query_embedding vector,
  match_count integer default 20,
  match_threshold double precision default 0.3,
  filter_start_after timestamptz default null,
  filter_artists text[] default null
)
returns table(
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
language sql
stable
set search_path = public, extensions
as $$
  select
    e.id::text,
    e.title,
    ei.description,
    e.start_at,
    e.end_at,
    e.timezone,
    e.status::text,
    e.ticket_url,
    coalesce(ei.artists, array[]::text[]),
    coalesce(ei.tags, array[]::text[]),
    coalesce(ei.images, array[]::text[]),
    g.id::text,
    gi.name,
    g.main_url,
    coalesce(gi.area, gi.district::text),
    gi.address
  from public.event_info ei
  join public.events e on e.id = ei.event_id
  join public.galleries g on g.id = e.gallery_id
  left join public.gallery_info gi on gi.gallery_id = g.id
  where g.market = filter_market
    and filter_market in ('ldn', 'waw')
    and e.published
    and ei.embedding is not null
    and (1 - (ei.embedding <=> query_embedding)) >= match_threshold
    and (filter_start_after is null or coalesce(e.end_at, e.start_at) > filter_start_after)
    and (
      filter_artists is null
      or filter_artists = array[]::text[]
      or ei.artists && filter_artists
    )
  order by ei.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 100));
$$;

revoke execute on function public.get_gallery_events_for_market(uuid, text, integer)
  from public;
revoke execute on function public.search_galleries_for_market(
  text, vector, integer, double precision, text, integer, integer
) from public;
revoke execute on function public.search_events_for_market(
  text, vector, integer, double precision, timestamptz, text[]
) from public;

grant execute on function public.get_gallery_events_for_market(uuid, text, integer),
  public.search_galleries_for_market(
    text, vector, integer, double precision, text, integer, integer
  ),
  public.search_events_for_market(
    text, vector, integer, double precision, timestamptz, text[]
  )
  to anon, authenticated, service_role;
