import { Agent } from "agents";
import { getEventsByGallery, getScrapedPagesByGallery } from "../utils/db";
import type { ScrapedPage, Event } from "@/schema";

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
          const instance = await this.env.SCRAPE_WORKFLOW.get(this.state.workflowId);
          const status = await instance.status();
          return Response.json({ ok: true, workflowId: this.state.workflowId, status });
        } catch (error) {
          return Response.json({ ok: false, error: `Failed to get workflow status: ${error}` }, { status: 500 });
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
    const cacheThreshold = 60 * 60 * 1000; // 1 hour
    if (!forceRefresh && this.state.lastSuccessfulScrape && Date.now() - this.state.lastSuccessfulScrape < cacheThreshold) {
      return { ok: true, cached: true, lastScraped: this.state.lastSuccessfulScrape };
    }

    const instance = await this.env.SCRAPE_WORKFLOW.create({
      id: `${this.name}-${Date.now()}`,
      params: { galleryId: this.name, url }
    });

    this.setState({ ...this.state, url, workflowId: instance.id, lastScraped: Date.now(), status: "scraping" });
    return { ok: true, cached: false, workflowId: instance.id, message: "Scraping workflow started" };
  }

  async updateScrapingResult(result: { success: boolean; timestamp: number }) {
    this.setState({ ...this.state, lastSuccessfulScrape: result.timestamp, status: result.success ? "idle" : "failed" });
    return { ok: true };
  }

  async getResults(): Promise<{ ok: boolean; galleryId: string; events: Event[]; scrapedPages: ScrapedPage[]; lastScraped: number; url: string }> {
    const events = await getEventsByGallery(this.env, this.name);
    const scrapedPages = await getScrapedPagesByGallery(this.env, this.name);
    return { ok: true, galleryId: this.name, events, scrapedPages, lastScraped: this.state.lastSuccessfulScrape, url: this.state.url };
  }
}