import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { getAgentByName } from "agents";
import Firecrawl from "@mendable/firecrawl-js";
import type { Gallery } from "../schema";
import { extractGalleryData, calculateDefaultEnd } from "../utils/extraction";
import {
  upsertGallery,
  insertScrapedPages,
  upsertArtists,
  insertEvents,
  linkEventsToArtists
} from "../utils/db";
import { embedEvents, embedGallery, embedArtists } from "../utils/embeddings";
import {
  insertEventEmbeddings,
  insertGalleryEmbedding,
  insertArtistEmbeddings
} from "../utils/vectorize";

// Scraping configuration constants
const SCRAPE_CONFIG = {
  MAX_PAGES: 5,
  MAX_DISCOVERY_DEPTH: 2,
  WAIT_FOR_DYNAMIC_MS: 1000,
  POLL_INTERVAL_SEC: 3,
  TIMEOUT_SEC: 180,
  WORKFLOW_STEP_TIMEOUT_MS: 600000 // 10 minutes for workflow steps
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
    const {
      galleryId,
      url,
      maxPages = SCRAPE_CONFIG.MAX_PAGES
    } = event.payload;
    const currentDate = new Date().toISOString();
    const workflowStartTime = Date.now();

    console.log(`[WORKFLOW START] Gallery: ${galleryId}, URL: ${url}, MaxPages: ${maxPages}`);

    // ========================================
    // STEP 1: Crawl website (Firecrawl only)
    // ========================================
    const crawledPages = await step.do(
      "crawl-website",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 1 - START] Crawling ${url} (max ${maxPages} pages, depth ${SCRAPE_CONFIG.MAX_DISCOVERY_DEPTH})`
        );

        const crawlResult = await this.firecrawl.crawl(url, {
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

        const rawPageCount = crawlResult.data?.length || 0;
        console.log(`[Step 1] Firecrawl returned ${rawPageCount} pages`);

        // Structure crawled data
        const pages = (crawlResult.data || [])
          .filter((doc) => doc.metadata?.url)
          .map((doc) => {
            const pageUrl = doc.metadata!.url!;
            const metadata = doc.metadata!;
            const imageValue = metadata.ogImage || metadata.image;
            const imageString =
              typeof imageValue === "string" ? imageValue : "";

            return {
              id: `${galleryId}:${Buffer.from(pageUrl).toString("base64").substring(0, 16)}`,
              url: pageUrl,
              markdown: doc.markdown || "",
              metadata: {
                title: metadata.title || "",
                description: metadata.description || "",
                image: imageString,
                language: metadata.language || "",
                statusCode: metadata.statusCode || 200
              }
            };
          });

        const totalMarkdownChars = pages.reduce(
          (sum, p) => sum + p.markdown.length,
          0
        );
        console.log(
          `[Step 1] Structured ${pages.length} pages, ${totalMarkdownChars} chars total`
        );
        console.log(
          `[Step 1] Sample URLs:`,
          pages.slice(0, 3).map((p) => p.url)
        );
        console.log(`[Step 1 - DONE] ${Date.now() - stepStart}ms`);

        return pages;
      }
    );

    // ========================================
    // STEP 2: Save scraped pages (D1 only, idempotent)
    // ========================================
    await step.do(
      "save-scraped-pages",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 2 - START] Saving ${crawledPages.length} pages to D1 (INSERT OR REPLACE)`
        );
        console.log(
          `[Step 2] Page IDs:`,
          crawledPages.slice(0, 3).map((p) => p.id)
        );

        try {
          console.log(`[Step 2] Calling insertScrapedPages...`);

          await insertScrapedPages(this.env.DB, galleryId, crawledPages);

          console.log(
            `[Step 2 - DONE] ✅ D1: Saved ${crawledPages.length} scraped_pages - ${Date.now() - stepStart}ms`
          );
        } catch (error) {
          console.error(`[Step 2 ERROR]`, error);
          console.error(
            `[Step 2 ERROR] Error name: ${(error as Error)?.name}`
          );
          console.error(
            `[Step 2 ERROR] Error message: ${(error as Error)?.message}`
          );
          console.error(
            `[Step 2 ERROR] Error stack:`,
            (error as Error)?.stack
          );
          throw error; // Re-throw to trigger retry
        }
      }
    );

    // ========================================
    // STEP 3: Extract data (OpenAI only)
    // ========================================
    const extracted = await step.do(
      "extract-data",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        const totalChars = crawledPages.reduce(
          (sum, p) => sum + p.markdown.length,
          0
        );
        console.log(
          `[Step 3 - START] Extracting via OpenAI from ${crawledPages.length} pages (${totalChars} chars)`
        );
        console.log(`[Step 3] Current date filter: ${currentDate}`);

        const data = await extractGalleryData(crawledPages, currentDate);

        console.log(
          `[Step 3] ✅ LLM Response: gallery="${data.gallery.name}", ${data.events.length} events, ${data.artists.length} artists`
        );
        console.log(
          `[Step 3] Event titles:`,
          data.events.slice(0, 3).map((e) => e.title)
        );
        console.log(
          `[Step 3] Artist names:`,
          data.artists.slice(0, 5).map((a) => a.name)
        );
        console.log(`[Step 3 - DONE] ${Date.now() - stepStart}ms`);

        return data;
      }
    );

    // ========================================
    // STEP 4: Upsert gallery (D1 only, idempotent)
    // ========================================
    const gallery = await step.do(
      "upsert-gallery",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 4 - START] Upserting gallery "${extracted.gallery.name}" to D1`
        );

        const now = Date.now();
        const gallery: Gallery = {
          id: galleryId,
          name: extracted.gallery.name,
          website: extracted.gallery.website,
          galleryType: extracted.gallery.galleryType ?? null,
          city: extracted.gallery.city,
          neighborhood: extracted.gallery.neighborhood ?? null,
          tz: extracted.gallery.tz,
          createdAt: now,
          updatedAt: now
        };

        console.log(
          `[Step 4] Gallery data: ${gallery.name} (${gallery.city}), type: ${gallery.galleryType}`
        );
        await upsertGallery(this.env.DB, galleryId, gallery);

        console.log(
          `[Step 4 - DONE] ✅ D1: Upserted gallery "${gallery.name}" - ${Date.now() - stepStart}ms`
        );
        return gallery;
      }
    );

    // ========================================
    // STEP 5: Upsert artists (D1 only, idempotent)
    // ========================================
    const artistMap = await step.do(
      "upsert-artists",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 5 - START] Upserting ${extracted.artists.length} artists to D1`
        );
        console.log(
          `[Step 5] Artist names:`,
          extracted.artists.slice(0, 5).map((a) => a.name)
        );

        const artistMap = await upsertArtists(this.env.DB, extracted.artists);

        const sampleIds = Array.from(artistMap.entries()).slice(0, 3);
        console.log(
          `[Step 5] Generated IDs:`,
          sampleIds.map(([name, id]) => `${name}→${id}`)
        );
        console.log(
          `[Step 5 - DONE] ✅ D1: Upserted ${artistMap.size} artists - ${Date.now() - stepStart}ms`
        );

        return artistMap;
      }
    );

    // ========================================
    // STEP 6: Insert events (D1 only, idempotent)
    // ========================================
    const eventMap = await step.do(
      "insert-events",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 6 - START] Inserting ${extracted.events.length} events to D1`
        );
        console.log(
          `[Step 6] Event date range:`,
          extracted.events.length > 0
            ? `${extracted.events[0].start} to ${extracted.events[extracted.events.length - 1].start}`
            : "none"
        );

        try {
          console.log(`[Step 6] Calling insertEvents...`);
          console.log(`[Step 6] Sample event:`, extracted.events[0]);

          const eventMap = await insertEvents(
            this.env.DB,
            extracted.events,
            galleryId
          );

          const sampleIds = Array.from(eventMap.entries()).slice(0, 3);
          console.log(
            `[Step 6] Generated event IDs:`,
            sampleIds.map(([key, id]) => `${key.substring(0, 30)}...→${id}`)
          );
          console.log(
            `[Step 6 - DONE] ✅ D1: Inserted ${eventMap.size} events - ${Date.now() - stepStart}ms`
          );

          return eventMap;
        } catch (error) {
          console.error(`[Step 6 ERROR]`, error);
          console.error(
            `[Step 6 ERROR] Error name: ${(error as Error)?.name}`
          );
          console.error(
            `[Step 6 ERROR] Error message: ${(error as Error)?.message}`
          );
          console.error(
            `[Step 6 ERROR] Error stack:`,
            (error as Error)?.stack
          );
          console.error(
            `[Step 6 ERROR] Gallery ID: ${galleryId}`
          );
          console.error(
            `[Step 6 ERROR] Event count: ${extracted.events.length}`
          );
          console.error(
            `[Step 6 ERROR] First event:`,
            extracted.events[0]
          );
          throw error;
        }
      }
    );

    // ========================================
    // STEP 7: Link events to artists (D1 only, idempotent)
    // ========================================
    await step.do(
      "link-events-to-artists",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        const totalLinks = extracted.events.reduce(
          (sum, e) => sum + e.artistNames.length,
          0
        );
        console.log(
          `[Step 7 - START] Linking ${extracted.events.length} events to artists (${totalLinks} relationships)`
        );

        await linkEventsToArtists(
          this.env.DB,
          extracted.events,
          eventMap,
          artistMap
        );

        console.log(
          `[Step 7 - DONE] ✅ D1: Created ${totalLinks} event_artists relationships - ${Date.now() - stepStart}ms`
        );
      }
    );

    // ========================================
    // STEP 8: Embed and save gallery (OpenAI + Vectorize, idempotent)
    // ========================================
    await step.do(
      "embed-and-save-gallery",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(
          `[Step 8 - START] Embedding gallery "${gallery.name}" via OpenAI`
        );

        const galleryEmbedding = await embedGallery(gallery);
        console.log(
          `[Step 8] Generated embedding: ${galleryEmbedding.length} dimensions`
        );

        await insertGalleryEmbedding(
          this.env.VECTORIZE_GALLERIES,
          galleryId,
          gallery,
          galleryEmbedding
        );

        console.log(
          `[Step 8 - DONE] ✅ Vectorize: Upserted gallery embedding - ${Date.now() - stepStart}ms`
        );
      }
    );

    // ========================================
    // STEP 9: Embed and save events (OpenAI + Vectorize, idempotent)
    // ========================================
    await step.do(
      "embed-and-save-events",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        if (extracted.events.length === 0) {
          console.log(`[Step 9] No events to embed, skipping`);
          return;
        }

        const stepStart = Date.now();
        console.log(
          `[Step 9 - START] Embedding ${extracted.events.length} events via OpenAI`
        );

        const now = Date.now();
        const events = extracted.events.map((event) => ({
          ...event,
          id: eventMap.get(`${event.title}:${event.start}`)!,
          galleryId,
          end: event.end || calculateDefaultEnd(event.start, event.eventType),
          price: event.price ?? 0,
          createdAt: now,
          updatedAt: now
        }));

        console.log(
          `[Step 9] Event IDs being embedded:`,
          events.slice(0, 3).map((e) => e.id)
        );

        const eventEmbeddings = await embedEvents(events);
        console.log(
          `[Step 9] Generated ${eventEmbeddings.length} embeddings (${eventEmbeddings[0]?.length || 0} dims each)`
        );

        await insertEventEmbeddings(
          this.env.VECTORIZE_EVENTS,
          events,
          eventEmbeddings,
          gallery
        );

        console.log(
          `[Step 9 - DONE] ✅ Vectorize: Upserted ${events.length} event embeddings - ${Date.now() - stepStart}ms`
        );
      }
    );

    // ========================================
    // STEP 10: Embed and save artists (OpenAI + Vectorize, idempotent)
    // ========================================
    await step.do(
      "embed-and-save-artists",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        if (extracted.artists.length === 0) {
          console.log(`[Step 10] No artists to embed, skipping`);
          return;
        }

        const stepStart = Date.now();
        console.log(
          `[Step 10 - START] Embedding ${extracted.artists.length} artists via OpenAI`
        );

        const now = Date.now();
        const artists = extracted.artists.map((artist) => ({
          id: artistMap.get(artist.name)!,
          name: artist.name,
          bio: artist.bio ?? null,
          website: artist.website ?? null,
          createdAt: now,
          updatedAt: now
        }));

        console.log(
          `[Step 10] Artist IDs:`,
          artists.slice(0, 3).map((a) => `${a.name}→${a.id}`)
        );

        const artistEmbeddings = await embedArtists(artists);
        console.log(
          `[Step 10] Generated ${artistEmbeddings.length} embeddings (${artistEmbeddings[0]?.length || 0} dims each)`
        );

        await insertArtistEmbeddings(
          this.env.VECTORIZE_ARTISTS,
          artists,
          artistEmbeddings
        );

        console.log(
          `[Step 10 - DONE] ✅ Vectorize: Upserted ${artists.length} artist embeddings - ${Date.now() - stepStart}ms`
        );
      }
    );

    // ========================================
    // STEP 11: Update agent state (Durable Object only)
    // ========================================
    await step.do(
      "update-agent-state",
      { timeout: SCRAPE_CONFIG.WORKFLOW_STEP_TIMEOUT_MS },
      async () => {
        const stepStart = Date.now();
        console.log(`[Step 11 - START] Updating GalleryAgent state`);

        const galleryAgent = await getAgentByName(
          this.env.GalleryAgent,
          galleryId
        );
        await galleryAgent.updateScrapingResult({
          success: true,
          timestamp: Date.now()
        });

        console.log(
          `[Step 11 - DONE] ✅ Agent: Updated scraping status - ${Date.now() - stepStart}ms`
        );
      }
    );

    const totalTime = Date.now() - workflowStartTime;
    const result = {
      galleryId,
      url,
      ok: true,
      gallery: gallery,
      eventsCount: extracted.events.length,
      artistsCount: extracted.artists.length,
      pagesScraped: crawledPages.length,
      completedAt: Date.now()
    };

    console.log(
      `[WORKFLOW END] ✅ Completed in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`
    );
    console.log(
      `[WORKFLOW SUMMARY] ${crawledPages.length} pages → ${extracted.events.length} events, ${extracted.artists.length} artists`
    );

    return result;
  }
}
