import { z } from "zod";
import {
  Constants,
  getServiceClient,
  getGalleryWithInfo,
  getPageDetail,
  listRecentGalleries,
  selectEventIdsByPageIds,
  selectEventsByGallery,
  selectPagesWithRelations,
  updatePageById
} from "@shared";
import type {
  EventWithRelations,
  GalleryWithRelations,
  PageDetail,
  PageWithRelations
} from "@shared";

type PageStatus = {
  scrape: PageWithRelations["fetch_status"];
  extract: "idle" | "pending" | "ok" | "error";
  event: "missing" | "ready";
  event_id: string | null;
};

function withPageStatus(page: PageWithRelations, eventsByPageId: Map<string, string>) {
  const parseStatus = page.page_structured?.parse_status ?? "never";
  let extract: PageStatus["extract"];
  switch (parseStatus) {
    case "ok":
      extract = "ok";
      break;
    case "error":
      extract = "error";
      break;
    case "queued":
      extract = "pending";
      break;
    default:
      extract = page.fetch_status === "ok" ? "pending" : "idle";
      break;
  }

  const event_id = eventsByPageId.get(page.id) ?? null;
  const event: PageStatus["event"] = event_id ? "ready" : "missing";

  return {
    ...page,
    status: {
      scrape: page.fetch_status,
      extract,
      event,
      event_id
    } satisfies PageStatus
  };
}

const SeedGalleryBodySchema = z.object({
  mainUrl: z.string().trim().url(),
  aboutUrl: z.string().trim().url().nullable().optional(),
  eventsUrl: z.string().trim().url().nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  instagram: z.string().trim().min(1).nullable().optional(),
  openingHours: z.string().trim().min(1).nullable().optional()
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
export { ExtractEventPages } from "../workflows/extract_event_pages";
export { ExtractGallery } from "../workflows/extract_gallery";
export { Embed } from "../workflows/embeed";
export { PromotePages } from "../workflows/promote_pages";
export { ScrapeAndExtract } from "../workflows/scrape_and_extract";
export { SeedAndStartupGallery } from "../workflows/seedAndStartupGallery";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = getServiceClient(env);
    console.log(`[dash-worker] ${request.method} ${url.pathname}${url.search}`);

    // 0) Seed gallery (now uses full pipeline with SeedAndStartupGallery)
    if (request.method === "POST" && url.pathname === "/api/galleries/seed") {
      const body = SeedGalleryBodySchema.parse(await request.json());
      const mainUrl = body.mainUrl;
      const aboutUrl = body.aboutUrl ?? null;
      const eventsUrl = body.eventsUrl ?? null;
      const name = body.name ?? null;
      const address = body.address ?? null;
      const instagram = body.instagram ?? null;
      const openingHours = body.openingHours ?? null;
      console.log("[dash-worker] Starting SeedAndStartupGallery workflow (via seed endpoint)", { mainUrl, aboutUrl, eventsUrl, name, address, instagram, openingHours });
      const run = await env.SEED_AND_STARTUP_GALLERY.create({ params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram, openingHours } });
      const workflowId = run.id ?? run;

      return Response.json({ id: workflowId });
    }

    // 0b) Seed and startup gallery (full pipeline - explicit endpoint)
    if (request.method === "POST" && url.pathname === "/api/galleries/seed-and-startup") {
      const body = SeedGalleryBodySchema.parse(await request.json());
      const mainUrl = body.mainUrl;
      const aboutUrl = body.aboutUrl ?? null;
      const eventsUrl = body.eventsUrl ?? null;
      const name = body.name ?? null;
      const address = body.address ?? null;
      const instagram = body.instagram ?? null;
      const openingHours = body.openingHours ?? null;
      console.log("[dash-worker] Starting SeedAndStartupGallery workflow (explicit endpoint)", { mainUrl, aboutUrl, eventsUrl, name, address, instagram, openingHours });
      const run = await env.SEED_AND_STARTUP_GALLERY.create({ params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram, openingHours } });
      const workflowId = run.id ?? run;

      return Response.json({ id: workflowId });
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

    // Get gallery pages with related content
    if (request.method === "GET") {
      const pagesMatch = url.pathname.match(/^\/api\/galleries\/([^/]+)\/pages$/);
      if (pagesMatch) {
        const galleryId = pagesMatch[1];
        try {
          const pages = await selectPagesWithRelations(supabase, galleryId);
          const eventIds = await selectEventIdsByPageIds(
            supabase,
            pages.map(page => page.id)
          );
          const payload = pages.map(page => withPageStatus(page, eventIds));
          return Response.json(payload);
        } catch (error) {
          console.error(`[dash-worker] Failed loading pages for gallery ${galleryId}`, error);
          const message = error instanceof Error ? error.message : String(error);
          return new Response(message, { status: 500 });
        }
      }

      const eventsMatch = url.pathname.match(/^\/api\/galleries\/([^/]+)\/events$/);
      if (eventsMatch) {
        const galleryId = eventsMatch[1];
        try {
          const events = await selectEventsByGallery(supabase, galleryId);
          return Response.json(events satisfies EventWithRelations[]);
        } catch (error) {
          console.error(`[dash-worker] Failed loading events for gallery ${galleryId}`, error);
          const message = error instanceof Error ? error.message : String(error);
          return new Response(message, { status: 500 });
        }
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


    if (request.method === "POST" && url.pathname === "/api/pages/extract") {
      const body = PageIdsBodySchema.parse(await request.json());
      const run = await env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/process-events") {
      const body = PageIdsBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ScrapeAndExtract workflow via /process-events", {
        count: body.pageIds.length
      });
      const run = await env.SCRAPE_AND_EXTRACT.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/promote-event") {
      const body = PageIdsBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ScrapeAndExtract workflow via /promote-event", {
        count: body.pageIds.length
      });
      const run = await env.SCRAPE_AND_EXTRACT.create({ params: { pageIds: body.pageIds } });
      return Response.json({ id: run.id ?? run });
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
