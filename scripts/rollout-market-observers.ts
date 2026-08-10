import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const commandSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("activate_only"),
      market: z.enum(["ldn", "waw"]),
      observerUrl: z.string().url(),
      batchSize: z.number().int().min(1).max(10)
    })
    .strict(),
  z
    .object({
      mode: z.literal("activate_and_observe"),
      market: z.enum(["ldn", "waw"]),
      observerUrl: z.string().url(),
      batchSize: z.number().int().min(1).max(10)
    })
    .strict()
]);

const environmentSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    OBSERVER_ADMIN_TOKEN: z.string().min(1)
  })
  .strict();

const gallerySchema = z
  .object({
    id: z.string().uuid(),
    main_url: z.string().url(),
    observation_status: z.enum(["active", "paused", "failing", "archived"]),
    gallery_info: z
      .object({
        name: z.string().min(1),
        address: z.string().nullable(),
        area: z.string().nullable()
      })
      .strict()
  })
  .strict();

const registrationResponseSchema = z
  .object({ ok: z.literal(true), galleryId: z.string().uuid() })
  .strict();
const observationResponseSchema = z
  .object({ ok: z.literal(true), workflowId: z.string().min(1) })
  .strict();

const terminalStatuses = new Set(["unchanged", "completed", "partial", "failed"]);

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function locationFor(gallery: z.infer<typeof gallerySchema>) {
  const address = gallery.gallery_info.address?.trim();
  const area = gallery.gallery_info.area?.trim();
  if (address && area) return { kind: "known" as const, address, area };
  if (address) return { kind: "address_only" as const, address };
  if (area) return { kind: "area_only" as const, area };
  return { kind: "unknown" as const };
}

async function authorizedPost(
  observerUrl: string,
  token: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const response = await fetch(new URL(path, observerUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function main() {
  const commandText = process.argv[2];
  if (!commandText) {
    throw new Error(
      'Usage: bun run scripts/rollout-market-observers.ts \'{"mode":"activate_and_observe","market":"waw","observerUrl":"https://zine-observer.example.workers.dev","batchSize":5}\''
    );
  }
  const command = commandSchema.parse(JSON.parse(commandText));
  const env = environmentSchema.parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OBSERVER_ADMIN_TOKEN: process.env.OBSERVER_ADMIN_TOKEN
  });
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db
    .from("galleries")
    .select("id, main_url, observation_status, gallery_info!inner(name, address, area)")
    .eq("market", command.market)
    .neq("observation_status", "active")
    .order("id", { ascending: true });
  if (error) throw error;
  const galleries = z.array(gallerySchema).parse(data ?? []);
  console.log(
    JSON.stringify({ event: "rollout_started", market: command.market, galleries: galleries.length })
  );

  for (const batch of chunks(galleries, command.batchSize)) {
    const activated = await Promise.all(
      batch.map(async (gallery) => {
        const result = registrationResponseSchema.parse(
          await authorizedPost(
            command.observerUrl,
            env.OBSERVER_ADMIN_TOKEN,
            "/internal/galleries",
            {
              market: command.market,
              name: gallery.gallery_info.name,
              sources: { kind: "homepage", mainUrl: gallery.main_url },
              location: locationFor(gallery)
            }
          )
        );
        return { ...gallery, id: result.galleryId };
      })
    );
    console.log(
      JSON.stringify({
        event: "activation_batch_completed",
        galleries: activated.map((gallery) => gallery.gallery_info.name)
      })
    );

    if (command.mode === "activate_only") continue;

    const triggeredAfter = new Date(Date.now() - 2_000).toISOString();
    await Promise.all(
      activated.map(async (gallery) => {
        observationResponseSchema.parse(
          await authorizedPost(
            command.observerUrl,
            env.OBSERVER_ADMIN_TOKEN,
            "/internal/observe",
            { mode: "force_extract", galleryId: gallery.id }
          )
        );
      })
    );
    const deadline = Date.now() + 15 * 60 * 1000;
    let finalRuns: Array<{
      gallery_id: string;
      status: string;
      candidates_found: number;
      events_published: number;
      error: string | null;
      started_at: string;
    }> = [];
    while (Date.now() < deadline) {
      const { data: runRows, error: runError } = await db
        .from("observation_runs")
        .select(
          "gallery_id, status, candidates_found, events_published, error, started_at"
        )
        .in(
          "gallery_id",
          activated.map((gallery) => gallery.id)
        )
        .gte("started_at", triggeredAfter)
        .order("started_at", { ascending: false });
      if (runError) throw runError;
      const latestByGallery = new Map<string, (typeof finalRuns)[number]>();
      for (const row of runRows ?? []) {
        if (!latestByGallery.has(row.gallery_id)) latestByGallery.set(row.gallery_id, row);
      }
      finalRuns = [...latestByGallery.values()];
      if (
        activated.every((gallery) => {
          const run = latestByGallery.get(gallery.id);
          return run ? terminalStatuses.has(run.status) : false;
        })
      ) {
        break;
      }
      console.log(
        JSON.stringify({
          event: "observation_batch_waiting",
          completed: finalRuns.filter((run) => terminalStatuses.has(run.status)).length,
          total: activated.length
        })
      );
      await Bun.sleep(10_000);
    }
    if (finalRuns.length !== activated.length) {
      throw new Error(
        `Observation batch timed out: ${finalRuns.length}/${activated.length} runs were created`
      );
    }
    console.log(
      JSON.stringify({
        event: "observation_batch_completed",
        runs: finalRuns.map((run) => ({
          galleryId: run.gallery_id,
          status: run.status,
          candidates: run.candidates_found,
          published: run.events_published,
          error: run.error
        }))
      })
    );
  }

  console.log(
    JSON.stringify({ event: "rollout_completed", market: command.market, galleries: galleries.length })
  );
}

await main();
