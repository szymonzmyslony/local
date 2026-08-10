-- PostgREST can retain the former public.vector codec after relocating the
-- extension. Keep vector parsing inside Postgres behind text-argument RPCs.

create or replace function public.upsert_observed_event_info(
  p_event_id uuid,
  p_description text,
  p_artists text[],
  p_tags text[],
  p_images text[],
  p_data jsonb,
  p_embedding text,
  p_embedding_model text,
  p_embedding_created_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.event_info (
    event_id,
    source_page_id,
    description,
    artists,
    tags,
    images,
    data,
    embedding,
    embedding_model,
    embedding_created_at
  ) values (
    p_event_id,
    null,
    p_description,
    p_artists,
    p_tags,
    p_images,
    coalesce(p_data, '{}'::jsonb),
    case when p_embedding is null then null else p_embedding::extensions.vector end,
    p_embedding_model,
    p_embedding_created_at
  )
  on conflict (event_id) do update set
    description = excluded.description,
    artists = excluded.artists,
    tags = excluded.tags,
    images = excluded.images,
    data = excluded.data,
    embedding = excluded.embedding,
    embedding_model = excluded.embedding_model,
    embedding_created_at = excluded.embedding_created_at;
$$;

create or replace function public.set_event_info_embedding(
  p_event_id uuid,
  p_embedding text,
  p_embedding_model text,
  p_embedding_created_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.event_info
  set embedding = p_embedding::extensions.vector,
      embedding_model = p_embedding_model,
      embedding_created_at = p_embedding_created_at
  where event_id = p_event_id;
$$;

create or replace function public.set_gallery_info_embedding(
  p_gallery_id uuid,
  p_embedding text,
  p_embedding_model text,
  p_embedding_created_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.gallery_info
  set embedding = p_embedding::extensions.vector,
      embedding_model = p_embedding_model,
      embedding_created_at = p_embedding_created_at
  where gallery_id = p_gallery_id;
$$;

revoke all on function public.upsert_observed_event_info(
  uuid, text, text[], text[], text[], jsonb, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.set_event_info_embedding(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.set_gallery_info_embedding(
  uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_observed_event_info(
  uuid, text, text[], text[], text[], jsonb, text, text, timestamptz
) to service_role;
grant execute on function public.set_event_info_embedding(
  uuid, text, text, timestamptz
) to service_role;
grant execute on function public.set_gallery_info_embedding(
  uuid, text, text, timestamptz
) to service_role;

notify pgrst, 'reload schema';
