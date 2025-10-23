/**
 * D1 Database row types
 * These match the exact column names returned by D1 queries
 */

export interface D1GalleryRow {
  id: string;
  name: string;
  website: string;
  gallery_type: string | null;
  city: string;
  neighborhood: string | null;
  tz: string;
  created_at: number;
  updated_at: number;
}

export interface D1ScrapedPageRow {
  id: string;
  url: string;
  gallery_id: string;
  markdown: string;
  metadata: string; // JSON string
  scraped_at: number;
}

export interface D1ArtistRow {
  id: string;
  name: string;
  bio: string | null;
  website: string | null;
  created_at: number;
  updated_at: number;
}

export interface D1EventRow {
  id: string;
  gallery_id: string;
  title: string;
  description: string;
  event_type: string;
  category: string;
  tags: string; // JSON string
  start: string;
  end: string;
  price: number;
  created_at: number;
  updated_at: number;
}

export interface D1EventArtistRow {
  event_id: string;
  artist_id: string;
}
