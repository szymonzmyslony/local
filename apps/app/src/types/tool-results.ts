
import type { Database } from "@shared";

export type GalleryMatchItem =
  Database["public"]["Functions"]["match_gallery_with_data"]["Returns"][number];

export type EventMatchItem =
  Database["public"]["Functions"]["match_events_with_data"]["Returns"][number];

export interface GalleryToolResult {
  type: "gallery-results";
  query: string;
  items: GalleryMatchItem[];
}

export interface EventToolResult {
  type: "event-results";
  query: string;
  items: EventMatchItem[];
}

export type ToolResultPayload = GalleryToolResult | EventToolResult;
