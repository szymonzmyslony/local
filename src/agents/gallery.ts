// agents/gallery.ts
import { Agent } from "agents";
import { getEventsByGallery, getScrapedPagesByGallery } from "../utils/db";
import type { ScrapedPage, Event } from "@/schema";

const RECRAWL_TTL_MS: Record<string, number> = {
  event: 6 * 60 * 60 * 1000, // 6h
  artists: 7 * 24 * 60 * 60 * 1000, // 7d
  creator_info: 30 * 24 * 60 * 60 * 1000, // 30d
  historical_event: 90 * 24 * 60 * 60 * 1000, // 90d
  other: 7 * 24 * 60 * 60 * 1000 // 7d
};

function isDue(page: ScrapedPage): boolean {
  const cls = page.classification || "other";
  const ttl = RECRAWL_TTL_MS[cls] ?? RECRAWL_TTL_MS.other;
  return Date.now() - page.scraped_at > ttl;
}

type GalleryState = {
  url: string;
  workflowId: string;
  lastScraped: number;
  lastSuccessfulScrape: number;
  status: "idle" | "scraping" | "failed";
  errorMessage?: string;
};

export class GalleryAgent extends Agent<Env, GalleryState> {
  initialState: GalleryState = {
    url: "",
    workflowId: "",
    lastScraped: 0,
    lastSuccessfulScrape: 0,
    status: "idle"
  };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.searchParams.has("workflow") && this.state.workflowId) {
        try {
          const instance = await this.env.CRAWLER_WORKFLOW.get(
            this.state.workflowId
          );
          const status = await instance.status();
          return Response.json({
            ok: true,
            workflowId: this.state.workflowId,
            status
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: `Failed to get workflow status: ${error}` },
            { status: 500 }
          );
        }
      }

      const events = await getEventsByGallery(this.env, this.name);
      const scrapedPages = await getScrapedPagesByGallery(this.env, this.name);

      return Response.json({
        ok: true,
        agent: "GalleryAgent",
        galleryId: this.name,
        url: this.state.url,
        status: this.state.status,
        lastScraped: this.state.lastScraped,
        lastSuccessfulScrape: this.state.lastSuccessfulScrape,
        workflowId: this.state.workflowId,
        events,
        scrapedPages
      });
    }

    return new Response("Method not supported", { status: 405 });
  }

  async startScraping(url: string, forceRefresh: boolean = false) {
    console.log("[gallery-agent] startScraping called", {
      galleryId: this.name,
      url,
      forceRefresh
    });
    // classification-aware scheduling
    if (!forceRefresh) {
      const pages = await getScrapedPagesByGallery(this.env, this.name);
      const anyDue = pages.length === 0 || pages.some(isDue);
      console.log("[gallery-agent] scheduling decision", {
        galleryId: this.name,
        pages: pages.length,
        anyDue,
        lastSuccessfulScrape: this.state.lastSuccessfulScrape
      });
      if (!anyDue) {
        console.log("[gallery-agent] skip starting workflow (nothing due)", {
          galleryId: this.name
        });
        return {
          ok: true,
          cached: true,
          lastScraped: this.state.lastSuccessfulScrape,
          reason: "nothing due"
        };
      }
    }

    const instance = await this.env.CRAWLER_WORKFLOW.create({
      id: `${this.name}-${Date.now()}`,
      params: { galleryId: this.name, url }
    });

    this.setState({
      ...this.state,
      url,
      workflowId: instance.id,
      lastScraped: Date.now(),
      status: "scraping"
    });
    console.log("[gallery-agent] workflow started", {
      galleryId: this.name,
      workflowId: instance.id
    });
    return {
      ok: true,
      cached: false,
      workflowId: instance.id,
      message: "Scraping workflow started"
    };
  }

  async updateScrapingResult(result: { success: boolean; timestamp: number }) {
    this.setState({
      ...this.state,
      lastSuccessfulScrape: result.timestamp,
      status: result.success ? "idle" : "failed"
    });
    return { ok: true };
  }

  async getResults(): Promise<{
    ok: boolean;
    galleryId: string;
    events: Event[];
    scrapedPages: ScrapedPage[];
    lastScraped: number;
    url: string;
  }> {
    const events = await getEventsByGallery(this.env, this.name);
    const scrapedPages = await getScrapedPagesByGallery(this.env, this.name);
    return {
      ok: true,
      galleryId: this.name,
      events,
      scrapedPages,
      lastScraped: this.state.lastSuccessfulScrape,
      url: this.state.url
    };
  }
}
