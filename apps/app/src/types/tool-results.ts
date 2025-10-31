export type GalleryMatchItem = {
  id: string;
  name: string | null;
  about: string | null;
  mainUrl: string | null;
  normalizedMainUrl: string | null;
  eventsPage: string | null;
  similarity: number;
};

export type EventMatchItem = {
  id: string;
  title: string;
  status: string | null;
  startAt: string | null;
  endAt: string | null;
  description: string | null;
  occurrences: Array<{
    id: string;
    start_at: string | null;
    end_at: string | null;
    timezone: string | null;
  }>;
  gallery: {
    id: string;
    name: string | null;
    mainUrl: string | null;
    normalizedMainUrl: string | null;
  } | null;
  similarity: number;
};

export type GalleryToolResult = {
  type: "gallery-results";
  query: string;
  items: GalleryMatchItem[];
};

export type EventToolResult = {
  type: "event-results";
  query: string;
  items: EventMatchItem[];
};

export type ToolResultPayload = GalleryToolResult | EventToolResult;
