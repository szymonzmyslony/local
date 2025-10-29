import { getServiceClient } from "../../../shared/supabase";
import { Constants } from "../../../types/database_types";
// Re-export workflow entrypoints so the runtime can find them by class_name
export { SeedGallery } from "../workflows/seed_gallery";
export { DiscoverLinks } from "../workflows/discover_links";
export { ScrapePages } from "../workflows/scrape_pages";
export { ExtractEventPages } from "../workflows/extract_event_pages";
export { ExtractGallery } from "../workflows/extract_gallery";
export { Embed } from "../workflows/embeed";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = getServiceClient(env);

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
      const run = await env.SEED_GALLERY.create({ params: { mainUrl: body.mainUrl, aboutUrl: body.aboutUrl ?? null } });
      return Response.json({ id: run.id ?? run });
    }

    // List galleries
    if (request.method === "GET" && url.pathname === "/api/galleries") {
      const { data, error } = await supabase.from("galleries").select("id, main_url, about_url, normalized_main_url").order("created_at", { ascending: false }).limit(100);
      if (error) return new Response(error.message, { status: 500 });
      return Response.json(data ?? []);
    }

    // 1) Discover links
    if (request.method === "POST" && url.pathname === "/api/links/discover") {
      const body = await json();
      const run = await env.DISCOVER_LINKS.create({ params: { galleryId: body.galleryId, listUrls: body.listUrls ?? [], limit: body.limit ?? 100 } });
      return Response.json({ id: run.id ?? run });
    }

    // 2) Pages
    if (request.method === "GET" && url.pathname === "/api/pages") {
      const galleryId = url.searchParams.get("galleryId");
      type PageKind = (typeof Constants.public.Enums.page_kind)[number];
      const kindParam = url.searchParams.get("kind") as PageKind | null;
      let query = supabase
        .from("pages")
        .select("id, url, normalized_url, kind, fetch_status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (galleryId) query = query.eq("gallery_id", galleryId);
      if (kindParam) query = query.eq("kind", kindParam);
      const { data, error } = await query;
      if (error) return new Response(error.message, { status: 500 });
      return Response.json(data ?? []);
    }

    if (request.method === "POST" && url.pathname === "/api/pages/scrape") {
      const body = await json();
      const run = await env.SCRAPE_PAGES.create({ params: { pageIds: body.pageIds ?? [] } });
      return Response.json({ id: run.id ?? run });
    }

    if (request.method === "POST" && url.pathname === "/api/pages/extract") {
      const body = await json();
      const run = await env.EXTRACT_EVENT_PAGES.create({ params: { pageIds: body.pageIds ?? [] } });
      return Response.json({ id: run.id ?? run });
    }

    // 3) Events
    if (request.method === "GET" && url.pathname === "/api/events") {
      const galleryId = url.searchParams.get("galleryId");
      if (!galleryId) return new Response("galleryId required", { status: 400 });
      const { data, error } = await supabase.from("events").select("id, title, start_at, status, page_id").eq("gallery_id", galleryId).order("created_at", { ascending: false }).limit(200);
      if (error) return new Response(error.message, { status: 500 });
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
      const run = await env.EXTRACT_GALLERY.create({ params: { galleryId: body.galleryId } });
      return Response.json({ id: run.id ?? run });
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

