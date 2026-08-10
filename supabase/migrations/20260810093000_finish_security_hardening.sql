-- Explicit service policies make the private intent visible to the linter.
-- service_role also bypasses RLS, but no anon/authenticated policy is present.

create policy service_only_pages on public.pages
  for all to service_role using (true) with check (true);
create policy service_only_page_content on public.page_content
  for all to service_role using (true) with check (true);
create policy service_only_page_structured on public.page_structured
  for all to service_role using (true) with check (true);
create policy service_only_gallery_sources on public.gallery_sources
  for all to service_role using (true) with check (true);
create policy service_only_observation_runs on public.observation_runs
  for all to service_role using (true) with check (true);
create policy service_only_source_snapshots on public.source_snapshots
  for all to service_role using (true) with check (true);
create policy service_only_event_candidates on public.event_candidates
  for all to service_role using (true) with check (true);
create policy service_only_extraction_evaluations on public.extraction_evaluations
  for all to service_role using (true) with check (true);

create index if not exists source_snapshots_source_id_idx
  on public.source_snapshots (source_id);
create index if not exists event_candidates_canonical_event_id_idx
  on public.event_candidates (canonical_event_id);

create schema if not exists extensions;
alter extension vector set schema extensions;
alter extension btree_gist set schema extensions;
