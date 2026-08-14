import type { EventResultDisplay } from "../services/event-series";
import type { GallerySearchResult } from "../services/gallery-search";
import type { EventCardData } from "./chat-state";

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
export type EventToolResult =
  | {
      type: "event-results";
      source: "gallery";
      galleryId: string;
      display: EventResultDisplay;
      events: EventCardData[];
    }
  | {
      type: "event-results";
      source: "search";
      display: EventResultDisplay;
      events: EventCardData[];
    };

export type ToolResultPayload = GalleryToolResult | EventToolResult;
