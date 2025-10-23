import { routeAgentRequest } from "agents";

// Export Agent classes for Wrangler Durable Object bindings
export { CoordinatorAgent } from "./agents/coordinator";
export { GalleryAgent } from "./agents/gallery";

// Export workflow classes for Wrangler type generation
export { ScrapeWorkflow } from "./agents/workflows";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
