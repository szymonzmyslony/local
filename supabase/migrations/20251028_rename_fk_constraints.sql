-- Migration: Rename foreign key constraints from source_* to extracted_*
-- Date: 2025-10-28
-- Purpose: Cosmetic cleanup - rename FK constraints to match new table names

-- Rename FK constraint on extracted_artists
ALTER TABLE extracted_artists
  DROP CONSTRAINT IF EXISTS source_artists_page_url_fkey,
  ADD CONSTRAINT extracted_artists_page_url_fkey
    FOREIGN KEY (page_url) REFERENCES pages(url);

-- Rename FK constraint on extracted_galleries
ALTER TABLE extracted_galleries
  DROP CONSTRAINT IF EXISTS source_galleries_page_url_fkey,
  ADD CONSTRAINT extracted_galleries_page_url_fkey
    FOREIGN KEY (page_url) REFERENCES pages(url);

-- Rename FK constraint on extracted_events
ALTER TABLE extracted_events
  DROP CONSTRAINT IF EXISTS source_events_page_url_fkey,
  ADD CONSTRAINT extracted_events_page_url_fkey
    FOREIGN KEY (page_url) REFERENCES pages(url);

COMMENT ON CONSTRAINT extracted_artists_page_url_fkey ON extracted_artists IS 'Links extracted artist to source page';
COMMENT ON CONSTRAINT extracted_galleries_page_url_fkey ON extracted_galleries IS 'Links extracted gallery to source page';
COMMENT ON CONSTRAINT extracted_events_page_url_fkey ON extracted_events IS 'Links extracted event to source page';
