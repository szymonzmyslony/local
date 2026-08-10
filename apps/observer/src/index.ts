import { createZineLanguageModel } from "@gallery-agents/shared";
import { getAgentByName, routeAgentRequest } from "agents";
import { generateText } from "ai";
import { GalleryObserver, LondonScout } from "./agent";
import { evaluateFixture } from "./evaluation";
import { LONDON_EVAL_FIXTURES } from "./london-fixtures";
import {
  observerDatabase,
  recentObservationRuns,
  registerLondonGallery
} from "./repository";
import { observeRequestSchema, registerGallerySchema } from "./schemas";
import { GalleryObservationWorkflow } from "./workflow";

export { GalleryObserver, GalleryObservationWorkflow, LondonScout };

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "observer_request_error", message }));
  return Response.json({ ok: false, error: message }, { status });
}

function isAuthorized(request: Request, env: Env) {
  const header = request.headers.get("authorization");
  return Boolean(
    env.OBSERVER_ADMIN_TOKEN && header === `Bearer ${env.OBSERVER_ADMIN_TOKEN}`
  );
}

async function seedFixtures(env: Env) {
  const db = observerDatabase(env);
  const galleryIds: string[] = [];
  for (const fixture of LONDON_EVAL_FIXTURES) {
    const galleryId = await registerLondonGallery(db, {
      mainUrl: fixture.mainUrl,
      eventsUrl: fixture.eventsUrl,
      name: fixture.name,
      area: fixture.area
    });
    galleryIds.push(galleryId);
  }
  const scout = await getAgentByName<Env, LondonScout>(env.LondonScout, "ldn");
  await scout.activateScout();
  await scout.reconcileObservers();
  return galleryIds;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: Boolean(
          env.OPENROUTER_API_KEY &&
            env.SUPABASE_URL &&
            env.SUPABASE_SERVICE_ROLE_KEY &&
            env.OBSERVER_ADMIN_TOKEN
        ),
        service: "zine-observer",
        market: "ldn",
        model: "openai/gpt-5.6-luna",
        architecture: "agent-per-gallery"
      });
    }

    if (url.pathname.startsWith("/internal/") && !isAuthorized(request, env)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      if (request.method === "POST" && url.pathname === "/internal/bootstrap") {
        const galleryIds = await seedFixtures(env);
        return Response.json({ ok: true, seeded: galleryIds.length, galleryIds });
      }

      if (request.method === "POST" && url.pathname === "/internal/galleries") {
        const body = registerGallerySchema.parse(await request.json());
        const galleryId = await registerLondonGallery(observerDatabase(env), body);
        const observer = await getAgentByName<Env, GalleryObserver>(
          env.GalleryObserver,
          galleryId
        );
        await observer.configureGallery(galleryId);
        return Response.json({ ok: true, galleryId });
      }

      if (request.method === "POST" && url.pathname === "/internal/observe") {
        const body = observeRequestSchema.parse(await request.json());
        const observer = await getAgentByName<Env, GalleryObserver>(
          env.GalleryObserver,
          body.galleryId
        );
        await observer.configureGallery(body.galleryId);
        const key = body.force
          ? `manual:${body.galleryId}:${crypto.randomUUID()}`
          : `manual:${body.galleryId}:${new Date().toISOString().slice(0, 10)}`;
        const workflowId = await observer.startObservation(key, Date.now());
        return Response.json({ ok: true, workflowId });
      }

      if (request.method === "GET" && url.pathname === "/internal/runs") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        return Response.json({
          ok: true,
          runs: await recentObservationRuns(observerDatabase(env), limit)
        });
      }

      if (request.method === "POST" && url.pathname === "/internal/evaluate") {
        const body = (await request.json()) as {
          fixtureIds?: string[];
          techniques?: Array<"browser_markdown" | "http_html">;
        };
        const ids = new Set(body.fixtureIds ?? LONDON_EVAL_FIXTURES.slice(0, 3).map((f) => f.id));
        const fixtures = LONDON_EVAL_FIXTURES.filter((fixture) => ids.has(fixture.id));
        const techniques = body.techniques ?? ["browser_markdown", "http_html"];
        const results = [];
        for (const fixture of fixtures) {
          for (const technique of techniques) {
            results.push(await evaluateFixture(env, fixture, technique));
          }
        }
        return Response.json({ ok: true, results });
      }

      if (request.method === "POST" && url.pathname === "/internal/diagnostics") {
        const dbStarted = Date.now();
        const { error } = await observerDatabase(env)
          .from("galleries")
          .select("id", { count: "exact", head: true })
          .eq("market", "ldn");
        if (error) throw error;
        const modelStarted = Date.now();
        const { text } = await generateText({
          model: createZineLanguageModel(env.OPENROUTER_API_KEY),
          prompt: "Reply with exactly: zine-ok",
          maxOutputTokens: 16,
          maxRetries: 0
        });
        return Response.json({
          ok: text.trim().toLowerCase().includes("zine-ok"),
          checks: {
            supabase: { ok: true, durationMs: modelStarted - dbStarted },
            openrouterLuna: {
              ok: text.trim().toLowerCase().includes("zine-ok"),
              durationMs: Date.now() - modelStarted
            },
            r2: { configured: Boolean(env.SNAPSHOTS) },
            browserRun: { configured: Boolean(env.BROWSER) }
          }
        });
      }
    } catch (error) {
      return jsonError(error, error instanceof SyntaxError ? 400 : 500);
    }

    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;
    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
