import { z } from "zod";
import { Constants } from "@shared";
import type { GalleryWithRelations } from "@shared";

const fetchStatusEnum = z.enum(Constants.public.Enums.fetch_status);
const pageKindEnum = z.enum(Constants.public.Enums.page_kind);
const parseStatusEnum = z.enum(Constants.public.Enums.parse_status);
const eventStatusEnum = z.enum(Constants.public.Enums.event_status);

const galleryInfoDetailSchema = z.object({
  name: z.string().nullable(),
  about: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  instagram: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  embedding: z.string().nullable(),
  embedding_model: z.string().nullable(),
  embedding_created_at: z.string().nullable(),
  // Required fields in GalleryInfo
  data: z.any(),
  gallery_id: z.string(),
  updated_at: z.string()
});

// Minimal hours schema used for gallery detail; accepts extra properties
const galleryHoursSchema = z
  .object({
    id: z.string(),
    gallery_id: z.string(),
    dow: z.number(),
    open_time: z.string(),
    close_time: z.string()
  })
  .catchall(z.unknown());

// Gallery detail corresponds to GalleryWithRelations from @shared
const galleryDetailSchema = z
  .object({
    id: z.string(),
    main_url: z.string(),
    about_url: z.string().nullable(),
    normalized_main_url: z.string(),
    events_page: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    gallery_info: galleryInfoDetailSchema.nullable(),
    gallery_hours: z.array(galleryHoursSchema)
  })
  .catchall(z.unknown());

const galleryInfoListSchema = z.object({
  name: z.string().nullable()
});

export const galleryListItemSchema = z.object({
  id: z.string(),
  main_url: z.string().url(),
  about_url: z.string().url().nullable(),
  normalized_main_url: z.string(),
  gallery_info: galleryInfoListSchema.nullable()
});




const pageContentSummarySchema = z
  .object({
    parsed_at: z.string().nullable(),
    markdown: z.string().nullable()
  })
  .nullable();

const pageStructuredSummarySchema = z
  .object({
    parse_status: parseStatusEnum,
    parsed_at: z.string().nullable(),
    extraction_error: z.string().nullable()
  })
  .nullable();

const updatePageKindPayloadSchema = z.object({
  updates: z
    .array(
      z.object({
        pageId: z.string().uuid(),
        kind: pageKindEnum
      })
    )
    .min(1)
});

const updatePageKindResponseSchema = z.object({
  updated: z.number()
});

const galleryPageSchema = z.object({
  id: z.string().uuid(),
  gallery_id: z.string().uuid().nullable(),
  url: z.string().nullable(),
  normalized_url: z.string(),
  kind: pageKindEnum,
  fetch_status: fetchStatusEnum,
  fetched_at: z.string().nullable(),
  http_status: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  page_content: pageContentSummarySchema,
  page_structured: pageStructuredSummarySchema
});

const pageContentDetailSchema = z.object({
  id: z.string().uuid(),
  url: z.string().nullable(),
  normalized_url: z.string(),
  kind: pageKindEnum,
  fetch_status: fetchStatusEnum,
  fetched_at: z.string().nullable(),
  page_content: z
    .object({
      markdown: z.string().nullable(),
      parsed_at: z.string().nullable()
    })
    .nullable()
});

const eventInfoSummarySchema = z
  .object({
    event_id: z.string(),
    description: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    artists: z.array(z.string()).nullable(),
    md: z.string().nullable(),
    embedding: z.string().nullable()
  })
  .catchall(z.unknown())
  .nullable();

const eventOccurrenceSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  start_at: z.string(),
  end_at: z.string().nullable(),
  timezone: z.string().nullable()
});

const galleryEventSchema = z.object({
  id: z.string().uuid(),
  gallery_id: z.string().uuid(),
  page_id: z.string().uuid().nullable(),
  title: z.string(),
  status: eventStatusEnum,
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  ticket_url: z.string().nullable(),
  event_info: eventInfoSummarySchema,
  event_occurrences: z.array(eventOccurrenceSchema)
});

const seedResponseSchema = z.object({
  id: z.string().uuid()
});

const runResponseSchema = z.object({
  id: z.string()
});

async function parseResponse<TSchema extends z.ZodTypeAny>(response: Response, schema: TSchema): Promise<z.infer<TSchema>> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  const body = await response.json();
  return schema.parse(body);
}

export const PAGE_KINDS = Constants.public.Enums.page_kind;
export const FETCH_STATUSES = Constants.public.Enums.fetch_status;
export const EVENT_STATUSES = Constants.public.Enums.event_status;

export type GalleryListItem = z.infer<typeof galleryListItemSchema>;
export type GalleryDetail = GalleryWithRelations;
export type GalleryPage = z.infer<typeof galleryPageSchema>;
export type GalleryEvent = z.infer<typeof galleryEventSchema>;
export type PageContentResponse = z.infer<typeof pageContentDetailSchema>;
export type PageKindUpdate = z.infer<typeof updatePageKindPayloadSchema>["updates"][number];
export type PageKind = z.infer<typeof pageKindEnum>;
export type FetchStatus = z.infer<typeof fetchStatusEnum>;
export type EventStatus = z.infer<typeof eventStatusEnum>;

export async function listGalleries(): Promise<GalleryListItem[]> {
  const response = await fetch("/api/galleries");
  return parseResponse(response, z.array(galleryListItemSchema));
}

export async function seedGallery(payload: { mainUrl: string; aboutUrl: string | null; eventsUrl: string | null }): Promise<string> {
  const response = await fetch("/api/galleries/seed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const { id } = await parseResponse(response, seedResponseSchema);
  return id;
}

export async function fetchGalleryDetail(galleryId: string): Promise<GalleryDetail> {
  const response = await fetch(`/api/galleries/${galleryId}`);
  return parseResponse(response, galleryDetailSchema);
}

export async function fetchGalleryPages(galleryId: string): Promise<GalleryPage[]> {
  const response = await fetch(`/api/galleries/${galleryId}/pages`);
  return parseResponse(response, z.array(galleryPageSchema));
}

export async function fetchGalleryEvents(galleryId: string): Promise<GalleryEvent[]> {
  const response = await fetch(`/api/galleries/${galleryId}/events`);
  return parseResponse(response, z.array(galleryEventSchema));
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
  | "scrapeAndExtract";

export async function discoverLinks(payload: { galleryId: string; listUrls: string[]; limit?: number }): Promise<string> {
  const response = await fetch("/api/links/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function scrapePages(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function extractPages(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function processEvents(pageIds: string[]): Promise<string> {
  return promotePagesToEvent(pageIds);
}

export async function promotePagesToEvent(pageIds: string[]): Promise<string> {
  const response = await fetch("/api/pages/promote-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageIds })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function embedEvents(eventIds: string[]): Promise<string> {
  const response = await fetch("/api/embed/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventIds })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function embedGallery(galleryId: string): Promise<string> {
  const response = await fetch("/api/embed/galleries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ galleryId })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function extractGalleryInfo(galleryId: string): Promise<string> {
  const response = await fetch("/api/galleries/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ galleryId })
  });
  const { id } = await parseResponse(response, runResponseSchema);
  return id;
}

export async function getPageContent(pageId: string): Promise<PageContentResponse> {
  const response = await fetch(`/api/page-content?pageId=${encodeURIComponent(pageId)}`);
  return parseResponse(response, pageContentDetailSchema);
}

export async function updatePageKinds(updates: PageKindUpdate[]): Promise<number> {
  updatePageKindPayloadSchema.parse({ updates });
  const response = await fetch("/api/pages/update-kind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updates })
  });
  const { updated } = await parseResponse(response, updatePageKindResponseSchema);
  return updated;
}
