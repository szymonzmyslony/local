import { getServiceClient } from "../../../shared/supabase";
import { normalizeUrl } from "../src/utils/normalizeUrl";
import { Constants } from "../../../types/database_types";
// Re-export workflow entrypoints so the runtime can find them by class_name
export { SeedGallery } from "../workflows/seed_gallery";
export { DiscoverLinks } from "../workflows/discover_links";
export { ScrapePages } from "../workflows/scrape_pages";
export { ExtractEventPages } from "../workflows/extract_event_pages";
export { ProcessExtractedEvents } from "../workflows/process_extracted_events";
export { ExtractGallery } from "../workflows/extract_gallery";
export { Embed } from "../workflows/embeed";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = getServiceClient(env);
    console.log(`[dash-worker] ${request.method} ${url.pathname}${url.search}`);

    async function json() {
      try {
        return await request.json();
      } catch {
        return {} as any;
      }
    }

    // 0) Seed gallery
    if (request.method === "POST" && url.pathname === "/api/galleries/seed") {
      const body = await json();
      console.log("[dash-worker] Starting SeedGallery workflow", body);
      const { mainUrl, aboutUrl = null, autoScrape = true } = body as { mainUrl: string; aboutUrl?: string | null; autoScrape?: boolean };
      const run = await env.SEED_GALLERY.create({ params: { mainUrl, aboutUrl } });
      const galleryId = run.id ?? run;

      if (autoScrape !== false) {
        const normalizedMain = normalizeUrl(mainUrl);
        const { data: page } = await supabase
          .from("pages")
          .select("id")
          .eq("normalized_url", normalizedMain)
          .limit(1)
          .maybeSingle();
        if (page?.id) {
          console.log(`[dash-worker] Auto-scraping main page ${page.id}`);
          await env.SCRAPE_PAGES.create({ params: { pageIds: [page.id] } });
        } else {
          console.log(`[dash-worker] No page found for auto-scrape using normalized URL ${normalizedMain}`);
        }
      }

      return Response.json({ id: galleryId });
    }

    // List galleries
    if (request.method === "GET" && url.pathname === "/api/galleries") {
      const { data, error } = await supabase.from("galleries").select("id, main_url, about_url, normalized_main_url").order("created_at", { ascending: false }).limit(100);
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

    // 1) Discover links
    if (request.method === "POST" && url.pathname === "/api/links/discover") {
      const body = await json();
      console.log("[dash-worker] Starting DiscoverLinks workflow", body);
      const run = await env.DISCOVER_LINKS.create({ params: { galleryId: body.galleryId, listUrls: body.listUrls ?? [], limit: body.limit ?? 100 } });
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

    if (request.method === "GET" && url.pathname === "/api/page-content") {
      const pageId = url.searchParams.get("pageId");
      if (!pageId) return new Response("pageId required", { status: 400 });
      console.log(`[dash-worker] Fetching page content for ${pageId}`);
      const { data, error } = await supabase
        .from("pages")
        .select("id, url, normalized_url, kind, fetch_status, fetched_at, page_content(markdown, parsed_at)")
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
      const body = await json();
      console.log("[dash-worker] Starting ScrapePages workflow", body);
      const run = await env.SCRAPE_PAGES.create({ params: { pageIds: body.pageIds ?? [] } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/extract") {
      const body = await json();
      const run = await env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: body.pageIds ?? [] } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/process-events") {
      const body = await json();
      const run = await env.PROCESS_EXTRACTED_EVENTS.create({ params: { pageIds: body.pageIds ?? [] } });
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
      const body = await json();
      const run = await env.EMBEDDING.create({ params: { eventIds: body.eventIds ?? [] } });
      return Response.json({ id: run.id ?? run });
    }

    // Extract gallery
    if (request.method === "POST" && url.pathname === "/api/galleries/extract") {
      const body = await json();
      console.log("[dash-worker] Starting ExtractGallery workflow", body);
      const run = await env.EXTRACT_GALLERY.create({ params: { galleryId: body.galleryId } });
      return Response.json({ id: run.id ?? run });
    }

    console.log(`[dash-worker] No route matched ${request.method} ${url.pathname}`);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
