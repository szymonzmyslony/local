import { createZineLanguageModel } from "@gallery-agents/shared";
import type { MarketCode } from "@gallery-agents/shared";
import { getAgentByName, routeAgentRequest } from "agents";
import { generateText } from "ai";
import { GalleryObserver, LondonScout } from "./agent";
import { evaluateFixture } from "./evaluation";
import { LONDON_EVAL_FIXTURES } from "./london-fixtures";
import {
  observerDatabase,
  recentObservationRuns,
  registerMarketGallery
} from "./repository";
import {
  bootstrapRequestSchema,
  directoryDiscoveryRequestSchema,
  evaluationRequestSchema,
  observeRequestSchema,
  registerGallerySchema
} from "./schemas";
import { GalleryObservationWorkflow } from "./workflow";
import { WARSAW_EVAL_FIXTURES } from "./warsaw-fixtures";

export { GalleryObserver, GalleryObservationWorkflow, LondonScout };

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "observer_request_error", message }));
  return Response.json({ ok: false, error: message }, { status });
}

async function isAuthorized(request: Request, env: Env) {
  if (!env.OBSERVER_ADMIN_TOKEN) return false;
  const encoder = new TextEncoder();
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest(
      "SHA-256",
      encoder.encode(request.headers.get("authorization") ?? "")
    ),
    crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`Bearer ${env.OBSERVER_ADMIN_TOKEN}`)
    )
  ]);
  const providedBytes = new Uint8Array(provided);
  const expectedBytes = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function fixturesForMarket(market: MarketCode) {
  return market === "waw" ? WARSAW_EVAL_FIXTURES : LONDON_EVAL_FIXTURES;
}

async function seedFixtures(env: Env, market: MarketCode) {
  const db = observerDatabase(env);
  const galleryIds: string[] = [];
  for (const fixture of fixturesForMarket(market)) {
    const input = registerGallerySchema.parse({
      market,
      name: fixture.name,
      sources: {
        kind: "homepage_and_events",
        mainUrl: fixture.mainUrl,
        eventsUrl: fixture.eventsUrl
      },
      location: { kind: "area_only", area: fixture.area }
    });
    const galleryId = await registerMarketGallery(db, input);
    galleryIds.push(galleryId);
  }
  const scout = await getAgentByName<Env, LondonScout>(env.LondonScout, market);
  await scout.activateScout(market);
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
        markets: ["ldn", "waw"],
        model: "openai/gpt-5.6-luna",
        architecture: "agent-per-gallery"
      });
    }

    if (
      url.pathname.startsWith("/internal/") &&
      !(await isAuthorized(request, env))
    ) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    try {
      if (request.method === "POST" && url.pathname === "/internal/bootstrap") {
        const body = bootstrapRequestSchema.parse(await request.json());
        const markets: MarketCode[] =
          body.mode === "all_markets" ? ["ldn", "waw"] : [body.market];
        const seeded = [];
        for (const market of markets) {
          const galleryIds = await seedFixtures(env, market);
          seeded.push({ market, count: galleryIds.length, galleryIds });
        }
        return Response.json({ ok: true, seeded });
      }

      if (request.method === "POST" && url.pathname === "/internal/galleries") {
        const body = registerGallerySchema.parse(await request.json());
        const galleryId = await registerMarketGallery(
          observerDatabase(env),
          body
        );
        const observer = await getAgentByName<Env, GalleryObserver>(
          env.GalleryObserver,
          galleryId
        );
        await observer.configureGallery(galleryId);
        return Response.json({ ok: true, galleryId });
      }

      if (request.method === "POST" && url.pathname === "/internal/discover") {
        const body = directoryDiscoveryRequestSchema.parse(
          await request.json()
        );
        const scout = await getAgentByName<Env, LondonScout>(
          env.LondonScout,
          body.market
        );
        await scout.activateScout(body.market);
        const discovery = await scout.discoverMarketGalleries(body.mode);
        const reconciliation = await scout.reconcileObservers();
        return Response.json({ ok: true, discovery, reconciliation });
      }

      if (request.method === "POST" && url.pathname === "/internal/observe") {
        const body = observeRequestSchema.parse(await request.json());
        const observer = await getAgentByName<Env, GalleryObserver>(
          env.GalleryObserver,
          body.galleryId
        );
        await observer.configureGallery(body.galleryId);
        const key =
          body.mode === "change_only"
            ? `manual:${body.galleryId}:${new Date().toISOString().slice(0, 10)}`
            : `manual:${body.galleryId}:${crypto.randomUUID()}`;
        const workflowId = await observer.startObservation(
          key,
          Date.now(),
          body.mode === "profile_refresh"
            ? { kind: "profile_refresh" }
            : body.mode === "force_extract"
            ? { kind: "force_extract" }
            : body.mode === "unchecked_only"
              ? { kind: "unchecked_only" }
              : { kind: "change_only" }
        );
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
        const body = evaluationRequestSchema.parse(await request.json());
        const marketFixtures = fixturesForMarket(body.market);
        const ids = new Set(
          body.mode === "selected"
            ? body.fixtureIds
            : marketFixtures.slice(0, 3).map((fixture) => fixture.id)
        );
        const fixtures = marketFixtures.filter((fixture) =>
          ids.has(fixture.id)
        );
        const techniques =
          body.mode === "selected"
            ? body.techniques
            : (["browser_markdown", "http_html"] as const);
        const results = [];
        for (const fixture of fixtures) {
          for (const technique of techniques) {
            results.push(await evaluateFixture(env, fixture, technique));
          }
        }
        return Response.json({ ok: true, results });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/internal/diagnostics"
      ) {
        const dbStarted = Date.now();
        const { error } = await observerDatabase(env)
          .from("galleries")
          .select("id", { count: "exact", head: true })
          .in("market", ["ldn", "waw"]);
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
