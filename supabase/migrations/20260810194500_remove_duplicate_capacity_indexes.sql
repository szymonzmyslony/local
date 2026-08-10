-- Production already carried equivalent indexes under the established `idx_`
-- names. Keep those and remove only the redundant capacity-migration copies.
drop index if exists public.event_info_embedding_hnsw;
drop index if exists public.gallery_info_embedding_hnsw;
drop index if exists public.event_info_artists_gin_idx;
