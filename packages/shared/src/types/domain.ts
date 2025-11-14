import type {
  Event,
  EventInfo,
  Gallery,
  GalleryHours,
  GalleryInfo,
  Page,
  PageContent,
  PageStructured
} from "./common";

export type GalleryListItem = Pick<Gallery, "id" | "main_url" | "about_url" | "normalized_main_url" | "events_page"> & {
  gallery_info: Pick<GalleryInfo, "name"> | null;
  gallery_hours: GalleryHours[];
};

export type PageListItem = Pick<Page, "id" | "url" | "normalized_url" | "kind" | "fetch_status">;

export type EventListItem = Pick<Event, "id" | "title" | "start_at" | "status" | "page_id">;

export type GalleryWithRelations = Gallery & {
  gallery_info: GalleryInfo | null;
  gallery_hours: GalleryHours[];
  events_page: string | null;
};

export type PageDetail = Page & {
  page_content: Pick<PageContent, "markdown" | "parsed_at"> | null;
  page_structured: Pick<PageStructured, "parse_status" | "parsed_at" | "extraction_error"> | null;
};

export type PageWithRelations = Page & {
  page_content: Pick<PageContent, "markdown" | "parsed_at"> | null;
  page_structured: Pick<PageStructured, "parse_status" | "parsed_at" | "extraction_error"> | null;
};

export type EventWithRelations = Event & {
  event_info: EventInfo | null;
};
