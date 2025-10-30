import { z } from "zod";
import {
  Constants,
  getServiceClient,
  getGalleryPipeline,
  getGalleryWithInfo,
  getPageDetail,
  listEvents,
  listPages,
  listRecentGalleries,
  updatePageById
} from "@shared";
import type {
  EventListItem,
  GalleryPipeline,
  GalleryWithRelations,
  PageDetail,
  PageListItem
} from "@shared";

const SeedGalleryBodySchema = z.object({
  mainUrl: z.string().trim().url(),
  aboutUrl: z.string().trim().url().nullable().optional(),
  eventsUrl: z.string().trim().url().nullable().optional()
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
      const eventsUrl = body.eventsUrl ?? null;
      console.log("[dash-worker] Starting SeedGallery workflow", { mainUrl, aboutUrl, eventsUrl });
      const run = await env.SEED_GALLERY.create({ params: { mainUrl, aboutUrl, eventsUrl } });
      const galleryId = run.id ?? run;

      return Response.json({ id: galleryId });
    }

    // List galleries
    if (request.method === "GET" && url.pathname === "/api/galleries") {
      try {
        const galleries = await listRecentGalleries(supabase);
        return Response.json(galleries);
      } catch (error) {
        console.error("[dash-worker] Failed listing galleries", error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    // Get gallery overview with info
    if (request.method === "GET" && url.pathname.match(/^\/api\/galleries\/[^/]+$/)) {
      const galleryId = url.pathname.split("/").pop();
      console.log(`[dash-worker] Fetching gallery ${galleryId}`);
      try {
        const gallery = galleryId ? await getGalleryWithInfo(supabase, galleryId) : null;
        if (!gallery) {
          return new Response("Not found", { status: 404 });
        }
        return Response.json(gallery satisfies GalleryWithRelations);
      } catch (error) {
        console.error(`[dash-worker] Failed loading gallery ${galleryId}`, error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    // Get full gallery pipeline (pages, structured data, events)
    if (request.method === "GET" && url.pathname.match(/^\/api\/galleries\/[^/]+\/pipeline$/)) {
      const [, , , galleryId] = url.pathname.split("/");
      if (!galleryId) {
        return new Response("Gallery id required", { status: 400 });
      }
      try {
        const pipeline = await getGalleryPipeline(supabase, galleryId);
        if (!pipeline) {
          return new Response("Not found", { status: 404 });
        }
        return Response.json(pipeline satisfies GalleryPipeline);
      } catch (error) {
        console.error(`[dash-worker] Failed loading pipeline for gallery ${galleryId}`, error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
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
      try {
        const pages = await listPages(supabase, { galleryId, kind: kindParam });
        return Response.json(pages satisfies PageListItem[]);
      } catch (error) {
        console.error(`[dash-worker] Failed listing pages galleryId=${galleryId} kind=${kindParam}`, error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/pages/update-kind") {
      const body = UpdatePageKindsBodySchema.parse(await request.json());
      const timestamp = new Date().toISOString();
      try {
        await Promise.all(
          body.updates.map(({ pageId, kind }) =>
            updatePageById(supabase, pageId, { kind, updated_at: timestamp })
          )
        );
        return Response.json({ updated: body.updates.length });
      } catch (error) {
        console.error("[dash-worker] Failed updating page kinds", error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/page-content") {
      const pageId = url.searchParams.get("pageId");
      if (!pageId) return new Response("pageId required", { status: 400 });
      console.log(`[dash-worker] Fetching page content for ${pageId}`);
      try {
        const page = await getPageDetail(supabase, pageId);
        if (!page) {
          return new Response("Not found", { status: 404 });
        }
        return Response.json(page satisfies PageDetail);
      } catch (error) {
        console.error(`[dash-worker] Failed fetching page content ${pageId}`, error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
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
      try {
        const events = await listEvents(supabase, galleryId);
        return Response.json(events satisfies EventListItem[]);
      } catch (error) {
        console.error(`[dash-worker] Failed listing events for gallery ${galleryId}`, error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/embed/events") {
      const body = EventIdsBodySchema.parse(await request.json());
      const run = await env.EMBEDDING.create({ params: { eventIds: body.eventIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/embed/galleries") {
      const { galleryId } = ExtractGalleryBodySchema.parse(await request.json());
      const run = await env.EMBEDDING.create({ params: { galleryIds: [galleryId] } });
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
