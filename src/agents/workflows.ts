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
  extractEventOnly
} from "../utils/extraction";
import {
  insertScrapedPages,
  updatePageClassifications,
  getScrapedPagesByGallery,
  getPagesByIds,
  upsertGallery,
  upsertArtists,
  insertEvent,
  getEventsByIds,
  getArtistsByIds,
  getArtistsByEvent,
  linkEventsToArtists
} from "../utils/db";
import type { Database } from "../types/database_types";
import {
  CLASSIFICATION_TO_KIND,
  type ExtractionJob,
  type ExtractionKind,
  type GalleryInfoExtractionJob,
  type ArtistExtractionJob,
  type EventExtractionJob
} from "../types/jobs";
import type { PageClassification, Gallery } from "../schema";
import { embedEvents, embedGallery, embedArtists } from "../utils/embeddings";
import { createSupabaseClient } from "../utils/supabase";

const SCRAPE_CONFIG = {
  MAX_PAGES: 5,
  MAX_DISCOVERY_DEPTH: 2,
  WAIT_FOR_DYNAMIC_MS: 1500,
  POLL_INTERVAL_SEC: 3,
  TIMEOUT_SEC: 180,
  STEP_TIMEOUT_MS: 600_000
} as const;

export interface CrawlerWorkflowParams {
  galleryId: string;
  url: string;
  maxPages?: number;
}

function makeJobId(kind: ExtractionKind, galleryId: string): string {
  if (typeof crypto.randomUUID === "function") {
    return `${kind}-${galleryId}-${crypto.randomUUID()}`;
  }
  return `${kind}-${galleryId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class CrawlerWorkflow extends WorkflowEntrypoint<Env> {
  private firecrawl: Firecrawl;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    this.firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
  }

  async run(event: WorkflowEvent<CrawlerWorkflowParams>, step: WorkflowStep) {
    const {
      galleryId,
      url,
      maxPages = SCRAPE_CONFIG.MAX_PAGES
    } = event.payload;
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const referenceDateIso = new Date(nowTimestamp * 1000).toISOString();
    const runId = `${galleryId}-${nowTimestamp}`;

    console.log("[crawler] run start", { galleryId, url, maxPages, runId });

    console.log('[crawler] start step "crawl"', {
      url,
      maxPages,
      maxDiscoveryDepth: SCRAPE_CONFIG.MAX_DISCOVERY_DEPTH
    });
    const crawledPages = await step.do(
      "crawl",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const result = await this.firecrawl.crawl(url, {
          maxDiscoveryDepth: SCRAPE_CONFIG.MAX_DISCOVERY_DEPTH,
          limit: maxPages,
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: false,
            waitFor: SCRAPE_CONFIG.WAIT_FOR_DYNAMIC_MS
          },
          pollInterval: SCRAPE_CONFIG.POLL_INTERVAL_SEC,
          timeout: SCRAPE_CONFIG.TIMEOUT_SEC
        });

        const pages = (result.data || [])
          .filter(
            (
              doc
            ): doc is typeof doc & {
              metadata: NonNullable<typeof doc.metadata> & { url: string };
            } => Boolean(doc.metadata?.url)
          )
          .map((doc) => {
            const md = doc.metadata;
            const pageUrl = md.url;
            const imageValue = md.ogImage || md.image;
            const imageString =
              typeof imageValue === "string" ? imageValue : "";

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
      }
    );
    console.log('[crawler] done step "crawl"', { pages: crawledPages.length });

    console.log('[crawler] start step "save-pages"', {
      crawledPages: crawledPages.length
    });
    const { changedIds } = await step.do(
      "save-pages",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const normalize = (s: string) => (s || "").replace(/\s+/g, " ").trim();

        const previous = await getScrapedPagesByGallery(this.env, galleryId);
        const prevById = new Map(previous.map((p) => [p.id, p]));

        const changed: typeof crawledPages = [];
        const unchanged: typeof crawledPages = [];
        for (const p of crawledPages) {
          const prev = prevById.get(p.id);
          if (!prev) {
            changed.push(p);
          } else {
            const contentChanged =
              normalize(prev.markdown) !== normalize(p.markdown);
            if (contentChanged) changed.push(p);
            else unchanged.push(p);
          }
        }

        if (unchanged.length) {
          await insertScrapedPages(this.env, galleryId, unchanged, {
            resetClassification: false
          });
        }
        if (changed.length) {
          await insertScrapedPages(this.env, galleryId, changed, {
            resetClassification: true
          });
        }

        return { changedIds: changed.map((p) => p.id) };
      }
    );
    console.log('[crawler] done step "save-pages"', {
      changedCount: changedIds.length
    });

    console.log('[crawler] start step "classify-pages"', {
      changedCount: changedIds.length
    });
    const classifiedPages = await step.do(
      "classify-pages",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        if (changedIds.length === 0) {
          console.log("[crawler] no changed pages → skip classify");
          return [] as Array<{
            id: string;
            classification: PageClassification;
          }>;
        }
        const changed = crawledPages.filter((p) => changedIds.includes(p.id));
        const classified = await classifyPages(changed, referenceDateIso);
        await updatePageClassifications(
          this.env,
          classified.map((p) => ({
            id: p.id,
            classification:
              p.classification as Database["public"]["Enums"]["page_classification"]
          }))
        );
        return classified;
      }
    );
    console.log('[crawler] done step "classify-pages"', {
      classifiedCount: classifiedPages.length
    });

    const classificationBuckets = new Map<PageClassification, Set<string>>();
    for (const page of classifiedPages) {
      const bucket =
        classificationBuckets.get(page.classification) ?? new Set<string>();
      bucket.add(page.id);
      classificationBuckets.set(page.classification, bucket);
    }

    await step.do(
      "enqueue-extraction",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const jobs: ExtractionJob[] = [];
        for (const [
          classification,
          pageIdsSet
        ] of classificationBuckets.entries()) {
          const kind = CLASSIFICATION_TO_KIND[classification];
          if (!kind) continue;
          const pageIds = Array.from(pageIdsSet);
          if (pageIds.length === 0) continue;

          if (kind === "events") {
            for (const pageId of pageIds) {
              jobs.push({
                jobId: makeJobId(kind, galleryId),
                galleryId,
                pageIds: [pageId],
                triggeredBy: runId,
                enqueuedAt: Date.now(),
                kind,
                currentTimestamp: nowTimestamp,
                url: pageId, // pageId is the URL
                scrapedPageId: pageId // pageId is also the scraped_pages.id
              });
            }
            continue;
          }

          const jobId = makeJobId(kind, galleryId);
          const sharedBase = {
            jobId,
            galleryId,
            pageIds,
            triggeredBy: runId,
            enqueuedAt: Date.now()
          } as const;

          if (kind === "gallery-info") {
            jobs.push({
              ...sharedBase,
              kind,
              referenceDateIso
            });
          } else if (kind === "artists") {
            jobs.push({
              ...sharedBase,
              kind,
              referenceDateIso
            });
          }
        }

        if (jobs.length === 0) {
          console.log("[crawler] no extraction jobs enqueued", {
            galleryId,
            runId
          });
          return { enqueued: 0 };
        }

        await this.env.EXTRACTION_QUEUE.sendBatch(
          jobs.map((job) => ({ body: job }))
        );
        console.log("[crawler] extraction jobs enqueued", {
          galleryId,
          runId,
          jobs: jobs.map((job) => ({
            kind: job.kind,
            pageCount: job.pageIds.length,
            jobId: job.jobId
          }))
        });
        return { enqueued: jobs.length };
      }
    );

    await step.do(
      "agent-state",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const galleryAgent = await getAgentByName(
          this.env.GalleryAgent,
          galleryId
        );
        await galleryAgent.updateScrapingResult({
          success: true,
          timestamp: Date.now()
        });
      }
    );
    console.log('[crawler] done step "agent-state"', { galleryId });

    console.log("[crawler] run complete", {
      galleryId,
      runId,
      pagesScraped: crawledPages.length,
      changedCount: changedIds.length,
      classifiedCount: classifiedPages.length
    });

    return {
      ok: true,
      galleryId,
      url,
      runId,
      pagesScraped: crawledPages.length,
      changedCount: changedIds.length,
      classifiedCount: classifiedPages.length,
      completedAt: Date.now()
    };
  }
}

export class GalleryInfoWorkflow extends WorkflowEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
  }

  async run(
    event: WorkflowEvent<GalleryInfoExtractionJob>,
    step: WorkflowStep
  ) {
    const job = event.payload;
    const { galleryId, pageIds, referenceDateIso, jobId, triggeredBy } = job;

    console.log("[gallery-info] run start", {
      galleryId,
      pageIds: pageIds.length,
      jobId,
      triggeredBy
    });

    const pages = await step.do(
      "load-pages",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const records = await getPagesByIds(this.env, pageIds);
        if (records.length === 0) {
          throw new Error(
            `No pages found for gallery info extraction: ${pageIds.join(",")}`
          );
        }
        return records.map((record) => ({
          url: record.url,
          markdown: record.markdown
        }));
      }
    );

    const galleryInfo = await step.do(
      "extract-gallery-info",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        return await extractGalleryInfoOnly(pages, referenceDateIso);
      }
    );
    console.log("[gallery-info] extraction", {
      galleryId,
      name: galleryInfo.name
    });

    await step.do(
      "upsert-gallery",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        await upsertGallery(this.env, galleryId, {
          name: galleryInfo.name,
          website: galleryInfo.website,
          gallery_type: galleryInfo.galleryType ?? null,
          city: galleryInfo.city,
          tz: galleryInfo.tz ?? "Europe/Warsaw"
        });
      }
    );

    await step.do(
      "embed-gallery",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const galleryRecord: Gallery = {
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
        const embedding = await embedGallery(galleryRecord);
        const client = createSupabaseClient(
          this.env.SUPABASE_URL,
          this.env.SUPABASE_ANON_KEY
        );
        await client
          .from("galleries")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", galleryId);
      }
    );

    console.log("[gallery-info] run complete", { galleryId, jobId });
    return { ok: true, galleryId, jobId };
  }
}

export class ArtistExtractionWorkflow extends WorkflowEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
  }

  async run(event: WorkflowEvent<ArtistExtractionJob>, step: WorkflowStep) {
    const job = event.payload;
    const { galleryId, pageIds, referenceDateIso, jobId, triggeredBy } = job;

    console.log("[artist-extraction] run start", {
      galleryId,
      pageIds: pageIds.length,
      jobId,
      triggeredBy
    });

    const pages = await step.do(
      "load-pages",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const records = await getPagesByIds(this.env, pageIds);
        if (records.length === 0) {
          throw new Error(
            `No pages found for artist extraction: ${pageIds.join(",")}`
          );
        }
        return records.map((record) => ({
          url: record.url,
          markdown: record.markdown
        }));
      }
    );

    const artists = await step.do(
      "extract-artists",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        return await extractArtistsOnly(pages, referenceDateIso);
      }
    );
    console.log("[artist-extraction] extracted", {
      galleryId,
      jobId,
      count: artists.length
    });

    const artistMap = await step.do(
      "upsert-artists",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        if (artists.length === 0) {
          return new Map<string, string>();
        }
        return await upsertArtists(this.env, artists);
      }
    );

    await step.do(
      "embed-artists",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        if (artistMap.size === 0) return;
        const ids = Array.from(new Set(Array.from(artistMap.values())));
        const artistsFromDb = await getArtistsByIds(this.env, ids);
        if (artistsFromDb.length === 0) return;
        const embeddings = await embedArtists(artistsFromDb);
        const client = createSupabaseClient(
          this.env.SUPABASE_URL,
          this.env.SUPABASE_ANON_KEY
        );
        await Promise.all(
          artistsFromDb.map((artist, index) =>
            client
              .from("artists")
              .update({ embedding: JSON.stringify(embeddings[index]) })
              .eq("id", artist.id)
          )
        );
      }
    );

    console.log("[artist-extraction] run complete", {
      galleryId,
      jobId,
      artistCount: artistMap.size
    });
    return {
      ok: true,
      galleryId,
      jobId,
      artistCount: artistMap.size
    };
  }
}

export class EventExtractionWorkflow extends WorkflowEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
  }

  async run(event: WorkflowEvent<EventExtractionJob>, step: WorkflowStep) {
    const job = event.payload;
    const { galleryId, currentTimestamp, jobId, triggeredBy, url, scrapedPageId } = job;

    console.log("[event-extraction] run start", {
      galleryId,
      url,
      jobId,
      triggeredBy
    });

    const page = await step.do(
      "load-page",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const records = await getPagesByIds(this.env, [scrapedPageId]);
        if (records.length === 0) {
          throw new Error(
            `No page found for event extraction: ${scrapedPageId}`
          );
        }
        return {
          url: records[0].url,
          markdown: records[0].markdown
        };
      }
    );

    const extractedEvent = await step.do(
      "extract-event",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        try {
          return await extractEventOnly(page, currentTimestamp);
        } catch (error) {
          console.error("[event-extraction] extractEventOnly failed", {
            galleryId,
            jobId,
            url,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error
          });
          throw error;
        }
      }
    );
    console.log("[event-extraction] extracted", {
      galleryId,
      jobId,
      url,
      title: extractedEvent.title
    });

    const eventId = await step.do(
      "upsert-event",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        return await insertEvent(this.env, extractedEvent, galleryId, url, scrapedPageId);
      }
    );

    const artistMap = await step.do(
      "ensure-artists",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const artistNames = (extractedEvent.artistNames || [])
          .map((name) => name.trim())
          .filter(Boolean);
        if (artistNames.length === 0) {
          return new Map<string, string>();
        }
        const payload = artistNames.map((name) => ({ name }));
        return await upsertArtists(this.env, payload);
      }
    );

    await step.do(
      "link-event-artists",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        if (artistMap.size === 0) return;
        await linkEventsToArtists(this.env, [extractedEvent], new Map([[extractedEvent.title, eventId]]), artistMap);
      }
    );

    await step.do(
      "embed-event",
      { timeout: SCRAPE_CONFIG.STEP_TIMEOUT_MS },
      async () => {
        const eventsFromDb = await getEventsByIds(this.env, [eventId]);
        if (eventsFromDb.length === 0) return;
        const evt = eventsFromDb[0];
        const artistsForEvent = await getArtistsByEvent(this.env, evt.id);
        const eventWithArtists = {
          ...evt,
          artistNames: artistsForEvent.map((artist) => artist.name)
        };
        const embeddings = await embedEvents([eventWithArtists]);
        const client = createSupabaseClient(
          this.env.SUPABASE_URL,
          this.env.SUPABASE_ANON_KEY
        );
        await client
          .from("events")
          .update({ embedding: JSON.stringify(embeddings[0]) })
          .eq("id", evt.id);
      }
    );

    console.log("[event-extraction] run complete", {
      galleryId,
      jobId,
      url,
      eventId
    });

    return {
      ok: true,
      galleryId,
      jobId,
      url,
      eventId
    };
  }
}
