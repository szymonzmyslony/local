import { Constants } from "@shared";
import type {
  Database,
  EventWithRelations,
  GalleryListItem,
  GalleryWithRelations,
  OpeningHoursItem,
  PageDetail,
  PageWithRelations
} from "@shared";

export type PageStatus = {
  scrape: Database["public"]["Enums"]["fetch_status"];
  extract: "idle" | "pending" | "ok" | "error";
  event: "missing" | "ready";
  event_id: string | null;
};

export type DashboardPage = PageWithRelations & {
  status: PageStatus;
};

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInfoRow = Database["public"]["Tables"]["event_info"]["Row"];
type EventOccurrenceRow = Database["public"]["Tables"]["event_occurrences"]["Row"];
type GalleryInfoRow = Database["public"]["Tables"]["gallery_info"]["Row"];

export type GalleryDetail = GalleryWithRelations;
export type GalleryPage = DashboardPage;
export type GalleryEvent = EventWithRelations;
export type PageContentResponse = PageDetail;

export type PageKind = Database["public"]["Enums"]["page_kind"];
export type FetchStatus = Database["public"]["Enums"]["fetch_status"];
export type EventStatus = Database["public"]["Enums"]["event_status"];

export const PAGE_KINDS = Constants.public.Enums.page_kind;
export const FETCH_STATUSES = Constants.public.Enums.fetch_status;
export const EVENT_STATUSES = Constants.public.Enums.event_status;

export type PageKindUpdate = {
  pageId: string;
  kind: PageKind;
};

export type GalleryInfoPayload = Pick<
  GalleryInfoRow,
  "name" | "about" | "address" | "email" | "phone" | "instagram" | "tags"
>;

export type GalleryHoursPayload = {
  hours: OpeningHoursItem[];
};

export type EventBasePayload = Pick<EventRow, "title" | "status" | "start_at" | "end_at" | "ticket_url">;
export type EventInfoPayload = Pick<EventInfoRow, "description" | "tags" | "artists">;
export type EventOccurrencePayload = Pick<EventOccurrenceRow, "id" | "start_at" | "end_at" | "timezone"> & {
  id?: string | null;
};

export type EventStructuredPayload = {
  event: EventBasePayload;
  info: EventInfoPayload;
  occurrences: EventOccurrencePayload[];
};

export type { GalleryListItem } from "@shared";

export type GallerySearchMatch = {
  id: string;
  name: string | null;
  about: string | null;
  similarity: number;
};

export type EventSearchMatch = {
  id: string;
  description: string | null;
  similarity: number;
};

export type EventListEntry = GalleryEvent & {
  gallery: {
    id: string;
    main_url: string | null;
    normalized_main_url: string | null;
    gallery_info?: { name: string | null } | null;
  } | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listGalleries(): Promise<GalleryListItem[]> {
  const response = await fetch("/api/galleries");
  return parseResponse<GalleryListItem[]>(response);
}

export async function seedGallery(payload: { mainUrl: string; aboutUrl: string | null; eventsUrl: string | null }): Promise<string> {
  const response = await fetch("/api/galleries/seed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function fetchGalleryDetail(galleryId: string): Promise<GalleryDetail> {
  const response = await fetch(`/api/galleries/${galleryId}`);
  return parseResponse<GalleryDetail>(response);
}

export async function fetchGalleryPages(galleryId: string): Promise<GalleryPage[]> {
  const response = await fetch(`/api/galleries/${galleryId}/pages`);
  return parseResponse<GalleryPage[]>(response);
}

export async function fetchGalleryEvents(galleryId: string): Promise<GalleryEvent[]> {
  const response = await fetch(`/api/galleries/${galleryId}/events`);
  return parseResponse<GalleryEvent[]>(response);
}

export type DashboardAction =
  | "refresh"
  | "discover"
  | "scrape"
  | "updateKinds"
  | "extract"
  | "process"
  | "embed"
  | "embedGallery"
  | "extractGallery"
  | "extractAndEmbedEvents"
  | "saveGalleryInfo"
  | "saveGalleryHours"
  | "saveEvent";

export async function discoverLinks(payload: { galleryId: string; listUrls: string[]; limit?: number }): Promise<string> {
  const response = await fetch("/api/links/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function scrapePages(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function extractPages(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function promotePagesToEvent(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/promote-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function embedEvents(eventIds: string[]): Promise<string> {
  const response = await fetch("/api/embed/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventIds })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function embedGallery(galleryId: string): Promise<string> {
  const response = await fetch("/api/embed/galleries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ galleryId })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function extractGalleryInfo(galleryId: string): Promise<string> {
  const response = await fetch("/api/galleries/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ galleryId })
  });
  const body = await parseResponse<{ id: string }>(response);
  return body.id;
}

export async function getPageContent(pageId: string): Promise<PageContentResponse> {
  const response = await fetch(`/api/page-content?pageId=${encodeURIComponent(pageId)}`);
  return parseResponse<PageContentResponse>(response);
}

export async function updatePageKinds(updates: PageKindUpdate[]): Promise<number> {
  if (!updates.length) {
    return 0;
  }
  const response = await fetch("/api/pages/update-kind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updates })
  });
  const body = await parseResponse<{ updated: number }>(response);
  return body.updated;
}

export async function updateGalleryInfo(galleryId: string, payload: GalleryInfoPayload): Promise<GalleryDetail> {
  const response = await fetch(`/api/galleries/${galleryId}/info`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse<GalleryDetail>(response);
}

export async function updateGalleryHours(galleryId: string, payload: GalleryHoursPayload): Promise<GalleryDetail> {
  const response = await fetch(`/api/galleries/${galleryId}/hours`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse<GalleryDetail>(response);
}

export async function saveEventStructured(eventId: string, payload: EventStructuredPayload): Promise<GalleryEvent> {
  const response = await fetch(`/api/events/${eventId}/structured`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse<GalleryEvent>(response);
}

export type EventsQueryParams = {
  statuses?: EventStatus[];
  galleryIds?: string[];
  upcoming?: boolean;
  limit?: number;
  order?: "asc" | "desc";
};

export async function listEventsAll(params: EventsQueryParams = {}): Promise<EventListEntry[]> {
  const searchParams = new URLSearchParams();

  params.statuses?.forEach(status => searchParams.append("status", status));
  params.galleryIds?.forEach(id => searchParams.append("galleryId", id));

  if (params.upcoming) {
    searchParams.set("upcoming", "true");
  }

  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  if (params.order) {
    searchParams.set("order", params.order);
  }

  const query = searchParams.toString();
  const response = await fetch(`/api/events${query ? `?${query}` : ""}`);
  return parseResponse<EventListEntry[]>(response);
}

type SearchOptions = {
  matchCount?: number;
  matchThreshold?: number;
};

export async function searchGalleries(query: string, options: SearchOptions = {}): Promise<GallerySearchMatch[]> {
  const response = await fetch("/api/search/galleries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      matchCount: options.matchCount,
      matchThreshold: options.matchThreshold
    })
  });
  return parseResponse<GallerySearchMatch[]>(response);
}

export async function searchEvents(query: string, options: SearchOptions = {}): Promise<EventSearchMatch[]> {
  const response = await fetch("/api/search/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      matchCount: options.matchCount,
      matchThreshold: options.matchThreshold
    })
  });
  return parseResponse<EventSearchMatch[]>(response);
}
