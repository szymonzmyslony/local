-- The vector extension moved from public to extensions in the preceding
-- hardening migration. Tell PostgREST to rebuild cached column codecs so
-- writes target extensions.vector rather than the former public.vector name.
notify pgrst, 'reload schema';
