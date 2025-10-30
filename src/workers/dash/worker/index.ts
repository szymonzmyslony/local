import { z } from "zod";
import { getServiceClient } from "../../../shared/supabase";
import { Constants } from "../../../types/database_types";
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
} from "../../../types/common";

const SeedGalleryBodySchema = z.object({
  mainUrl: z.string().trim().url(),
  aboutUrl: z.string().trim().url().nullable().optional()
});

const DiscoverLinksBodySchema = z.object({
  galleryId: z.string().uuid(),
  listUrls: z.array(z.string().trim().url()).default([]),
  limit: z.number().int().positive().max(500).optional()
});

const PageIdsBodySchema = z.object({
  pageIds: z.array(z.string().uuid()).min(1)
});

const pageKindEnum = z.enum(Constants.public.Enums.page_kind);

const UpdatePageKindsBodySchema = z.object({
  updates: z
    .array(
      z.object({
        pageId: z.string().uuid(),
        kind: pageKindEnum
      })
    )
    .min(1)
});

const EventIdsBodySchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1)
});

const ExtractGalleryBodySchema = z.object({
  galleryId: z.string().uuid()
});

type GalleryWithRelations = Gallery & { gallery_info: GalleryInfo | null; gallery_hours: GalleryHours[] };

type PipelinePage = Page & {
  page_content: Pick<PageContent, "parsed_at"> | null;
  page_structured: Pick<PageStructured, "parse_status" | "parsed_at" | "extracted_page_kind" | "extraction_error"> | null;
};

type PipelineEvent = Event & {
  event_info: EventInfo | null;
  event_occurrences: EventOccurrence[];
};

type GalleryPipeline = {
  gallery: GalleryWithRelations;
  pages: PipelinePage[];
  events: PipelineEvent[];
};
// Re-export workflow entrypoints so the runtime can find them by class_name
export { SeedGallery } from "../workflows/seed_gallery";
export { DiscoverLinks } from "../workflows/discover_links";
export { ScrapePages } from "../workflows/scrape_pages";
export { ClassifyPages } from "../workflows/classify_pages";
export { ExtractEventPages } from "../workflows/extract_event_pages";
export { ProcessExtractedEvents } from "../workflows/process_extracted_events";
export { ExtractGallery } from "../workflows/extract_gallery";
export { Embed } from "../workflows/embeed";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = getServiceClient(env);
    console.log(`[dash-worker] ${request.method} ${url.pathname}${url.search}`);

    // 0) Seed gallery
    if (request.method === "POST" && url.pathname === "/api/galleries/seed") {
      const body = SeedGalleryBodySchema.parse(await request.json());
      const mainUrl = body.mainUrl;
      const aboutUrl = body.aboutUrl ?? null;
      console.log("[dash-worker] Starting SeedGallery workflow", { mainUrl, aboutUrl });
      const run = await env.SEED_GALLERY.create({ params: { mainUrl, aboutUrl } });
      const galleryId = run.id ?? run;

      return Response.json({ id: galleryId });
    }

    // List galleries
    if (request.method === "GET" && url.pathname === "/api/galleries") {
      const { data, error } = await supabase
        .from("galleries")
        .select("id, main_url, about_url, normalized_main_url, gallery_info(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error(`[dash-worker] Failed listing galleries`, error);
        return new Response(error.message, { status: 500 });
      }
      return Response.json(data ?? []);
    }

    // Get gallery overview with info
    if (request.method === "GET" && url.pathname.match(/^\/api\/galleries\/[^/]+$/)) {
      const galleryId = url.pathname.split("/").pop();
      console.log(`[dash-worker] Fetching gallery ${galleryId}`);
      const { data: gallery, error } = await supabase
        .from("galleries")
        .select("*, gallery_info(*)")
        .eq("id", galleryId!)
        .maybeSingle();
      if (error) {
        console.error(`[dash-worker] Failed loading gallery ${galleryId}`, error);
        return new Response(error.message, { status: 500 });
      }
      if (!gallery) {
        console.log(`[dash-worker] Gallery ${galleryId} not found`);
        return new Response("Not found", { status: 404 });
      }
      return Response.json(gallery);
    }

    // Get full gallery pipeline (pages, structured data, events)
    if (request.method === "GET" && url.pathname.match(/^\/api\/galleries\/[^/]+\/pipeline$/)) {
      const [, , , galleryId] = url.pathname.split("/");
      if (!galleryId) {
        return new Response("Gallery id required", { status: 400 });
      }

      const { data: gallery, error: galleryError } = await supabase
        .from("galleries")
        .select("*, gallery_info(*), gallery_hours(*)")
        .eq("id", galleryId)
        .maybeSingle();
      if (galleryError) {
        console.error(`[dash-worker] Failed loading gallery ${galleryId}`, galleryError);
        return new Response(galleryError.message, { status: 500 });
      }
      if (!gallery) {
        return new Response("Not found", { status: 404 });
      }

      const { data: pageRows, error: pagesError } = await supabase
        .from("pages")
        .select("id, gallery_id, url, normalized_url, kind, fetch_status, fetched_at, http_status, created_at, updated_at, page_content(markdown, parsed_at), page_structured(parse_status, parsed_at, extracted_page_kind, extraction_error)")
        .eq("gallery_id", galleryId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (pagesError) {
        console.error(`[dash-worker] Failed loading pages for gallery ${galleryId}`, pagesError);
        return new Response(pagesError.message, { status: 500 });
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from("events")
        .select("*, event_info(*), event_occurrences(*)")
        .eq("gallery_id", galleryId)
        .order("start_at", { ascending: true })
        .limit(200);
      if (eventsError) {
        console.error(`[dash-worker] Failed loading events for gallery ${galleryId}`, eventsError);
        return new Response(eventsError.message, { status: 500 });
      }

      const pages: PipelinePage[] = (pageRows ?? []).map((page): PipelinePage => ({
        ...page,
        page_content: page.page_content ?? null,
        page_structured: page.page_structured ?? null
      }));

      const events: PipelineEvent[] = (eventRows ?? []).map((event): PipelineEvent => ({
        ...event,
        event_info: event.event_info ?? null,
        event_occurrences: event.event_occurrences ?? []
      }));

      const pipeline: GalleryPipeline = {
        gallery: {
          ...gallery,
          gallery_hours: gallery.gallery_hours ?? []
        },
        pages,
        events
      };

      return Response.json(pipeline);
    }

    // 1) Discover links
    if (request.method === "POST" && url.pathname === "/api/links/discover") {
      const body = DiscoverLinksBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting DiscoverLinks workflow", body);
      const run = await env.DISCOVER_LINKS.create({ params: { galleryId: body.galleryId, listUrls: body.listUrls, limit: body.limit ?? 100 } });
      return Response.json({ id: run.id ?? run });
    }

    // 2) Pages
    if (request.method === "GET" && url.pathname === "/api/pages") {
      const galleryId = url.searchParams.get("galleryId");
      type PageKind = (typeof Constants.public.Enums.page_kind)[number];
      const kindParam = url.searchParams.get("kind") as PageKind | null;
      console.log(`[dash-worker] Listing pages galleryId=${galleryId ?? "any"} kind=${kindParam ?? "any"}`);
      let query = supabase
        .from("pages")
        .select("id, url, normalized_url, kind, fetch_status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (galleryId) query = query.eq("gallery_id", galleryId);
      if (kindParam) query = query.eq("kind", kindParam);
      const { data, error } = await query;
      if (error) {
        console.error(`[dash-worker] Failed listing pages galleryId=${galleryId} kind=${kindParam}`, error);
        return new Response(error.message, { status: 500 });
      }
      return Response.json(data ?? []);
    }

    if (request.method === "POST" && url.pathname === "/api/pages/update-kind") {
      const body = UpdatePageKindsBodySchema.parse(await request.json());
      const timestamp = new Date().toISOString();
      let updated = 0;

      for (const { pageId, kind } of body.updates) {
        const { error } = await supabase
          .from("pages")
          .update({ kind, updated_at: timestamp })
          .eq("id", pageId);
        if (error) {
          console.error(`[dash-worker] Failed updating page kind pageId=${pageId} kind=${kind}`, error);
          return new Response(error.message, { status: 500 });
        }
        updated += 1;
      }

      return Response.json({ updated });
    }

    if (request.method === "GET" && url.pathname === "/api/page-content") {
      const pageId = url.searchParams.get("pageId");
      if (!pageId) return new Response("pageId required", { status: 400 });
      console.log(`[dash-worker] Fetching page content for ${pageId}`);
      const { data, error } = await supabase
        .from("pages")
        .select("id, url, normalized_url, kind, fetch_status, fetched_at, page_content(markdown, parsed_at), page_structured(parse_status, parsed_at, extracted_page_kind, extraction_error)")
        .eq("id", pageId)
        .maybeSingle();
      if (error) {
        console.error(`[dash-worker] Failed fetching page content ${pageId}`, error);
        return new Response(error.message, { status: 500 });
      }
      if (!data) {
        console.log(`[dash-worker] Page ${pageId} not found`);
        return new Response("Not found", { status: 404 });
      }
      return Response.json(data);
    }

    if (request.method === "POST" && url.pathname === "/api/pages/scrape") {
      const body = PageIdsBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ScrapePages workflow", body);
      const run = await env.SCRAPE_PAGES.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/classify") {
      const body = PageIdsBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ClassifyPages workflow", body);
      const run = await env.CLASSIFY_PAGES.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/extract") {
      const body = PageIdsBodySchema.parse(await request.json());
      const run = await env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/process-events") {
      const body = PageIdsBodySchema.parse(await request.json());
      const run = await env.PROCESS_EXTRACTED_EVENTS.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    // 3) Events
    if (request.method === "GET" && url.pathname === "/api/events") {
      const galleryId = url.searchParams.get("galleryId");
      if (!galleryId) return new Response("galleryId required", { status: 400 });
      const { data, error } = await supabase.from("events").select("id, title, start_at, status, page_id").eq("gallery_id", galleryId).order("created_at", { ascending: false }).limit(200);
      if (error) {
        console.error(`[dash-worker] Failed listing events for gallery ${galleryId}`, error);
        return new Response(error.message, { status: 500 });
      }
      return Response.json(data ?? []);
    }

    if (request.method === "POST" && url.pathname === "/api/embed/events") {
      const body = EventIdsBodySchema.parse(await request.json());
      const run = await env.EMBEDDING.create({ params: { eventIds: body.eventIds } });
      return Response.json({ id: run.id ?? run });
    }

    // Extract gallery
    if (request.method === "POST" && url.pathname === "/api/galleries/extract") {
      const body = ExtractGalleryBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ExtractGallery workflow", body);
      const run = await env.EXTRACT_GALLERY.create({ params: { galleryId: body.galleryId } });
      return Response.json({ id: run.id ?? run });
    }

    console.log(`[dash-worker] No route matched ${request.method} ${url.pathname}`);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
