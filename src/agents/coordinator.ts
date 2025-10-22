// src/agents/coordinator.ts
import { Agent, getAgentByName } from "agents";

type CoordinatorState = {
    city: string;
    initializedAt: number;
    lastBootstrapCount: number;
};

export class CoordinatorAgent extends Agent<Env, CoordinatorState> {
    initialState: CoordinatorState = {
        city: "",
        initializedAt: 0,
        lastBootstrapCount: 0
    };

    async onRequest(request: Request): Promise<Response> {

        if (request.method === "GET") {
            return Response.json({ ok: true, agent: "CoordinatorAgent", city: this.state.city });
        }

        if (request.method === "POST") {
            const body = await request.json().catch(() => ({ urls: [] })) as { urls?: unknown };
            const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
            await this.bootstrap(urls);
            return Response.json({ ok: true, started: true, city: this.state.city, count: urls.length });
        }

        return new Response("Method not supported", { status: 405 });
    }

    async bootstrap(urls: string[]) {
        const list = Array.isArray(urls) ? urls.filter((u) => typeof u === "string") : [];

        this.setState({ ...this.state, lastBootstrapCount: list.length });

        console.log(`[CoordinatorAgent:${this.name}] Bootstrapping ${list.length} galleries`);

        // Create a GalleryAgent for each URL and trigger its scraping workflow
        const results = [];
        for (const url of list) {
            // Extract a simple identifier from URL for the gallery agent name
            const galleryId = url.replace(/https?:\/\//, '').replace(/[^a-z0-9-]/gi, '-');

            console.log(`[CoordinatorAgent:${this.name}] Creating GalleryAgent: ${galleryId}`);

            // Get or create the GalleryAgent instance
            const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);

            // Trigger the GalleryAgent to start scraping (which will create a workflow)
            const result = await galleryAgent.startScraping(url);

            results.push({ galleryId, url, ...result });
        }

        console.log(`[CoordinatorAgent:${this.name}] Started scraping for ${results.length} galleries`);
        return results;
    }
}