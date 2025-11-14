-- Migration: Simplify Event Timing Schema
-- Drop event_occurrences table and add timezone to events
-- Safe to run - no data preservation needed (pre-production)

-- Step 1: Drop foreign key constraints and event_occurrences table
DROP TABLE IF EXISTS event_occurrences CASCADE;

-- Step 2: Modify events table
-- Add timezone column (most events will be in Warsaw)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Warsaw';

-- Make start_at required (was nullable before)
-- First set any null start_at to current timestamp
UPDATE events
SET start_at = created_at
WHERE start_at IS NULL;

-- Now make it NOT NULL
ALTER TABLE events
  ALTER COLUMN start_at SET NOT NULL;

-- Add comment explaining the schema
COMMENT ON COLUMN events.start_at IS 'Event start timestamp (required). Filter upcoming: start_at >= NOW()';
COMMENT ON COLUMN events.end_at IS 'Event end timestamp (nullable). If null, event is single-day starting at start_at';
COMMENT ON COLUMN events.timezone IS 'IANA timezone identifier, defaults to Europe/Warsaw';

-- Step 3: Create index for common queries
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_gallery_start ON events(gallery_id, start_at);
