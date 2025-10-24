// agents/coordinator.ts
import { Agent, getAgentByName } from "agents";
import { upsertGallery } from "../utils/db";

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
      this.setState({ ...this.state, city: this.name, initializedAt: Date.now() });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({ urls: [], force: false }))) as { urls?: unknown; force?: unknown };
      const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
      const force = typeof body?.force === "boolean" ? (body.force as boolean) : false;
      const results = await this.bootstrap(urls, force);
      return Response.json({ ok: true, city: this.state.city, results });
    }

    return new Response("Method not supported", { status: 405 });
  }

  async bootstrap(urls: string[], force: boolean) {
    console.log('[coordinator] bootstrap start', { city: this.state.city || this.name, urls: urls.length, force });
    const list = urls.filter((u) => typeof u === "string");
    const managedSet = new Set(this.state.managedGalleries);
    const results: Array<Record<string, unknown>> = [];

    for (const url of list) {
      const galleryId = url.replace(/https?:\/\//, "").replace(/[^a-z0-9-]/gi, "-");

      if (managedSet.has(galleryId) && !force) {
        console.log('[coordinator] skip gallery (already managed)', { galleryId, url });
        results.push({ galleryId, url, skipped: true, reason: "already managed" });
        continue;
      }

      // Create stub gallery to satisfy FKs; ScrapeWorkflow will overwrite real data
      console.log('[coordinator] upsert stub gallery', { galleryId, url });
      await upsertGallery(this.env, galleryId, {
        name: galleryId,
        website: url,
        gallery_type: null,
        city: this.state.city || "Unknown",
        tz: "Europe/Warsaw"
      });

      const galleryAgent = await getAgentByName(this.env.GalleryAgent, galleryId);
      console.log('[coordinator] delegate to gallery agent', { galleryId, force });
      const result = await galleryAgent.startScraping(url, force);
      results.push({ galleryId, url, ...result });
      managedSet.add(galleryId);
    }

    this.setState({ ...this.state, managedGalleries: Array.from(managedSet) });
    console.log('[coordinator] bootstrap complete', { managedCount: managedSet.size, results: results.length });
    return results;
  }
}