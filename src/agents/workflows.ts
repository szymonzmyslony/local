import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { getAgentByName } from "agents";
import Firecrawl from "@mendable/firecrawl-js";
import type { Event } from "../schema";
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
  linkEventsToArtists
} from "../utils/db";
import {
  embedEvents,
  embedGallery,
  embedArtists
} from "../utils/embeddings";
import { createSupabaseClient } from "../utils/supabase";
import { getEventsByGallery, getArtistsByEvent } from "../utils/db";
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

    // ===== 1) Crawl
    const crawledPages = await step.do("crawl", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:crawl", { galleryId, url, maxPages });
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
          const id = `${galleryId}:${Buffer.from(pageUrl).toString("base64").substring(0, 16)}`;

          return {
            id,
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

      const totalMarkdownSize = pages.reduce((sum, p) => sum + p.markdown.length, 0);
      const avgPageSize = pages.length > 0 ? Math.round(totalMarkdownSize / pages.length) : 0;

      console.log("[workflow] end:crawl", {
        pages: pages.length,
        totalMarkdownSize,
        avgPageSize
      });
      return pages;
    });

    // ===== 2) Persist pages (idempotent)
    await step.do("save-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:save-pages", { galleryId, pages: crawledPages.length });
      await insertScrapedPages(this.env, galleryId, crawledPages);
      console.log("[workflow] end:save-pages", { galleryId });
    });

    // ===== 3) Classify pages by content type
    const classifiedPages = await step.do("classify-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:classify", { pages: crawledPages.length });
      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      const classified = await classifyPages(crawledPages, currentDate);

      const breakdown: Record<string, number> = {};
      for (const page of classified) {
        breakdown[page.classification] = (breakdown[page.classification] || 0) + 1;
      }

      console.log("[workflow] end:classify", {
        total: classified.length,
        breakdown
      });
      return classified;
    });

    // ===== 4) Save classifications
    await step.do("save-classifications", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:save-classifications", { pages: classifiedPages.length });
      await updatePageClassifications(
        this.env,
        classifiedPages.map(p => ({
          id: p.id,
          classification: p.classification as Database["public"]["Enums"]["page_classification"]
        }))
      );
      console.log("[workflow] end:save-classifications");
    });

    // ===== 5) Query creator_info pages
    const creatorInfoPages = await step.do("query-creator-info-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:query-creator-info-pages");
      const pages = await getPagesByClassification(this.env, galleryId, "creator_info");
      const totalContentSize = pages.reduce((sum, p) => sum + p.markdown.length, 0);
      console.log("[workflow] end:query-creator-info-pages", {
        count: pages.length,
        totalContentSize
      });
      return pages;
    });

    // ===== 6) Extract gallery info from creator_info pages
    const galleryInfo = await step.do("extract-gallery-info", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:extract-gallery-info", {
        pagesCount: creatorInfoPages.length
      });

      if (creatorInfoPages.length === 0) {
        console.log("[workflow] No creator_info pages found, using defaults");
        return {
          name: "Unknown Gallery",
          website: url,
          galleryType: null,
          city: "Unknown",
          neighborhood: null,
          tz: "Europe/Warsaw"
        };
      }

      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      const contentSize = creatorInfoPages.reduce((sum, p) => sum + p.markdown.length, 0);
      const info = await extractGalleryInfoOnly(creatorInfoPages, currentDate);
      console.log("[workflow] end:extract-gallery-info", {
        name: info.name,
        city: info.city,
        contentProcessed: contentSize
      });
      return info;
    });

    // ===== 7) Upsert gallery
    const gallery = await step.do("upsert-gallery", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:upsert-gallery");
      await upsertGallery(this.env, galleryId, {
        name: galleryInfo.name,
        website: galleryInfo.website,
        gallery_type: galleryInfo.galleryType ?? null,
        city: galleryInfo.city,
        neighborhood: galleryInfo.neighborhood ?? null,
        tz: galleryInfo.tz ?? "Europe/Warsaw"
      });

      const events = await getEventsByGallery(this.env, galleryId);
      console.log("[workflow] end:upsert-gallery", { eventsCount: events.length });

      // Return a Gallery object
      return {
        id: galleryId,
        name: galleryInfo.name,
        website: galleryInfo.website,
        gallery_type: galleryInfo.galleryType ?? null,
        city: galleryInfo.city,
        neighborhood: galleryInfo.neighborhood ?? null,
        tz: galleryInfo.tz ?? "Europe/Warsaw",
        embedding: null,
        created_at: Date.now(),
        updated_at: Date.now()
      };
    });

    // ===== 8) Query artist pages
    const artistPages = await step.do("query-artist-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:query-artist-pages");
      const pages = await getPagesByClassification(this.env, galleryId, "artists");
      const totalContentSize = pages.reduce((sum, p) => sum + p.markdown.length, 0);
      console.log("[workflow] end:query-artist-pages", {
        count: pages.length,
        totalContentSize
      });
      return pages;
    });

    // ===== 9) Extract artists (AI)
    const extractedArtists = await step.do("extract-artists-ai", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:extract-artists-ai", {
        pagesCount: artistPages.length
      });
      if (artistPages.length === 0) {
        console.log("[workflow] No artist pages, skipping");
        return [];
      }
      const currentDate = new Date(nowTimestamp * 1000).toISOString();
      const contentSize = artistPages.reduce((sum, p) => sum + p.markdown.length, 0);
      const artists = await extractArtistsOnly(artistPages, currentDate);
      console.log("[workflow] end:extract-artists-ai", {
        extracted: artists.length,
        contentProcessed: contentSize
      });
      return artists;
    });

    // ===== 10) Save artists
    const artistMap = await step.do("save-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:save-artists", {
        extractedCount: extractedArtists.length
      });
      if (extractedArtists.length === 0) {
        console.log("[workflow] No artists to save");
        return new Map<string, string>();
      }
      const map = await upsertArtists(this.env, extractedArtists);
      const deduped = extractedArtists.length - map.size;
      console.log("[workflow] end:save-artists", {
        extracted: extractedArtists.length,
        saved: map.size,
        deduped
      });
      return map;
    });

    // ===== 11) Query event pages
    const eventPages = await step.do("query-event-pages", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:query-event-pages");
      const pages = await getPagesByClassification(this.env, galleryId, "event");
      const totalContentSize = pages.reduce((sum, p) => sum + p.markdown.length, 0);
      console.log("[workflow] end:query-event-pages", {
        count: pages.length,
        totalContentSize,
        pageUrls: pages.map(p => p.url)
      });
      return pages;
    });

    // ===== 12) Extract events (AI)
    const extractedEvents = await step.do("extract-events-ai", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:extract-events-ai", {
        pagesCount: eventPages.length,
        currentTimestamp: nowTimestamp,
        currentDate: new Date(nowTimestamp * 1000).toISOString()
      });
      if (eventPages.length === 0) {
        console.log("[workflow] No event pages, skipping");
        return [];
      }
      const contentSize = eventPages.reduce((sum, p) => sum + p.markdown.length, 0);
      const events = await extractEventsOnly(eventPages, nowTimestamp);

      let dateRange = null;
      if (events.length > 0) {
        const starts = events.map(e => e.start);
        dateRange = {
          earliest: Math.min(...starts),
          latest: Math.max(...starts)
        };
      }

      console.log("[workflow] end:extract-events-ai", {
        extracted: events.length,
        contentProcessed: contentSize,
        dateRange
      });
      return events;
    });

    // ===== 13) Save events
    const eventMap = await step.do("save-events", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:save-events", {
        extractedCount: extractedEvents.length
      });
      if (extractedEvents.length === 0) {
        console.log("[workflow] No events to save");
        return new Map<string, string>();
      }

      const map = await insertEvents(this.env, extractedEvents, galleryId);

      console.log("[workflow] end:save-events", {
        extracted: extractedEvents.length,
        saved: map.size
      });
      return map;
    });

    // ===== 14) Link events to artists
    await step.do("link-events-to-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:link-events-to-artists", {
        eventsCount: extractedEvents.length,
        artistsCount: artistMap.size
      });
      if (extractedEvents.length === 0 || artistMap.size === 0) {
        console.log("[workflow] No events or artists to link, skipping");
        return;
      }

      let linksCreated = 0;
      for (const e of extractedEvents) {
        for (const artistName of e.artistNames) {
          if (artistMap.get(artistName.trim())) {
            linksCreated++;
          }
        }
      }

      await linkEventsToArtists(this.env, extractedEvents, eventMap, artistMap);
      console.log("[workflow] end:link-events-to-artists", {
        linksCreated
      });
    });

    // ===== 15) Query events for embedding
    const events = await step.do('query', async () => {
      const eventsList = await getEventsByGallery(this.env, galleryId);
      return eventsList as any;
    }) as Event[];

    // ===== 16) Query artists for embedding
    const artists = await step.do("query-artists-for-embedding", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:query-artists-for-embedding");

      // Get all unique artists for all events of this gallery
      const artistIds = new Set<string>();
      for (const event of events) {
        const eventArtists = await getArtistsByEvent(this.env, event.id);
        for (const a of eventArtists) {
          artistIds.add(a.id);
        }
      }

      // Fetch all unique artists
      const artists = [];
      for (const artistId of artistIds) {
        const eventArtists = await getArtistsByEvent(this.env, events.find(e => e.id)!.id);
        const artist = eventArtists.find(a => a.id === artistId);
        if (artist) artists.push(artist);
      }

      console.log("[workflow] end:query-artists-for-embedding", { count: artists.length });
      return artists;
    });

    // ===== 17) Embed & save gallery
    await step.do("embed-gallery", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:embed-gallery");
      const gVec = await embedGallery(gallery);

      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await client
        .from('galleries')
        .update({ embedding: JSON.stringify(gVec) })
        .eq('id', galleryId);

      console.log("[workflow] end:embed-gallery", {
        vectorDimensions: gVec.length
      });
    });

    // ===== 18) Embed & save events
    await step.do("embed-events", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:embed-events", { count: events.length });
      if (events.length === 0) return;

      const eventsWithArtistNames = await Promise.all(
        events.map(async (event) => {
          const eventArtists = await getArtistsByEvent(this.env, event.id);
          return {
            ...event,
            artistNames: eventArtists.map(a => a.name)
          };
        })
      );

      const eVecs = await embedEvents(eventsWithArtistNames);

      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await Promise.all(
        eventsWithArtistNames.map((event, i) =>
          client
            .from('events')
            .update({ embedding: JSON.stringify(eVecs[i]) })
            .eq('id', event.id)
        )
      );

      console.log("[workflow] end:embed-events", {
        vectorsCreated: eVecs.length,
        vectorDimensions: eVecs[0]?.length || 0
      });
    });

    // ===== 19) Embed & save artists
    await step.do("embed-artists", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      console.log("[workflow] start:embed-artists", { count: artists.length });
      if (artists.length === 0) return;

      const aVecs = await embedArtists(artists);

      const client = createSupabaseClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
      await Promise.all(
        artists.map((artist, i) =>
          client
            .from('artists')
            .update({ embedding: JSON.stringify(aVecs[i]) })
            .eq('id', artist.id)
        )
      );

      console.log("[workflow] end:embed-artists", {
        vectorsCreated: aVecs.length,
        vectorDimensions: aVecs[0]?.length || 0
      });
    });

    // ===== 20) Update agent state
    await step.do("agent-state", { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS }, async () => {
      const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);
      await galleryAgent.updateScrapingResult({ success: true, timestamp: Date.now() });
    });

    return {
      ok: true,
      galleryId,
      url,
      pagesScraped: crawledPages.length,
      eventsCount: events.length,
      artistsCount: artists.length,
      completedAt: Date.now()
    };
  }
}