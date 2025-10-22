import { Agent } from "agents";
import type { Gallery, Event } from "../schema";

type GalleryState = {
    url: string;
    lastScraped: number;
    htmlLength: number;
    workflowId: string;
    cachedGallery: Gallery;
    cachedEvents: Event[];
    lastSuccessfulScrape: number;
};

export class GalleryAgent extends Agent<Env, GalleryState> {
    initialState: GalleryState = {
        url: "",
        lastScraped: 0,
        htmlLength: 0,
        workflowId: "",
        cachedGallery: { website: "" },
        cachedEvents: [],
        lastSuccessfulScrape: 0
    };

    async onRequest(request: Request): Promise<Response> {
        if (request.method === "GET") {
            return Response.json({
                ok: true,
                agent: "GalleryAgent",
                state: this.state,
                gallery: this.state.cachedGallery,
                events: this.state.cachedEvents
            });
        }

        return new Response("Method not supported", { status: 405 });
    }

    async startScraping(url: string, forceRefresh: boolean = false) {
        console.log(`[GalleryAgent:${this.name}] Starting scraping workflow for: ${url}`);

        const cacheThreshold = 3600000;

        if (!forceRefresh && this.state.lastSuccessfulScrape && (Date.now() - this.state.lastSuccessfulScrape) < cacheThreshold) {
            console.log(`[GalleryAgent:${this.name}] Returning cached results`);
            return {
                ok: true,
                cached: true,
                gallery: this.state.cachedGallery,
                events: this.state.cachedEvents,
                lastScraped: this.state.lastSuccessfulScrape
            };
        }

        const instance = await this.env.SCRAPE_WORKFLOW.create({
            id: `${this.name}-${Date.now()}`,
            params: {
                galleryId: this.name,
                url
            }
        });

        this.setState({
            ...this.state,
            url,
            workflowId: instance.id,
            lastScraped: Date.now()
        });

        console.log(`[GalleryAgent:${this.name}] Workflow created: ${instance.id}`);

        return {
            ok: true,
            cached: false,
            workflowId: instance.id,
            message: "Scraping workflow started"
        };
    }

    async updateScrapingResult(result: {
        gallery: Gallery;
        events: Event[];
        timestamp: number;
    }) {
        console.log(`[GalleryAgent:${this.name}] Updating scraping result`);

        this.setState({
            ...this.state,
            cachedGallery: result.gallery,
            cachedEvents: result.events,
            lastSuccessfulScrape: result.timestamp,
            lastScraped: result.timestamp
        });

        return { ok: true };
    }

    async getResults() {
        return {
            ok: true,
            gallery: this.state.cachedGallery,
            events: this.state.cachedEvents,
            lastScraped: this.state.lastSuccessfulScrape,
            url: this.state.url
        };
    }
}
