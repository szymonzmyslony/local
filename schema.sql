-- D1 Database Schema for Gallery Agents

-- Galleries table
CREATE TABLE IF NOT EXISTS galleries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT NOT NULL,
    gallery_type TEXT CHECK(gallery_type IN ('commercial', 'non-profit', 'museum', 'artist-run', 'project-space')),
    city TEXT NOT NULL,
    neighborhood TEXT,
    tz TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Scraped pages table (simplified - for deduplication)
CREATE TABLE IF NOT EXISTS scraped_pages (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    gallery_id TEXT NOT NULL,
    markdown TEXT NOT NULL,
    metadata TEXT NOT NULL,        -- JSON: {title, description, image, language, statusCode}
    scraped_at INTEGER NOT NULL,
    FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
);

-- Artists table
CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    bio TEXT,
    website TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Events table with enum CHECK constraints
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('opening', 'reception', 'talk', 'workshop', 'exhibition')),
    category TEXT NOT NULL CHECK(category IN ('contemporary', 'modern', 'photography', 'design_architecture', 'digital_new_media', 'performance_live_art', 'social_critical_art', 'emerging_artists')),
    tags TEXT NOT NULL,            -- JSON array stored as text
    start TEXT NOT NULL,           -- ISO 8601 datetime
    end TEXT NOT NULL,             -- ISO 8601 datetime
    price REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
    UNIQUE(gallery_id, title, start) -- Prevent duplicate events
);

-- Event-Artist junction table (many-to-many)
CREATE TABLE IF NOT EXISTS event_artists (
    event_id TEXT NOT NULL,
    artist_id TEXT NOT NULL,
    PRIMARY KEY (event_id, artist_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scraped_pages_gallery_id ON scraped_pages(gallery_id);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_url ON scraped_pages(url);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_event_artists_artist_id ON event_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_events_gallery_id ON events(gallery_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
