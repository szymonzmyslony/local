-- Apply every event constraint before vector ranking/limit. This prevents a
-- dense gallery or recurring event series from hiding valid area/date matches.
create or replace function public.search_events_for_market_v2(
  filter_market text,
  query_embedding vector,
  match_count integer,
  match_threshold double precision,
  filter_window_start timestamptz,
  filter_window_end timestamptz,
  filter_areas text[],
  filter_attendance text,
  filter_artists text[]
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
    e.source_url,
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
  where filter_market in ('ldn', 'waw')
    and filter_window_start < filter_window_end
    and filter_attendance in ('in_person', 'online', 'any')
    and g.market = filter_market
    and g.observation_status <> 'archived'
    and e.published
    and e.status not in ('cancelled', 'postponed')
    and ei.embedding is not null
    and coalesce(e.end_at, e.start_at) >= filter_window_start
    and e.start_at < filter_window_end
    and (
      cardinality(filter_areas) = 0
      or exists (
        select 1
        from unnest(filter_areas) as requested_area
        where lower(coalesce(gi.area, gi.district::text, ''))
          like '%' || lower(requested_area) || '%'
      )
    )
    and (
      cardinality(filter_artists) = 0
      or ei.artists && filter_artists
    )
    and (
      filter_attendance = 'any'
      or filter_attendance = 'online' and concat_ws(
        ' ', e.title, ei.description, array_to_string(ei.tags, ' ')
      ) ~* '\monline[- ]only\M|\monline (exhibition|event|screening|programme|program)\M'
      or filter_attendance = 'in_person' and concat_ws(
        ' ', e.title, ei.description, array_to_string(ei.tags, ' ')
      ) !~* '\monline[- ]only\M|\monline (exhibition|event|screening|programme|program)\M'
    )
    and (1 - (ei.embedding <=> query_embedding)) >= match_threshold
  order by ei.embedding <=> query_embedding asc, e.start_at asc
  limit greatest(1, least(match_count, 500));
$$;

create or replace function public.browse_events_for_market(
  filter_market text,
  match_count integer,
  filter_window_start timestamptz,
  filter_window_end timestamptz,
  filter_areas text[],
  filter_attendance text,
  filter_artists text[]
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
    e.source_url,
    coalesce(ei.artists, array[]::text[]),
    coalesce(ei.tags, array[]::text[]),
    coalesce(ei.images, array[]::text[]),
    g.id::text,
    gi.name,
    g.main_url,
    coalesce(gi.area, gi.district::text),
    gi.address
  from public.events e
  left join public.event_info ei on ei.event_id = e.id
  join public.galleries g on g.id = e.gallery_id
  left join public.gallery_info gi on gi.gallery_id = g.id
  where filter_market in ('ldn', 'waw')
    and filter_window_start < filter_window_end
    and filter_attendance in ('in_person', 'online', 'any')
    and g.market = filter_market
    and g.observation_status <> 'archived'
    and e.published
    and e.status not in ('cancelled', 'postponed')
    and coalesce(e.end_at, e.start_at) >= filter_window_start
    and e.start_at < filter_window_end
    and (
      cardinality(filter_areas) = 0
      or exists (
        select 1
        from unnest(filter_areas) as requested_area
        where lower(coalesce(gi.area, gi.district::text, ''))
          like '%' || lower(requested_area) || '%'
      )
    )
    and (
      cardinality(filter_artists) = 0
      or ei.artists && filter_artists
    )
    and (
      filter_attendance = 'any'
      or filter_attendance = 'online' and concat_ws(
        ' ', e.title, ei.description, array_to_string(ei.tags, ' ')
      ) ~* '\monline[- ]only\M|\monline (exhibition|event|screening|programme|program)\M'
      or filter_attendance = 'in_person' and concat_ws(
        ' ', e.title, ei.description, array_to_string(ei.tags, ' ')
      ) !~* '\monline[- ]only\M|\monline (exhibition|event|screening|programme|program)\M'
    )
  order by e.start_at asc, e.id asc
  limit greatest(1, least(match_count, 500));
$$;

revoke execute on function public.search_events_for_market_v2(
  text, vector, integer, double precision, timestamptz, timestamptz,
  text[], text, text[]
) from public;
revoke execute on function public.browse_events_for_market(
  text, integer, timestamptz, timestamptz, text[], text, text[]
) from public;

grant execute on function public.search_events_for_market_v2(
  text, vector, integer, double precision, timestamptz, timestamptz,
  text[], text, text[]
), public.browse_events_for_market(
  text, integer, timestamptz, timestamptz, text[], text, text[]
) to anon, authenticated, service_role;

create index if not exists event_info_embedding_hnsw
  on public.event_info using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
create index if not exists gallery_info_embedding_hnsw
  on public.gallery_info using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
create index if not exists events_published_window_idx
  on public.events (start_at, end_at, gallery_id)
  where published;
create index if not exists event_info_artists_gin_idx
  on public.event_info using gin (artists);

-- Source purpose determines polling cost. Listing pages are durable daily
-- roots; profile and detail pages are lower-frequency enrichment sources.
alter table public.gallery_sources
  add column if not exists purpose text not null default 'bootstrap',
  add column if not exists poll_interval_hours integer not null default 24,
  add column if not exists next_check_at timestamptz not null default now(),
  add column if not exists unchanged_checks integer not null default 0;

update public.gallery_sources
set purpose = case
    when kind = 'about' then 'profile'
    when kind = 'home' then 'bootstrap'
    when kind in ('events', 'calendar', 'feed') then 'listing'
    else 'detail'
  end,
  poll_interval_hours = case
    when kind in ('home', 'events', 'calendar', 'feed') then 24
    else 168
  end
where purpose = 'bootstrap';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gallery_sources'::regclass
      and conname = 'gallery_sources_purpose_check'
  ) then
    alter table public.gallery_sources
      add constraint gallery_sources_purpose_check
      check (purpose in ('bootstrap', 'profile', 'listing', 'detail'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gallery_sources'::regclass
      and conname = 'gallery_sources_poll_interval_check'
  ) then
    alter table public.gallery_sources
      add constraint gallery_sources_poll_interval_check
      check (poll_interval_hours between 1 and 720);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gallery_sources'::regclass
      and conname = 'gallery_sources_unchanged_checks_check'
  ) then
    alter table public.gallery_sources
      add constraint gallery_sources_unchanged_checks_check
      check (unchanged_checks >= 0);
  end if;
end
$$;

create index if not exists gallery_sources_due_idx
  on public.gallery_sources (gallery_id, next_check_at)
  where enabled;

create or replace function public.search_galleries_for_market_v2(
  filter_market text,
  query_embedding vector,
  match_count integer,
  match_threshold double precision,
  filter_areas text[],
  filter_weekday integer,
  filter_time_minutes integer
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
  where filter_market in ('ldn', 'waw')
    and filter_weekday between -1 and 6
    and filter_time_minutes between -1 and 1440
    and g.market = filter_market
    and g.observation_status <> 'archived'
    and gi.embedding is not null
    and (
      cardinality(filter_areas) = 0
      or exists (
        select 1 from unnest(filter_areas) as requested_area
        where lower(coalesce(gi.area, gi.district::text, ''))
          like '%' || lower(requested_area) || '%'
      )
    )
    and (
      filter_weekday = -1
      or exists (
        select 1
        from public.gallery_hours gh
        where gh.gallery_id = g.id
          and gh.weekday = filter_weekday
          and (
            filter_time_minutes = -1
            or exists (
              select 1 from jsonb_array_elements(gh.open_minutes) as range
              where filter_time_minutes >= (range->0)::integer
                and filter_time_minutes <= (range->1)::integer
            )
          )
      )
    )
    and (1 - (gi.embedding <=> query_embedding)) >= match_threshold
  order by gi.embedding <=> query_embedding asc, gi.name asc
  limit greatest(1, least(match_count, 1000));
$$;

create or replace function public.browse_galleries_for_market(
  filter_market text,
  match_count integer,
  filter_areas text[],
  filter_weekday integer,
  filter_time_minutes integer
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
  where filter_market in ('ldn', 'waw')
    and filter_weekday between -1 and 6
    and filter_time_minutes between -1 and 1440
    and g.market = filter_market
    and g.observation_status <> 'archived'
    and (
      cardinality(filter_areas) = 0
      or exists (
        select 1 from unnest(filter_areas) as requested_area
        where lower(coalesce(gi.area, gi.district::text, ''))
          like '%' || lower(requested_area) || '%'
      )
    )
    and (
      filter_weekday = -1
      or exists (
        select 1
        from public.gallery_hours gh
        where gh.gallery_id = g.id
          and gh.weekday = filter_weekday
          and (
            filter_time_minutes = -1
            or exists (
              select 1 from jsonb_array_elements(gh.open_minutes) as range
              where filter_time_minutes >= (range->0)::integer
                and filter_time_minutes <= (range->1)::integer
            )
          )
      )
    )
  order by gi.name asc nulls last, g.id asc
  limit greatest(1, least(match_count, 1000));
$$;

revoke execute on function public.search_galleries_for_market_v2(
  text, vector, integer, double precision, text[], integer, integer
) from public;
revoke execute on function public.browse_galleries_for_market(
  text, integer, text[], integer, integer
) from public;
grant execute on function public.search_galleries_for_market_v2(
  text, vector, integer, double precision, text[], integer, integer
), public.browse_galleries_for_market(
  text, integer, text[], integer, integer
) to anon, authenticated, service_role;
