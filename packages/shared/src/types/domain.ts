import type {
  Event,
  EventInfo,
  EventOccurrence,
  Gallery,
  GalleryHours,
  GalleryInfo,
  Page,
  PageContent,
  PageStructured
} from "./common";

export type GalleryListItem = Pick<Gallery, "id" | "main_url" | "about_url" | "normalized_main_url"> & {
  gallery_info: Pick<GalleryInfo, "name"> | null;
};

export type PageListItem = Pick<Page, "id" | "url" | "normalized_url" | "kind" | "fetch_status">;

export type EventListItem = Pick<Event, "id" | "title" | "start_at" | "status" | "page_id">;

export type GalleryWithRelations = Gallery & {
  gallery_info: GalleryInfo | null;
  gallery_hours: GalleryHours[];
};

export type PageDetail = Page & {
  page_content: Pick<PageContent, "markdown" | "parsed_at"> | null;
  page_structured: Pick<PageStructured, "parse_status" | "parsed_at" | "extraction_error"> | null;
};

export type PipelinePage = Page & {
  page_content: Pick<PageContent, "markdown" | "parsed_at"> | null;
  page_structured: Pick<PageStructured, "parse_status" | "parsed_at" | "extraction_error"> | null;
};

export type PipelineEvent = Event & {
  event_info: EventInfo | null;
  event_occurrences: EventOccurrence[];
};

export interface GalleryPipeline {
  gallery: GalleryWithRelations;
  pages: PipelinePage[];
  events: PipelineEvent[];
}
