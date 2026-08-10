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
      'area', gi.area,
      'address', gi.address
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

revoke execute on function public.get_gallery_events(uuid, integer) from public;
grant execute on function public.get_gallery_events(uuid, integer)
  to anon, authenticated, service_role;
