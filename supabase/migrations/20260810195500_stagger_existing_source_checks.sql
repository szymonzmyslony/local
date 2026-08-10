-- Avoid a one-time thundering herd after introducing per-source schedules.
-- Already-observed listings resume tomorrow; detail/profile sources resume on
-- their weekly cadence. Never-checked sources remain immediately eligible.
update public.gallery_sources
set next_check_at = now() + make_interval(hours => poll_interval_hours),
    updated_at = now()
where last_checked_at is not null
  and next_check_at <= now();
