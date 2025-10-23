// src/agents/coordinator.ts
import { Agent, getAgentByName } from "agents";
import { upsertGallery } from "../utils/db";
import type { Gallery } from "../schema";

type CoordinatorState = {
  city: string;
  initializedAt: number;
  managedGalleries: string[];
};

export class CoordinatorAgent extends Agent<Env, CoordinatorState> {
  initialState: CoordinatorState = {
    city: "",
    initializedAt: 0,
    managedGalleries: []
  };

  async onRequest(request: Request): Promise<Response> {
    if (!this.state.city) {
      this.setState({
        ...this.state,
        city: this.name,
        initializedAt: Date.now()
      });
    }

    if (request.method === "GET") {
      const galleries = await this.getAggregatedData();
      return Response.json({
        ok: true,
        city: this.state.city,
        galleries: galleries.data,
        totalEvents: galleries.totalEvents,
        totalPages: galleries.totalPages,
        allEvents: galleries.allEvents,
        allScrapedPages: galleries.allScrapedPages
      });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({ urls: [] }))) as {
        urls?: unknown;
      };
      const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
      const results = await this.bootstrap(urls);
      return Response.json({ ok: true, city: this.state.city, results });
    }

    return new Response("Method not supported", { status: 405 });
  }

  async bootstrap(urls: string[]) {
    const list = urls.filter((u) => typeof u === "string");
    const managedSet = new Set(this.state.managedGalleries);

    const results = [];
    for (const url of list) {
      const galleryId = url
        .replace(/https?:\/\//, "")
        .replace(/[^a-z0-9-]/gi, "-");

      if (managedSet.has(galleryId)) {
        console.log(`[Coordinator] Skipping ${galleryId} (already managed)`);
        results.push({
          galleryId,
          url,
          skipped: true,
          reason: "already managed"
        });
        continue;
      }

      console.log(`[Coordinator] Starting scrape for ${galleryId}`);

      // Create stub gallery in D1 to satisfy FK constraints
      const now = Date.now();
      const stubGallery: Gallery = {
        id: galleryId,
        name: galleryId, // Placeholder - workflow will update with real name
        website: url,
        galleryType: null,
        city: this.state.city || "Unknown",
        neighborhood: null,
        tz: "Europe/Warsaw",
        createdAt: now,
        updatedAt: now
      };

      console.log(`[Coordinator] Creating stub gallery in D1: ${galleryId}`);
      await upsertGallery(this.env.DB, galleryId, stubGallery);

      const galleryAgent = await getAgentByName(
        this.env.GalleryAgent,
        galleryId
      );
      const result = await galleryAgent.startScraping(url);
      console.log(`[Coordinator] Result:`, result);
      results.push({ galleryId, url, ...result });

      managedSet.add(galleryId);
    }

    this.setState({
      ...this.state,
      managedGalleries: Array.from(managedSet)
    });

    console.log(
      `[Coordinator] Processed ${results.length} galleries (${this.state.managedGalleries.length} total managed)`
    );
    return results;
  }

  async getAggregatedData() {
    const data = await Promise.all(
      this.state.managedGalleries.map(async (galleryId) => {
        const galleryAgent = await getAgentByName(
          this.env.GalleryAgent,
          galleryId
        );
        const result = await galleryAgent.getResults();
        return {
          id: galleryId,
          galleryId: result.galleryId,
          events: result.events,
          scrapedPages: result.scrapedPages,
          lastScraped: result.lastScraped,
          url: result.url
        };
      })
    );

    const allEvents = data.flatMap((d) => d.events);
    const allScrapedPages = data.flatMap((d) => d.scrapedPages);

    return {
      data,
      allEvents,
      allScrapedPages,
      totalEvents: allEvents.length,
      totalPages: allScrapedPages.length
    };
  }
}
