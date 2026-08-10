-- Secure the legacy catalogue and add the London observer control plane.
-- Existing Warsaw data is retained and labelled `waw`; new London data uses `ldn`.

alter table public.galleries
  add column if not exists market text not null default 'waw',
  add column if not exists city text not null default 'Warsaw',
  add column if not exists country_code text not null default 'PL',
  add column if not exists timezone text not null default 'Europe/Warsaw',
  add column if not exists observation_status text not null default 'paused',
  add column if not exists observation_interval_hours smallint not null default 24,
  add column if not exists last_observed_at timestamptz,
  add column if not exists next_observation_at timestamptz,
  add column if not exists source_config jsonb not null default '{}'::jsonb;

alter table public.gallery_info
  add column if not exists area text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.events
  add column if not exists source_url text,
  add column if not exists source_fingerprint text,
  add column if not exists confidence real,
  add column if not exists published boolean not null default true,
  alter column timezone set default 'Europe/London';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.galleries'::regclass
      and conname = 'galleries_market_check'
  ) then
    alter table public.galleries
      add constraint galleries_market_check check (market in ('waw', 'ldn'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.galleries'::regclass
      and conname = 'galleries_country_code_check'
  ) then
    alter table public.galleries
      add constraint galleries_country_code_check check (country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.galleries'::regclass
      and conname = 'galleries_observation_status_check'
  ) then
    alter table public.galleries
      add constraint galleries_observation_status_check
      check (observation_status in ('active', 'paused', 'failing', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.galleries'::regclass
      and conname = 'galleries_observation_interval_check'
  ) then
    alter table public.galleries
      add constraint galleries_observation_interval_check
      check (observation_interval_hours between 6 and 168);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_confidence_check'
  ) then
    alter table public.events
      add constraint events_confidence_check
      check (confidence is null or confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_gallery_source_fingerprint_key'
  ) then
    alter table public.events
      add constraint events_gallery_source_fingerprint_key
      unique (gallery_id, source_fingerprint);
  end if;
end
$$;

create table if not exists public.gallery_sources (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  kind text not null default 'events',
  fetch_strategy text not null default 'browser_markdown',
  enabled boolean not null default true,
  last_etag text,
  last_modified text,
  last_content_hash text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gallery_id, normalized_url),
  constraint gallery_sources_kind_check
    check (kind in ('home', 'about', 'events', 'calendar', 'feed', 'other')),
  constraint gallery_sources_fetch_strategy_check
    check (fetch_strategy in ('browser_markdown', 'http_html')),
  constraint gallery_sources_failures_check check (consecutive_failures >= 0)
);

create table if not exists public.observation_runs (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  status text not null default 'running',
  model text not null,
  workflow_id text,
  sources_attempted integer not null default 0,
  sources_changed integer not null default 0,
  candidates_found integer not null default 0,
  events_published integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint observation_runs_status_check
    check (status in ('running', 'unchanged', 'completed', 'partial', 'failed'))
);

create table if not exists public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.observation_runs(id) on delete cascade,
  source_id uuid references public.gallery_sources(id) on delete set null,
  source_url text not null,
  strategy text not null,
  r2_key text not null unique,
  content_hash text not null,
  content_type text,
  byte_length integer not null,
  http_status integer,
  changed boolean not null,
  browser_ms integer,
  fetched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint source_snapshots_byte_length_check check (byte_length >= 0)
);

create table if not exists public.event_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.observation_runs(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  source_url text not null,
  source_fingerprint text not null,
  payload jsonb not null,
  confidence real not null,
  decision text not null,
  rejection_reasons text[] not null default '{}'::text[],
  canonical_event_id uuid references public.events(id) on delete set null,
  observed_at timestamptz not null default now(),
  unique (run_id, source_fingerprint),
  constraint event_candidates_confidence_check check (confidence between 0 and 1),
  constraint event_candidates_decision_check
    check (decision in ('published', 'review', 'rejected'))
);

create table if not exists public.extraction_evaluations (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  source_url text not null,
  technique text not null,
  model text not null,
  success boolean not null,
  precision_score real,
  recall_score real,
  field_accuracy real,
  duration_ms integer not null,
  token_usage jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint extraction_evaluations_scores_check check (
    (precision_score is null or precision_score between 0 and 1)
    and (recall_score is null or recall_score between 0 and 1)
    and (field_accuracy is null or field_accuracy between 0 and 1)
  )
);

create index if not exists pages_gallery_id_idx
  on public.pages (gallery_id);
create index if not exists event_info_source_page_id_idx
  on public.event_info (source_page_id);
create index if not exists galleries_market_status_idx
  on public.galleries (market, observation_status);
create index if not exists galleries_next_observation_idx
  on public.galleries (next_observation_at)
  where observation_status = 'active';
create index if not exists gallery_sources_gallery_enabled_idx
  on public.gallery_sources (gallery_id, enabled);
create index if not exists observation_runs_gallery_started_idx
  on public.observation_runs (gallery_id, started_at desc);
create index if not exists source_snapshots_run_idx
  on public.source_snapshots (run_id);
create index if not exists event_candidates_gallery_observed_idx
  on public.event_candidates (gallery_id, observed_at desc);
create index if not exists extraction_evaluations_fixture_created_idx
  on public.extraction_evaluations (fixture_id, created_at desc);

-- The browser gets only the published catalogue. Raw pages, snapshots,
-- candidates, and the run ledger remain service-role only.
alter table public.galleries enable row level security;
alter table public.pages enable row level security;
alter table public.page_content enable row level security;
alter table public.page_structured enable row level security;
alter table public.gallery_info enable row level security;
alter table public.events enable row level security;
alter table public.event_info enable row level security;
alter table public.gallery_hours enable row level security;
alter table public.gallery_sources enable row level security;
alter table public.observation_runs enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.event_candidates enable row level security;
alter table public.extraction_evaluations enable row level security;

revoke all on table public.galleries, public.pages, public.page_content,
  public.page_structured, public.gallery_info, public.events, public.event_info,
  public.gallery_hours, public.gallery_sources, public.observation_runs,
  public.source_snapshots, public.event_candidates, public.extraction_evaluations
  from anon, authenticated;

grant select on table public.galleries, public.gallery_info,
  public.gallery_hours, public.events, public.event_info
  to anon, authenticated;

grant all on table public.galleries, public.pages, public.page_content,
  public.page_structured, public.gallery_info, public.events, public.event_info,
  public.gallery_hours, public.gallery_sources, public.observation_runs,
  public.source_snapshots, public.event_candidates, public.extraction_evaluations
  to service_role;

drop policy if exists catalogue_read_galleries on public.galleries;
create policy catalogue_read_galleries on public.galleries
  for select to anon, authenticated
  using (observation_status <> 'archived');

drop policy if exists catalogue_read_gallery_info on public.gallery_info;
create policy catalogue_read_gallery_info on public.gallery_info
  for select to anon, authenticated
  using (exists (
    select 1 from public.galleries g
    where g.id = gallery_info.gallery_id
      and g.observation_status <> 'archived'
  ));

drop policy if exists catalogue_read_gallery_hours on public.gallery_hours;
create policy catalogue_read_gallery_hours on public.gallery_hours
  for select to anon, authenticated
  using (exists (
    select 1 from public.galleries g
    where g.id = gallery_hours.gallery_id
      and g.observation_status <> 'archived'
  ));

drop policy if exists catalogue_read_events on public.events;
create policy catalogue_read_events on public.events
  for select to anon, authenticated using (published);

drop policy if exists catalogue_read_event_info on public.event_info;
create policy catalogue_read_event_info on public.event_info
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_info.event_id and e.published
  ));

-- Prevent object-shadowing attacks and pin every application function's path.
revoke create on schema public from public;
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.match_events(vector, double precision, integer)
  set search_path = public, extensions;
alter function public.match_galeries(vector, double precision, integer)
  set search_path = public, extensions;
alter function public.match_gallery_with_data(vector, integer, double precision)
  set search_path = public, extensions;
alter function public.search_events_filtered(vector, integer, double precision, timestamptz, text[])
  set search_path = public, extensions;
alter function public.search_galleries_filtered(vector, integer, double precision, text, integer, integer)
  set search_path = public, extensions;
alter function public.get_gallery_events(uuid, integer)
  set search_path = public, extensions;

create or replace function public.get_gallery_events(
  gallery_uuid uuid,
  event_limit integer default 20
)
returns table(
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
    e.status::text,
    e.ticket_url,
    coalesce(ei.artists, array[]::text[]),
    coalesce(ei.tags, array[]::text[]),
    coalesce(ei.images, array[]::text[]),
    jsonb_build_object(
      'id', g.id,
      'name', gi.name,
      'main_url', g.main_url,
      'normalized_main_url', g.normalized_main_url,
      'area', gi.area
    )
  from public.events e
  left join public.event_info ei on ei.event_id = e.id
  join public.galleries g on g.id = e.gallery_id
  left join public.gallery_info gi on gi.gallery_id = g.id
  where e.gallery_id = gallery_uuid
    and e.published
    and coalesce(e.end_at, e.start_at) >= now()
  order by e.start_at asc
  limit greatest(1, least(event_limit, 100));
$$;

create or replace function public.search_galleries_filtered(
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
  where g.market = 'ldn'
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

create or replace function public.search_events_filtered(
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
  where g.market = 'ldn'
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

revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.get_gallery_events(uuid, integer),
  public.match_events(vector, double precision, integer),
  public.match_galeries(vector, double precision, integer),
  public.match_gallery_with_data(vector, integer, double precision),
  public.search_events_filtered(vector, integer, double precision, timestamptz, text[]),
  public.search_galleries_filtered(vector, integer, double precision, text, integer, integer)
  to anon, authenticated, service_role;
