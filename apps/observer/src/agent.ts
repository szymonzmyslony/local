import { createZineLanguageModel } from "@gallery-agents/shared";
import {
  Think,
  type ThinkScheduledTasks
} from "@cloudflare/think";
import { getAgentByName } from "agents";
import { tool } from "ai";
import { z } from "zod";
import { browserLinks, fetchSource } from "./fetching";
import {
  beginObservationRun,
  completeObservationRun,
  listActiveLondonGalleries,
  loadGalleryBundle,
  observerDatabase,
  persistObservation,
  recordSnapshot,
  stateForGallery,
  summarizeObservationRun
} from "./repository";
import {
  galleryObserverStateSchema,
  type GalleryObserverState,
  type GallerySource,
  type ObservationExtraction
} from "./schemas";
import {
  assertAllowedSourceUrl,
  stableMinute,
  workflowInstanceId
} from "./url";

const INITIAL_OBSERVER_STATE: GalleryObserverState = {
  configured: false,
  galleryId: null,
  name: null,
  market: "ldn",
  timezone: "Europe/London",
  status: "paused",
  sources: [],
  lastWorkflowId: null,
  lastObservedAt: null
};

export class GalleryObserver extends Think<Env, GalleryObserverState> {
  override initialState = INITIAL_OBSERVER_STATE;
  override includeMcpTools = false;
  override workspaceBash = false;
  override maxSteps = 5;

  override getModel() {
    return createZineLanguageModel(this.env.OPENROUTER_API_KEY);
  }

  override getDefaultTimezone() {
    return "Europe/London";
  }

  override getSystemPrompt() {
    return [
      "You are a careful observation agent for one London gallery.",
      "Use only the gallery's allowlisted official sources.",
      "Extract exhibitions and public events supported by explicit page evidence.",
      "Never invent dates, artists, venues, prices, or URLs.",
      "Prefer null and a lower confidence when a fact is ambiguous.",
      "Dates must be ISO 8601 with a UTC offset; interpret London civil time in Europe/London.",
      "A discovered source must be on the same origin as an existing official source."
    ].join("\n");
  }

  override getTools() {
    const allowed = this.state.sources.map((source) => source.normalizedUrl);
    return {
      read_official_source: tool({
        description: "Render and read one allowlisted official gallery URL as Markdown.",
        inputSchema: z.object({ url: z.string().url() }),
        execute: async ({ url }) => {
          const normalized = assertAllowedSourceUrl(url, allowed);
          const source = this.state.sources.find(
            (entry) => new URL(entry.normalizedUrl).origin === new URL(normalized).origin
          );
          if (!source) throw new Error("No matching source configuration");
          const snapshot = await fetchSource(this.env.BROWSER, {
            ...source,
            normalizedUrl: normalized,
            url: normalized,
            strategy: "browser_markdown"
          });
          return snapshot.content.slice(0, 60_000);
        }
      }),
      list_official_links: tool({
        description: "List links on one allowlisted official gallery URL.",
        inputSchema: z.object({ url: z.string().url() }),
        execute: async ({ url }) => {
          const normalized = assertAllowedSourceUrl(url, allowed);
          return browserLinks(this.env.BROWSER, normalized);
        }
      })
    };
  }

  override getScheduledTasks(): ThinkScheduledTasks {
    if (!this.state.configured || !this.state.galleryId || this.state.status !== "active") {
      return {};
    }
    const minute = stableMinute(this.state.galleryId);
    const schedules = [
      "every day at 02:15 in Europe/London",
      "every day at 03:15 in Europe/London",
      "every day at 04:15 in Europe/London",
      "every day at 05:15 in Europe/London"
    ] as const;
    const schedule = schedules[Math.floor((minute - 120) / 60)] ?? schedules[0];
    return {
      observeOfficialSources: {
        schedule,
        retry: { maxAttempts: 3 },
        metadata: { galleryId: this.state.galleryId, market: "ldn" },
        handler: async ({ idempotencyKey, scheduledFor }) => {
          await this.startObservation(idempotencyKey, scheduledFor);
        }
      }
    };
  }

  async configureGallery(galleryId: string): Promise<GalleryObserverState> {
    const next = galleryObserverStateSchema.parse(
      await stateForGallery(observerDatabase(this.env), galleryId)
    );
    this.setState({
      ...next,
      lastWorkflowId: this.state.lastWorkflowId,
      lastObservedAt: this.state.lastObservedAt
    });
    await this.internal_reconcileScheduledTasks();
    return this.state;
  }

  async getConfiguration(): Promise<GalleryObserverState> {
    return this.state;
  }

  async startObservation(idempotencyKey: string, scheduledFor = Date.now()) {
    if (!this.state.galleryId || this.state.status !== "active") {
      throw new Error("Gallery observer is not active");
    }
    // Cloudflare Workflow IDs accept a narrower character set than Think's
    // scheduled-task keys. Keep the original key in the durable payload and
    // run ledger, but derive a deterministic hex ID for the workflow instance.
    const instanceId = await workflowInstanceId(idempotencyKey);
    const workflowId = await this.runWorkflow(
      "GALLERY_OBSERVATION",
      {
        galleryId: this.state.galleryId,
        idempotencyKey,
        scheduledFor
      },
      {
        id: instanceId,
        metadata: { galleryId: this.state.galleryId, market: "ldn" }
      }
    );
    this.setState({ ...this.state, lastWorkflowId: workflowId });
    return workflowId;
  }

  async beginRun(input: { idempotencyKey: string; scheduledFor: number }) {
    if (!this.state.galleryId) throw new Error("Gallery observer is not configured");
    return beginObservationRun(observerDatabase(this.env), {
      galleryId: this.state.galleryId,
      idempotencyKey: input.idempotencyKey,
      scheduledFor: input.scheduledFor,
      workflowId: this.state.lastWorkflowId ?? undefined
    });
  }

  async fetchAndArchive(runId: string, source: GallerySource) {
    if (!this.state.galleryId) throw new Error("Gallery observer is not configured");
    const allowedUrl = assertAllowedSourceUrl(
      source.normalizedUrl,
      this.state.sources.map((entry) => entry.normalizedUrl)
    );
    const db = observerDatabase(this.env);
    const { sources } = await loadGalleryBundle(db, this.state.galleryId);
    const current = sources.find((entry) => entry.id === source.id);
    if (!current) throw new Error(`Gallery source not found: ${source.id}`);
    const snapshot = await fetchSource(this.env.BROWSER, {
      ...source,
      normalizedUrl: allowedUrl
    });
    const changed = current.last_content_hash !== snapshot.contentHash;
    const date = new Date().toISOString().slice(0, 10);
    const r2Key = ["ldn", this.state.galleryId, date, runId, `${source.id}.txt`].join("/");
    await this.env.SNAPSHOTS.put(r2Key, snapshot.content, {
      httpMetadata: { contentType: snapshot.contentType },
      customMetadata: {
        galleryId: this.state.galleryId,
        sourceId: source.id,
        sourceUrl: allowedUrl,
        contentHash: snapshot.contentHash,
        strategy: source.strategy
      }
    });
    await recordSnapshot(db, {
      runId,
      source,
      r2Key,
      contentHash: snapshot.contentHash,
      contentType: snapshot.contentType,
      byteLength: snapshot.byteLength,
      httpStatus: snapshot.httpStatus,
      changed,
      browserMs: snapshot.browserMs
    });
    return { ...snapshot, content: snapshot.content.slice(0, 75_000), changed, r2Key };
  }

  async saveExtraction(
    runId: string,
    source: GallerySource,
    extraction: ObservationExtraction
  ) {
    return persistObservation(observerDatabase(this.env), this.env, {
      runId,
      state: this.state,
      source,
      extraction
    });
  }

  async summarizeRun(runId: string) {
    return summarizeObservationRun(observerDatabase(this.env), runId);
  }

  async finishRun(
    runId: string,
    result: Parameters<typeof completeObservationRun>[2]
  ) {
    await completeObservationRun(observerDatabase(this.env), runId, result);
    this.setState({ ...this.state, lastObservedAt: new Date().toISOString() });
  }
}

type LondonScoutState = {
  configured: boolean;
  market: "ldn";
  lastReconciledAt: string | null;
};

export class LondonScout extends Think<Env, LondonScoutState> {
  override initialState: LondonScoutState = {
    configured: false,
    market: "ldn",
    lastReconciledAt: null
  };
  override includeMcpTools = false;
  override workspaceBash = false;

  override getModel() {
    return createZineLanguageModel(this.env.OPENROUTER_API_KEY);
  }

  override getDefaultTimezone() {
    return "Europe/London";
  }

  override getScheduledTasks(): ThinkScheduledTasks {
    if (!this.state.configured) return {};
    return {
      reconcileObservers: {
        schedule: "every day at 01:15 in Europe/London",
        retry: { maxAttempts: 3 },
        handler: async () => {
          await this.reconcileObservers();
        }
      },
      weeklyCoverageAudit: {
        schedule: "every week on monday at 01:45 in Europe/London",
        retry: { maxAttempts: 3 },
        handler: async () => {
          await this.reconcileObservers();
        }
      }
    };
  }

  async activateScout() {
    this.setState({ ...this.state, configured: true });
    await this.internal_reconcileScheduledTasks();
    return this.state;
  }

  async reconcileObservers() {
    const galleryIds = await listActiveLondonGalleries(observerDatabase(this.env));
    for (const galleryId of galleryIds) {
      const observer = await getAgentByName<Env, GalleryObserver>(
        this.env.GalleryObserver,
        galleryId
      );
      await observer.configureGallery(galleryId);
    }
    this.setState({
      ...this.state,
      lastReconciledAt: new Date().toISOString()
    });
    return { configured: galleryIds.length };
  }
}
