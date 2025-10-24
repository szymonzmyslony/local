import { routeAgentRequest } from "agents";
import extractionQueueConsumer from "./queues/extraction";
import type { ExtractionQueueBatch } from "./queues/extraction";

// Export Agent classes for Wrangler Durable Object bindings
export { CoordinatorAgent } from "./agents/coordinator";
export { GalleryAgent } from "./agents/gallery";

// Export workflow classes for Wrangler type generation
export {
  CrawlerWorkflow,
  GalleryInfoWorkflow,
  ArtistExtractionWorkflow,
  EventExtractionWorkflow
} from "./agents/workflows";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
  async queue(batch, env) {
    await extractionQueueConsumer.queue(batch as ExtractionQueueBatch, env);
  }
} satisfies ExportedHandler<Env>;
