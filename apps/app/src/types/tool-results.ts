import type { Database } from "@shared";
import type { GallerySearchResult } from "../services/gallery-search";

/**
 * Gallery results for display
 */
export interface GalleryToolResult {
  type: "gallery-results";
  items: GallerySearchResult[];
}

/**
 * Event results (from get_gallery_events)
 */
export interface EventToolResult {
  type: "event-results";
  galleryId: string;
  events: Database["public"]["Functions"]["get_gallery_events"]["Returns"];
}

export type ToolResultPayload = GalleryToolResult | EventToolResult;
