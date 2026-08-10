update public.events
set source_url = regexp_replace(
  source_url,
  '%20%22Open%20Homepage%22$',
  '',
  'i'
)
where source_url ~* '%20%22Open%20Homepage%22$';
