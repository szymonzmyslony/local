// src/agents/gallery.ts
import { Agent } from "agents";

type GalleryState = {
    url: string;
    lastScraped: number | null;
    htmlLength: number;
    workflowId: string | null;
};

export class GalleryAgent extends Agent<Env, GalleryState> {
    initialState: GalleryState = {
        url: "",
        lastScraped: null,
        htmlLength: 0,
        workflowId: null
    };

    async onRequest(request: Request): Promise<Response> {
        // Initialize state on first request
        if (!this.state.url) {
            this.setState({ url: this.name, lastScraped: null, htmlLength: 0, workflowId: null });
        }

        if (request.method === "GET") {
            return Response.json({ ok: true, agent: "GalleryAgent", state: this.state });
        }

        return new Response("Method not supported", { status: 405 });
    }

    /**
     * Triggers the scraping workflow for this gallery
     * This method is called by the CoordinatorAgent to start async scraping
     */
    async startScraping(url: string) {
        console.log(`[GalleryAgent:${this.name}] Starting scraping workflow for: ${url}`);

        try {
            // Create a workflow instance for this gallery's scraping task
            const instance = await this.env.SCRAPE_WORKFLOW.create({
                id: `${this.name}-${Date.now()}`,
                params: {
                    galleryId: this.name,
                    url
                }
            });

            // Update state to track the workflow
            this.setState({
                url,
                workflowId: instance.id,
                lastScraped: null, // Will be updated when workflow completes
                htmlLength: 0
            });

            console.log(`[GalleryAgent:${this.name}] Workflow created: ${instance.id}`);

            return {
                ok: true,
                workflowId: instance.id,
                message: "Scraping workflow started"
            };
        } catch (error) {
            console.error(`[GalleryAgent:${this.name}] Error starting workflow:`, error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }

    /**
     * Called by the workflow to update the agent's state after scraping completes
     */
    async updateScrapingResult(htmlLength: number, error?: string) {
        console.log(`[GalleryAgent:${this.name}] Updating scraping result`);

        this.setState({
            ...this.state,
            lastScraped: Date.now(),
            htmlLength: error ? 0 : htmlLength
        });

        return { ok: true };
    }
}

