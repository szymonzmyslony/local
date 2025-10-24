// workflows.ts
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { getAgentByName } from "agents";
import Firecrawl from "@mendable/firecrawl-js";
import {
  classifyPages,
  extractGalleryInfoOnly,
  extractArtistsOnly,
  extractEventsOnly
} from "../utils/extraction";
import {
  upsertGallery,
  insertScrapedPages,
  updatePageClassifications,
  getPagesByClassification,
  upsertArtists,
  insertEvents,
  linkEventsToArtists,
  getScrapedPagesByGallery,
  getArtistsByEvent,
  getEventsByIds,
  getArtistsByIds
} from "../utils/db";
import {
  embedEvents,
  embedGallery,
  embedArtists
} from "../utils/embeddings";
import { createSupabaseClient } from "../utils/supabase";
import type { Database } from "../types/database_types";

const SCRAPE_CONFIG = {
  MAX_PAGES: 5,
  MAX_DISCOVERY_DEPTH: 2,
  WAIT_FOR_DYNAMIC_MS: 1500,
  POLL_INTERVAL_SEC: 3,
  TIMEOUT_SEC: 180,
  STEP_TIMEOUT_MS: 600_000
} as const;

export interface ScrapeParams {
  galleryId: string;
  url: string;
  maxPages?: number;
}

export class ScrapeWorkflow extends WorkflowEntrypoint<Env> {
  private firecrawl: Firecrawl;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    this.firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
  }

  async run(event: WorkflowEvent<ScrapeParams>, step: WorkflowStep) {
    const { galleryId, url, maxPages = SCRAPE_CONFIG.MAX_PAGES } = event.payload;
    const nowTimestamp = Math.floor(Date.now() / 1000);
    console.log('[workflow] run start', { galleryId, url, maxPages });

    // ===== 1) Crawl
    console.log('[workflow] start step "crawl"', { url, maxPages, maxDiscoveryDepth: SCRAPE_CONFIG.MAX_DISCOVERY_DEPTH });
    const crawledPages = await step.do("crawl", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const result = await this.firecrawl.crawl(url, {
        maxDiscoveryDepth: SCRAPE_CONFIG.MAX_DISCOVERY_DEPTH,
        limit: maxPages,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: false, waitFor: SCRAPE_CONFIG.WAIT_FOR_DYNAMIC_MS },
        pollInterval: SCRAPE_CONFIG.POLL_INTERVAL_SEC,
        timeout: SCRAPE_CONFIG.TIMEOUT_SEC
      });

      const pages = (result.data || [])
        .filter((doc): doc is typeof doc & { metadata: NonNullable<typeof doc.metadata> & { url: string } } =>
          Boolean(doc.metadata?.url)
        )
        .map((doc) => {
          const md = doc.metadata;
          const pageUrl = md.url;
          const imageValue = md.ogImage || md.image;
          const imageString = typeof imageValue === "string" ? imageValue : "";

          return {
            id: pageUrl,
            url: pageUrl,
            markdown: doc.markdown || "",
            metadata: {
              title: md.title || "",
              description: md.description || "",
              image: imageString,
              language: md.language || "",
              statusCode: md.statusCode || 200
            }
          };
        });

      return pages;
    });
    console.log('[workflow] done step "crawl"', { pages: crawledPages.length });

    // ===== 2) Diff + Persist pages (idempotent)
    console.log('[workflow] start step "save-pages"', { crawledPages: crawledPages.length });
    const { changedIds } = await step.do("save-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const normalize = (s: string) => (s || "").replace(/\s+/g, " ").trim();

      // load previously saved pages
      const previous = await getScrapedPagesByGallery(this.env, galleryId);
      const prevById = new Map(previous.map(p => [p.id, p]));

      // split changed vs unchanged
      const changed: typeof crawledPages = [];
      const unchanged: typeof crawledPages = [];
      for (const p of crawledPages) {
        const prev = prevById.get(p.id);
        if (!prev) {
          changed.push(p);
        } else {
          const contentChanged = normalize(prev.markdown) !== normalize(p.markdown);
          if (contentChanged) changed.push(p);
          else unchanged.push(p);
        }
      }

      // upsert unchanged without resetting classification
      if (unchanged.length) {
        await insertScrapedPages(this.env, galleryId, unchanged, { resetClassification: false });
      }
      // upsert changed and reset classification for them
      if (changed.length) {
        await insertScrapedPages(this.env, galleryId, changed, { resetClassification: true });
      }

      return { changedIds: changed.map(p => p.id) };
    });
    console.log('[workflow] done step "save-pages"', { changedCount: changedIds.length });

    // ===== 3) Classify pages (only changed/new)
    console.log('[workflow] start step "classify-pages"', { changedCount: changedIds.length });
    const classifiedPages = await step.do("classify-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (changedIds.length === 0) {
        console.log("[workflow] no changed pages → skip classify");
        return [] as Array<{ id: string; classification: string }>;
      }
      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      const changed = crawledPages.filter(p => changedIds.includes(p.id));
      const classified = await classifyPages(changed, currentDate);
      await updatePageClassifications(
        this.env,
        classified.map(p => ({
          id: p.id,
          classification: p.classification as Database["public"]["Enums"]["page_classification"]
        }))
      );
      return classified;
    });
    console.log('[workflow] done step "classify-pages"', { classifiedCount: classifiedPages.length });

    const changedSet = new Set(changedIds);

    // ===== 5) Query creator_info pages
    console.log('[workflow] start step "query-creator-info-pages"');
    const creatorInfoPages = await step.do("query-creator-info-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      return await getPagesByClassification(this.env, galleryId, "creator_info");
    });
    console.log('[workflow] done step "query-creator-info-pages"', { count: creatorInfoPages.length });

    // ===== 6) Extract gallery info (always OK to run; cheap and keeps record fresh)
    console.log('[workflow] start step "extract-gallery-info"');
    const galleryInfo = await step.do("extract-gallery-info", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (creatorInfoPages.length === 0) {
        return { name: "Unknown Gallery", website: url, galleryType: null, city: "Unknown", neighborhood: null, tz: "Europe/Warsaw" };
      }
      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      return await extractGalleryInfoOnly(creatorInfoPages, currentDate);
    });
    console.log('[workflow] done step "extract-gallery-info"', { name: galleryInfo.name, website: galleryInfo.website });

    // ===== 7) Upsert gallery
    console.log('[workflow] start step "upsert-gallery"', { galleryId, name: galleryInfo.name });
    const gallery = await step.do("upsert-gallery", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      await upsertGallery(this.env, galleryId, {
        name: galleryInfo.name,
        website: galleryInfo.website,
        gallery_type: galleryInfo.galleryType ?? null,
        city: galleryInfo.city,
        tz: galleryInfo.tz ?? "Europe/Warsaw"
      });
      return {
        id: galleryId,
        name: galleryInfo.name,
        website: galleryInfo.website,
        gallery_type: galleryInfo.galleryType ?? null,
        city: galleryInfo.city,
        tz: galleryInfo.tz ?? "Europe/Warsaw",
        embedding: null,
        created_at: Date.now(),
        updated_at: Date.now()
      };
    });
    console.log('[workflow] done step "upsert-gallery"', { galleryId });

    // ===== 8) Query artist pages
    console.log('[workflow] start step "query-artist-pages"');
    const artistPages = await step.do("query-artist-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      return await getPagesByClassification(this.env, galleryId, "artists");
    });
    console.log('[workflow] done step "query-artist-pages"', { count: artistPages.length });

    // ===== 9) Extract artists (only if relevant pages changed)
    console.log('[workflow] start step "extract-artists-ai"', { artistPages: artistPages.length });
    const extractedArtists = await step.do("extract-artists-ai", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (artistPages.length === 0) return [];
      const touched = artistPages.filter(p => changedSet.has(p.id));
      if (touched.length === 0) {
        console.log("[workflow] no artist page changes → skip artist extract");
        return [];
      }
      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      return await extractArtistsOnly(touched, currentDate);
    });
    console.log('[workflow] done step "extract-artists-ai"', { extractedCount: extractedArtists.length });

    // ===== 10) Save artists (map: artistName/aliases -> id)
    console.log('[workflow] start step "save-artists"', { extractedCount: extractedArtists.length });
    const artistMap = await step.do("save-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (extractedArtists.length === 0) return new Map<string, string>();
      return await upsertArtists(this.env, extractedArtists);
    });
    console.log('[workflow] done step "save-artists"', { savedArtists: artistMap.size });

    // ===== 11) Query event pages
    console.log('[workflow] start step "query-event-pages"');
    const eventPages = await step.do("query-event-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      return await getPagesByClassification(this.env, galleryId, "event");
    });
    console.log('[workflow] done step "query-event-pages"', { count: eventPages.length });

    // ===== 12) Extract events (only if event pages changed)
    console.log('[workflow] start step "extract-events-ai"', { eventPages: eventPages.length });
    const extractedEvents = await step.do("extract-events-ai", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (eventPages.length === 0) return [];
      const touched = eventPages.filter(p => changedSet.has(p.id));
      if (touched.length === 0) {
        console.log("[workflow] no event page changes → skip event extract");
        return [];
      }
      return await extractEventsOnly(touched, nowTimestamp);
    });
    console.log('[workflow] done step "extract-events-ai"', { extractedCount: extractedEvents.length });

    // ===== 13) Save events
    console.log('[workflow] start step "save-events"', { extractedCount: extractedEvents.length });
    const eventMap = await step.do("save-events", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (extractedEvents.length === 0) return new Map<string, string>();
      return await insertEvents(this.env, extractedEvents, galleryId);
    });
    console.log('[workflow] done step "save-events"', { savedEvents: eventMap.size });

    // ===== 14) Link events to artists
    console.log('[workflow] start step "link-events-to-artists"', { events: extractedEvents.length, artists: artistMap.size });
    await step.do("link-events-to-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      if (extractedEvents.length === 0 || artistMap.size === 0) return;
      await linkEventsToArtists(this.env, extractedEvents, eventMap, artistMap);
    });
    console.log('[workflow] done step "link-events-to-artists"');

    // ===== 17) Embed & save gallery (always OK)
    console.log('[workflow] start step "embed-gallery"', { galleryId });
    await step.do("embed-gallery", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const gVec = await embedGallery(gallery);
      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await client.from('galleries').update({ embedding: JSON.stringify(gVec) }).eq('id', galleryId);
    });
    console.log('[workflow] done step "embed-gallery"', { galleryId });

    // ===== 18) Embed & save events (only the ones we touched)
    console.log('[workflow] start step "embed-events"', { count: Array.from(eventMap.values()).length });
    await step.do("embed-events", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const ids = Array.from(eventMap.values());
      if (ids.length === 0) return;

      const events = await getEventsByIds(this.env, ids);
      const eventsWithArtistNames = await Promise.all(
        events.map(async (event) => {
          const as = await getArtistsByEvent(this.env, event.id);
          return { ...event, artistNames: as.map(a => a.name) };
        })
      );

      const eVecs = await embedEvents(eventsWithArtistNames);
      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await Promise.all(
        eventsWithArtistNames.map((event, i) =>
          client.from('events').update({ embedding: JSON.stringify(eVecs[i]) }).eq('id', event.id)
        )
      );
    });
    console.log('[workflow] done step "embed-events"');

    // ===== 19) Embed & save artists (only the ones we touched)
    console.log('[workflow] start step "embed-artists"', { count: Array.from(new Set(Array.from(artistMap.values()))).length });
    await step.do("embed-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const ids = Array.from(new Set(Array.from(artistMap.values())));
      if (ids.length === 0) return;

      const artists = await getArtistsByIds(this.env, ids);
      const aVecs = await embedArtists(artists);
      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await Promise.all(
        artists.map((artist, i) =>
          client.from('artists').update({ embedding: JSON.stringify(aVecs[i]) }).eq('id', artist.id)
        )
      );
    });
    console.log('[workflow] done step "embed-artists"');

    // ===== 20) Update agent state
    console.log('[workflow] start step "agent-state"', { galleryId });
    await step.do("agent-state", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);
      await galleryAgent.updateScrapingResult({ success: true, timestamp: Date.now() });
    });
    console.log('[workflow] done step "agent-state"', { galleryId });
    console.log('[workflow] run complete', {
      galleryId,
      pagesScraped: crawledPages.length,
      eventsTouched: Array.from(eventMap.values()).length,
      artistsTouched: new Set(Array.from(artistMap.values())).size
    });
    return {
      ok: true,
      galleryId,
      url,
      pagesScraped: crawledPages.length,
      eventsTouched: Array.from(eventMap.values()).length,
      artistsTouched: new Set(Array.from(artistMap.values())).size,
      completedAt: Date.now()
    };
  }
}