/**
 * Type exports for curator dashboard components
 */
import type { Database } from "@/types/database_types";

// Table row types
export type CrawlJob = Database["public"]["Tables"]["crawl_jobs"]["Row"];
export type ExtractedArtist =
  Database["public"]["Tables"]["extracted_artists"]["Row"];
export type ExtractedGallery =
  Database["public"]["Tables"]["extracted_galleries"]["Row"];
export type ExtractedEvent =
  Database["public"]["Tables"]["extracted_events"]["Row"];

// Union type for extracted entities
export type ExtractedEntity =
  | ExtractedArtist
  | ExtractedGallery
  | ExtractedEvent;

// Entity type enum
export type EntityType = "artist" | "gallery" | "event";

// Review status type
export type ReviewStatus = Database["public"]["Enums"]["review_status"];

// Crawl status type
export type CrawlStatus = Database["public"]["Enums"]["crawl_status"];

// Page with entity counts (for hierarchical view)
export interface PageWithCounts {
  url: string;
  extraction_status: Database["public"]["Enums"]["extraction_status"];
  fetched_at: string;
  entity_counts: {
    artists: number;
    galleries: number;
    events: number;
  };
}

// API response types
export interface CrawlJobsResponse {
  jobs: CrawlJob[];
}

export interface PagesResponse {
  pages: PageWithCounts[];
  total: number;
}

export interface PageEntitiesResponse {
  url: string;
  entities: {
    artists: ExtractedArtist[];
    galleries: ExtractedGallery[];
    events: ExtractedEvent[];
  };
}

export interface ExtractedEntitiesResponse {
  entities: ExtractedEntity[];
  total: number;
}

export interface BulkApproveByPageRequest {
  page_urls: string[];
  entity_types: EntityType[];
  trigger_similarity?: boolean;
  threshold?: number;
}

export interface BulkApproveResponse {
  approved: number;
  queued_for_similarity: number;
  entity_ids: Record<EntityType, string[]>;
}
