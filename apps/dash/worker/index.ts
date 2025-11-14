import { z } from "zod";
import {
  Constants,
  createEmbedder,
  getServiceClient,
  getGalleryWithInfo,
  getPageDetail,
  listRecentGalleries,
  getEventWithRelations,
  openingHoursItemSchema,
  replaceGalleryHours,
  saveEventInfo,
  saveGalleryInfo,
  selectEventIdsByPageIds,
  selectEventsByGallery,
  selectPagesWithRelations,
  toPgVector,
  updateEventFields,
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
  aboutUrl: z
    .string()
    .trim()
    .transform(val => (val === '-' || val === '' ? null : val))
    .pipe(z.string().url().nullable())
    .optional(),
  eventsUrl: z
    .string()
    .trim()
    .transform(val => (val === '-' || val === '' ? null : val))
    .pipe(z.string().url().nullable())
    .optional(),
  name: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  instagram: z.string().trim().min(1).nullable().optional(),
  googleMapsUrl: z
    .string()
    .trim()
    .transform(val => (val === '-' || val === '' ? null : val))
    .pipe(z.string().url().nullable())
    .optional(),
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

const GallerySearchBodySchema = z.object({
  query: z.string().trim().min(1).max(2000),
  matchCount: z.number().int().positive().max(100).optional(),
  matchThreshold: z.number().min(-1).max(1).optional()
});

const ExtractGalleryBodySchema = z.object({
  galleryId: z.string().uuid()
});

const eventStatusEnum = z.enum(Constants.public.Enums.event_status);
type EventStatusValue = z.infer<typeof eventStatusEnum>;

const EventSearchBodySchema = GallerySearchBodySchema;

const GalleryInfoPayloadSchema = z.object({
  name: z.string().nullable(),
  about: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  instagram: z.string().nullable(),
  tags: z.array(z.string()).nullable()
});

const GalleryHoursPayloadSchema = z.object({
  hours: z.array(openingHoursItemSchema)
});

const EventBasePayloadSchema = z.object({
  title: z.string().trim().min(1),
  status: eventStatusEnum,
  start_at: z.string(), // Required now
  end_at: z.string().nullable(),
  timezone: z.string().nullable().default('Europe/Warsaw'),
  ticket_url: z.string().trim().url().nullable()
});

const EventInfoPayloadSchema = z.object({
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  artists: z.array(z.string()).nullable()
});

const EventStructuredPayloadSchema = z.object({
  event: EventBasePayloadSchema,
  info: EventInfoPayloadSchema
});
// Re-export workflow entrypoints so the runtime can find them by class_name
export { DiscoverLinks } from "../workflows/discover_links";
export { ScrapePages } from "../workflows/scrape_pages";
export { ClassifyPage } from "../workflows/classify_page";
export { ExtractEventPages } from "../workflows/extract_event_pages";
export { ExtractAndEmbedEvents } from "../workflows/extract_and_embed_events";
export { ExtractGallery } from "../workflows/extract_gallery";
export { Embed } from "../workflows/embeed";
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
      const googleMapsUrl = body.googleMapsUrl ?? null;
      const openingHours = body.openingHours ?? null;
      console.log("[dash-worker] Starting SeedAndStartupGallery workflow (via seed endpoint)", { mainUrl, aboutUrl, eventsUrl, name, address, instagram, googleMapsUrl, openingHours });
      const run = await env.SEED_AND_STARTUP_GALLERY.create({ params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram, googleMapsUrl, openingHours } });
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
      const googleMapsUrl = body.googleMapsUrl ?? null;
      const openingHours = body.openingHours ?? null;
      console.log("[dash-worker] Starting SeedAndStartupGallery workflow (explicit endpoint)", { mainUrl, aboutUrl, eventsUrl, name, address, instagram, googleMapsUrl, openingHours });
      const run = await env.SEED_AND_STARTUP_GALLERY.create({ params: { mainUrl, aboutUrl, eventsUrl, name, address, instagram, googleMapsUrl, openingHours } });
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

    if (request.method === "POST" && url.pathname === "/api/search/galleries") {
      try {
        const body = GallerySearchBodySchema.parse(await request.json());
        if (!env.OPENAI_API_KEY) {
          throw new Error("Missing OPENAI_API_KEY");
        }
        const embed = createEmbedder(env.OPENAI_API_KEY);
        const vector = await embed(body.query);
        if (!vector.length) {
          return Response.json([]);
        }
        const { data, error } = await supabase.rpc("match_galeries", {
          match_count: body.matchCount ?? 10,
          match_threshold: body.matchThreshold ?? 0.7,
          query_embedding: toPgVector(vector)
        });
        if (error) {
          throw error;
        }
        return Response.json(data ?? []);
      } catch (error) {
        console.error("[dash-worker] Gallery search failed", error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/search/events") {
      try {
        const body = EventSearchBodySchema.parse(await request.json());
        if (!env.OPENAI_API_KEY) {
          throw new Error("Missing OPENAI_API_KEY");
        }
        const embed = createEmbedder(env.OPENAI_API_KEY);
        const vector = await embed(body.query);
        if (!vector.length) {
          return Response.json([]);
        }
        const { data, error } = await supabase.rpc("match_events", {
          match_count: body.matchCount ?? 10,
          match_threshold: body.matchThreshold ?? 0.7,
          query_embedding: toPgVector(vector)
        });
        if (error) {
          throw error;
        }
        return Response.json(data ?? []);
      } catch (error) {
        console.error("[dash-worker] Event search failed", error);
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      try {
        const statusFilters = url.searchParams.getAll("status");
        const galleryFilters = url.searchParams.getAll("galleryId");
        const upcoming = url.searchParams.get("upcoming") === "true";
        const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
        const limit = Number.isNaN(limitParam) ? 200 : Math.min(Math.max(limitParam, 1), 500);
        const orderParam = url.searchParams.get("order");
        const ascending = orderParam === "desc" ? false : true;

        let query = supabase
          .from("events")
          .select("*, event_info(*), gallery:galleries(id, main_url, normalized_main_url, gallery_info(name))")
          .order("start_at", { ascending })
          .limit(limit);

        if (statusFilters.length) {
          const validStatuses = statusFilters.filter((value): value is EventStatusValue =>
            eventStatusEnum.options.includes(value as EventStatusValue)
          );
          if (validStatuses.length) {
            query = query.in("status", validStatuses);
          }
        }

        if (galleryFilters.length) {
          query = query.in("gallery_id", galleryFilters);
        }

        if (upcoming) {
          query = query.gte("start_at", new Date().toISOString());
        }

        const { data, error } = await query;
        if (error) {
          throw error;
        }

        const payload = (data ?? []).map(event => ({
          ...event,
          event_info: event.event_info ?? null,
          gallery: event.gallery ?? null
        }));

        return Response.json(payload);
      } catch (error) {
        console.error("[dash-worker] Failed listing events", error);
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

    if (request.method === "PATCH") {
      const galleryInfoMatch = url.pathname.match(/^\/api\/galleries\/([^/]+)\/info$/);
      if (galleryInfoMatch) {
        const galleryId = galleryInfoMatch[1];
        try {
          const body = GalleryInfoPayloadSchema.parse(await request.json());
          await saveGalleryInfo(supabase, galleryId, body);
          const updated = await getGalleryWithInfo(supabase, galleryId);
          if (!updated) {
            return new Response("Not found", { status: 404 });
          }
          return Response.json(updated satisfies GalleryWithRelations);
        } catch (error) {
          console.error(`[dash-worker] Failed saving gallery info for ${galleryId}`, error);
          const message = error instanceof Error ? error.message : String(error);
          return new Response(message, { status: 500 });
        }
      }
    }

    if (request.method === "PUT") {
      const galleryHoursMatch = url.pathname.match(/^\/api\/galleries\/([^/]+)\/hours$/);
      if (galleryHoursMatch) {
        const galleryId = galleryHoursMatch[1];
        try {
          const body = GalleryHoursPayloadSchema.parse(await request.json());
          await replaceGalleryHours(supabase, galleryId, body.hours);
          const updated = await getGalleryWithInfo(supabase, galleryId);
          if (!updated) {
            return new Response("Not found", { status: 404 });
          }
          return Response.json(updated satisfies GalleryWithRelations);
        } catch (error) {
          console.error(`[dash-worker] Failed saving gallery hours for ${galleryId}`, error);
          const message = error instanceof Error ? error.message : String(error);
          return new Response(message, { status: 500 });
        }
      }

      const eventStructuredMatch = url.pathname.match(/^\/api\/events\/([^/]+)\/structured$/);
      if (eventStructuredMatch) {
        const eventId = eventStructuredMatch[1];
        try {
          const body = EventStructuredPayloadSchema.parse(await request.json());
          const timestamp = new Date().toISOString();
          // Update event fields including timing (now stored directly on events table)
          await updateEventFields(supabase, eventId, {
            ...body.event,
            updated_at: timestamp
          });
          await saveEventInfo(supabase, eventId, body.info);
          const updated = await getEventWithRelations(supabase, eventId);
          if (!updated) {
            return new Response("Not found", { status: 404 });
          }
          return Response.json(updated satisfies EventWithRelations);
        } catch (error) {
          console.error(`[dash-worker] Failed saving event structured data for ${eventId}`, error);
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

    if (request.method === "POST" && url.pathname === "/api/pages/promote-event") {
      const body = PageIdsBodySchema.parse(await request.json());
      console.log("[dash-worker] Starting ExtractAndEmbedEvents workflow via /promote-event", {
        count: body.pageIds.length
      });
      const run = await env.EXTRACT_AND_EMBED_EVENTS.create({ params: { pageIds: body.pageIds } });
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
