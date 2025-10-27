/// <reference path="../worker-configuration.d.ts" />

declare global {
	interface Env {
		ASSETS?: {
			fetch: typeof fetch;
		};
		SOURCE_PRODUCER: Queue;
		GOLDEN_PRODUCER: Queue;
		SUPABASE_URL: string;
		SUPABASE_SERVICE_ROLE_KEY?: string;
		SUPABASE_ANON_KEY?: string;
	}
}

/**
 * Coordinator Worker - Admin Dashboard
 *
 * Routes:
 * - /health - Health check
 * - /api/* - Backend API routes (stats, crawl, curator, pages, golden, actions)
 * - /* - Frontend SPA (React app served from assets)
 */
export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === "/health") {
			return new Response("ok");
		}

		// API routes - TODO: implement route handlers
		if (url.pathname.startsWith("/api/")) {
			return handleApiRoutes(request, env);
		}

		// Serve static assets for React SPA
		const assets = env.ASSETS;
		if (assets) {
			const urlPath = url.pathname;

			// Serve index.html at root
			if (request.method === "GET" && (urlPath === "/" || urlPath === "")) {
				const indexResponse = await assets.fetch(
					new Request(new URL("/index.html", url.origin), request)
				);
				if (indexResponse.status !== 404) return indexResponse;
			}

			// Try to serve the requested asset
			const response = await assets.fetch(request);
			if (response.status !== 404) return response;

			// SPA fallback: serve index.html for all routes (React Router will handle)
			if (request.method === "GET") {
				const indexResponse = await assets.fetch(
					new Request(new URL("/index.html", url.origin), request)
				);
				if (indexResponse.status !== 404) return indexResponse;
			}
		}

		return new Response("Not found", { status: 404 });
	}
} satisfies ExportedHandler<Env>;

/**
 * Handle API routes
 * TODO: Implement route handlers for:
 * - GET /api/stats/overview
 * - GET /api/crawl/jobs
 * - POST /api/crawl/start
 * - GET /api/curator/queue
 * - POST /api/curator/merge
 * - POST /api/curator/dismiss
 * - GET /api/pages
 * - GET /api/golden/{type}
 * - POST /api/actions/*
 */
async function handleApiRoutes(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace("/api", "");

	// Placeholder response
	return new Response(
		JSON.stringify({
			message: "API endpoint not yet implemented",
			path: path,
		}),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
}
