import {
  createZineLanguageModel,
  getMarketConfig,
  type MarketCode
} from "@gallery-agents/shared";
import {
  Think,
  type ThinkScheduledTasks,
  type ThinkWallClockSchedule
} from "@cloudflare/think";
import { getAgentByName } from "agents";
import { generateText, Output, tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  browserLinks,
  fetchDiscoveryHtml,
  fetchSource,
  prepareContentForExtraction,
  selectProfileSourceUrls
} from "./fetching";
import {
  beginObservationRun,
  commitSourceSnapshot,
  completeObservationRun,
  listActiveMarketGalleries,
  loadGalleryBundle,
  observerDatabase,
  registerMarketGallery,
  persistObservation,
  persistGalleryProfile,
  recordSnapshot,
  recordSourceFailure,
  stateForGallery,
  summarizeObservationRun,
  upsertGallerySource
} from "./repository";
import {
  galleryObserverStateSchema,
  fallbackObservationExtractionSchema,
  fallbackGalleryProfileExtractionSchema,
  fromFallbackGalleryProfileExtraction,
  fromFallbackObservationExtraction,
  type ConfiguredGalleryObserverState,
  type GalleryObserverState,
  type GalleryProfileExtraction,
  type GallerySource,
  type ObservationExtraction
} from "./schemas";
import {
  assertAllowedSourceUrl,
  minuteToWallClock,
  stableMinute,
  workflowInstanceId
} from "./url";

const INITIAL_OBSERVER_STATE: GalleryObserverState = {
  kind: "unconfigured"
};

function configuredObserverState(
  state: unknown
): ConfiguredGalleryObserverState | null {
  const parsed = galleryObserverStateSchema.safeParse(state);
  return parsed.success && parsed.data.kind === "configured"
    ? parsed.data
    : null;
}

export class GalleryObserver extends Think<Env, GalleryObserverState> {
  override initialState = INITIAL_OBSERVER_STATE;
  override includeMcpTools = false;
  override workspaceBash = false;
  override maxSteps = 5;

  override getModel() {
    return createZineLanguageModel(this.env.OPENROUTER_API_KEY);
  }

  override getDefaultTimezone() {
    return configuredObserverState(this.state)?.market.timezone ?? "UTC";
  }

  override getSystemPrompt() {
    const configured = configuredObserverState(this.state);
    if (!configured) {
      return "You are a gallery observation agent waiting for configuration.";
    }
    const config = configured.market;
    return [
      `You are a careful observation agent for one ${config.city} gallery.`,
      "Use only the gallery's allowlisted official sources.",
      "Extract exhibitions and public events supported by explicit page evidence.",
      "Never invent dates, artists, venues, prices, or URLs.",
      "Prefer null and a lower confidence when a fact is ambiguous.",
      `Dates must be ISO 8601 with a UTC offset; interpret ${config.city} civil time in ${config.timezone}.`,
      `${config.language} source material is valid evidence; preserve official names.`,
      "A discovered source must be on the same origin as an existing official source."
    ].join("\n");
  }

  override getTools(): ToolSet {
    const configured = configuredObserverState(this.state);
    if (!configured) return {};
    const allowed = configured.sources.map((source) => source.normalizedUrl);
    return {
      read_official_source: tool({
        description:
          "Render and read one allowlisted official gallery URL as Markdown.",
        inputSchema: z.object({ url: z.string().url() }),
        execute: async ({ url }) => {
          const normalized = assertAllowedSourceUrl(url, allowed);
          const source = configured.sources.find(
            (entry) =>
              new URL(entry.normalizedUrl).origin === new URL(normalized).origin
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
    } satisfies ToolSet;
  }

  override getScheduledTasks(): ThinkScheduledTasks {
    const configured = configuredObserverState(this.state);
    if (configured?.status !== "active") {
      return {};
    }
    const galleryId = configured.galleryId;
    const market = configured.market;
    const schedule =
      `every day at ${minuteToWallClock(stableMinute(galleryId))}` as ThinkWallClockSchedule;
    const profileSchedule =
      `every week on monday at ${minuteToWallClock(stableMinute(`${galleryId}:profile`))}` as ThinkWallClockSchedule;
    return {
      observeOfficialSources: {
        schedule,
        timezone: market.timezone,
        retry: { maxAttempts: 3 },
        metadata: { galleryId, market: market.market },
        handler: async ({ idempotencyKey, scheduledFor }) => {
          await this.startObservation(idempotencyKey, scheduledFor, {
            kind: "change_only"
          });
        }
      },
      refreshOfficialProfile: {
        schedule: profileSchedule,
        timezone: market.timezone,
        retry: { maxAttempts: 3 },
        metadata: { galleryId, market: market.market },
        handler: async ({ idempotencyKey, scheduledFor }) => {
          await this.startObservation(idempotencyKey, scheduledFor, {
            kind: "profile_refresh"
          });
        }
      }
    };
  }

  async configureGallery(galleryId: string): Promise<GalleryObserverState> {
    const next = await this.refreshGallerySources(galleryId);
    await this.internal_reconcileScheduledTasks();
    return next;
  }

  async refreshGallerySources(
    galleryId: string
  ): Promise<GalleryObserverState> {
    const next = galleryObserverStateSchema.parse(
      await stateForGallery(observerDatabase(this.env), galleryId)
    );
    if (next.kind !== "configured")
      throw new Error("Gallery configuration is incomplete");
    const previous = configuredObserverState(this.state);
    this.setState({
      ...next,
      workflow:
        previous?.galleryId === galleryId ? previous.workflow : next.workflow,
      observation:
        previous?.galleryId === galleryId
          ? previous.observation
          : next.observation
    });
    return this.state;
  }

  async getConfiguration(): Promise<GalleryObserverState> {
    return this.state;
  }

  async discoverProfileSources(source: GallerySource): Promise<GalleryObserverState> {
    if (this.state.kind !== "configured") {
      throw new Error("Gallery observer is not configured");
    }
    const urls = selectProfileSourceUrls(
      await browserLinks(this.env.BROWSER, source.normalizedUrl),
      source.normalizedUrl
    );
    const db = observerDatabase(this.env);
    for (const url of urls) {
      await upsertGallerySource(
        db,
        this.state.galleryId,
        url,
        "about",
        "profile",
        1
      );
    }
    return this.refreshGallerySources(this.state.galleryId);
  }

  async startObservation(
    idempotencyKey: string,
    scheduledFor: number,
    mode:
      | { kind: "change_only" }
      | { kind: "force_extract" }
      | { kind: "unchecked_only" }
      | { kind: "profile_refresh" }
  ) {
    if (this.state.kind !== "configured" || this.state.status !== "active") {
      throw new Error("Gallery observer is not active");
    }
    const configured = this.state;
    // Cloudflare Workflow IDs accept a narrower character set than Think's
    // scheduled-task keys. Keep the original key in the durable payload and
    // run ledger, but derive a deterministic hex ID for the workflow instance.
    const instanceId = await workflowInstanceId(idempotencyKey);
    const workflowId = await this.runWorkflow(
      "GALLERY_OBSERVATION",
      {
        galleryId: configured.galleryId,
        idempotencyKey,
        scheduledFor,
        mode
      },
      {
        id: instanceId,
        metadata: {
          galleryId: configured.galleryId,
          market: configured.market.market
        }
      }
    );
    this.setState({ ...configured, workflow: { kind: "started", workflowId } });
    return workflowId;
  }

  async beginRun(input: { idempotencyKey: string; scheduledFor: number }) {
    if (this.state.kind !== "configured") {
      throw new Error("Gallery observer is not configured");
    }
    return beginObservationRun(observerDatabase(this.env), {
      galleryId: this.state.galleryId,
      idempotencyKey: input.idempotencyKey,
      scheduledFor: input.scheduledFor,
      workflowId:
        this.state.workflow.kind === "started"
          ? this.state.workflow.workflowId
          : undefined
    });
  }

  async fetchAndArchive(runId: string, source: GallerySource) {
    if (this.state.kind !== "configured") {
      throw new Error("Gallery observer is not configured");
    }
    const configured = this.state;
    const allowedUrl = assertAllowedSourceUrl(
      source.normalizedUrl,
      configured.sources.map((entry) => entry.normalizedUrl)
    );
    const db = observerDatabase(this.env);
    const { sources } = await loadGalleryBundle(db, configured.galleryId);
    const current = sources.find((entry) => entry.id === source.id);
    if (!current) throw new Error(`Gallery source not found: ${source.id}`);
    const snapshot = await fetchSource(this.env.BROWSER, {
      ...source,
      normalizedUrl: allowedUrl
    });
    const changed = current.last_content_hash !== snapshot.contentHash;
    const date = new Date().toISOString().slice(0, 10);
    const r2Key = [
      configured.market.market,
      configured.galleryId,
      date,
      runId,
      `${source.id}.txt`
    ].join("/");
    await this.env.SNAPSHOTS.put(r2Key, snapshot.content, {
      httpMetadata: { contentType: snapshot.contentType },
      customMetadata: {
        galleryId: configured.galleryId,
        sourceId: source.id,
        sourceUrl: allowedUrl,
        contentHash: snapshot.contentHash,
        strategy: snapshot.strategy
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
      strategy: snapshot.strategy,
      browserMs: snapshot.browserMs
    });
    return {
      ...snapshot,
      content: prepareContentForExtraction(snapshot.content),
      changed,
      r2Key
    };
  }

  async saveExtraction(
    runId: string,
    source: GallerySource,
    extraction: ObservationExtraction
  ) {
    if (this.state.kind !== "configured") {
      throw new Error("Gallery observer is not configured");
    }
    return persistObservation(observerDatabase(this.env), this.env, {
      runId,
      state: this.state,
      source,
      extraction
    });
  }

  async extractStructuredSnapshot(
    prompt: string
  ): Promise<ObservationExtraction> {
    const { output } = await generateText({
      model: this.getModel(),
      output: Output.object({ schema: fallbackObservationExtractionSchema }),
      prompt: [
        prompt,
        "SDK fallback transport: replace each event's venue object with required flat fields venue_scope, venue_detail, and venue_evidence. Use empty strings only when detail is inapplicable."
      ].join("\n"),
      abortSignal: AbortSignal.timeout(120_000),
      maxRetries: 2
    });
    return fromFallbackObservationExtraction(output);
  }

  async extractGalleryProfile(prompt: string): Promise<GalleryProfileExtraction> {
    const { output } = await generateText({
      model: this.getModel(),
      output: Output.object({ schema: fallbackGalleryProfileExtractionSchema }),
      prompt: [
        prompt,
        "Return every field. Use an empty string or empty array only when the official source does not state that fact. Weekday uses 0=Sunday through 6=Saturday; opening ranges are minutes after local midnight."
      ].join("\n"),
      abortSignal: AbortSignal.timeout(120_000),
      maxRetries: 2
    });
    return fromFallbackGalleryProfileExtraction(output);
  }

  async saveGalleryProfile(profile: GalleryProfileExtraction, sourceUrl: string) {
    if (this.state.kind !== "configured") {
      throw new Error("Gallery observer is not configured");
    }
    return persistGalleryProfile(observerDatabase(this.env), this.env, {
      galleryId: this.state.galleryId,
      profile,
      sourceUrl
    });
  }

  async commitSnapshot(
    source: GallerySource,
    contentHash: string,
    changed: boolean
  ) {
    return commitSourceSnapshot(observerDatabase(this.env), {
      sourceId: source.id,
      purpose: source.purpose,
      contentHash,
      changed
    });
  }

  async markSourceFailed(sourceId: string) {
    return recordSourceFailure(observerDatabase(this.env), { sourceId });
  }

  async summarizeRun(runId: string) {
    return summarizeObservationRun(observerDatabase(this.env), runId);
  }

  async finishRun(
    runId: string,
    result: Parameters<typeof completeObservationRun>[2]
  ) {
    await completeObservationRun(observerDatabase(this.env), runId, result);
    if (this.state.kind === "configured") {
      this.setState({
        ...this.state,
        observation: { kind: "observed", observedAt: new Date().toISOString() }
      });
    }
  }
}

type MarketScoutState =
  | { kind: "inactive" }
  | {
      kind: "active";
      market: MarketCode;
      reconciliation:
        { kind: "never" } | { kind: "reconciled"; reconciledAt: string };
    };

/**
 * Legacy class name retained so the existing Durable Object namespace is not
 * replaced. Instances are named by market (`ldn` and `waw`).
 */
export class LondonScout extends Think<Env, MarketScoutState> {
  override initialState: MarketScoutState = { kind: "inactive" };
  override includeMcpTools = false;
  override workspaceBash = false;

  override getModel() {
    return createZineLanguageModel(this.env.OPENROUTER_API_KEY);
  }

  override getDefaultTimezone() {
    return this.state.kind === "active"
      ? getMarketConfig(this.state.market).timezone
      : "UTC";
  }

  override getScheduledTasks(): ThinkScheduledTasks {
    if (this.state.kind !== "active") return {};
    const timezone = getMarketConfig(this.state.market).timezone;
    return {
      reconcileObservers: {
        schedule: "every day at 01:15",
        timezone,
        retry: { maxAttempts: 3 },
        handler: async () => {
          await this.reconcileObservers();
        }
      },
      weeklyCoverageAudit: {
        schedule: "every week on monday at 01:45",
        timezone,
        retry: { maxAttempts: 3 },
        handler: async () => {
          await this.discoverMarketGalleries();
          await this.reconcileObservers();
        }
      }
    };
  }

  async activateScout(market: MarketCode) {
    this.setState({
      kind: "active",
      market,
      reconciliation:
        this.state.kind === "active" && this.state.market === market
          ? this.state.reconciliation
          : { kind: "never" }
    });
    await this.internal_reconcileScheduledTasks();
    return this.state;
  }

  async reconcileObservers() {
    if (this.state.kind !== "active") {
      throw new Error("Market scout is not active");
    }
    const market = this.state.market;
    const galleryIds = await listActiveMarketGalleries(
      observerDatabase(this.env),
      market
    );
    for (const galleryId of galleryIds) {
      const observer = await getAgentByName<Env, GalleryObserver>(
        this.env.GalleryObserver,
        galleryId
      );
      await observer.configureGallery(galleryId);
    }
    this.setState({
      kind: "active",
      market,
      reconciliation: {
        kind: "reconciled",
        reconciledAt: new Date().toISOString()
      }
    });
    return { configured: galleryIds.length };
  }

  async discoverMarketGalleries() {
    if (this.state.kind !== "active") {
      throw new Error("Market scout is not active");
    }
    if (this.state.market === "waw") {
      return { kind: "not_configured" as const, registered: 0 };
    }

    const directoryUrl = "https://londongalleryweekend.art/galleries/";
    const directoryHtml = await fetchDiscoveryHtml(directoryUrl);
    const paths = [...directoryHtml.matchAll(/href="((?:\/galleries|\/exhibitors)\/[^"#?]+)"/g)]
      .map((match) => match[1])
      .filter((path): path is string => Boolean(path));
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length === 0) {
      throw new Error("London gallery directory returned no gallery entries");
    }

    const weeklyBatchSize = 20;
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const start = (weekNumber * weeklyBatchSize) % uniquePaths.length;
    const selected = Array.from(
      { length: Math.min(weeklyBatchSize, uniquePaths.length) },
      (_, index) => uniquePaths[(start + index) % uniquePaths.length]
    ).filter((path): path is string => Boolean(path));
    const db = observerDatabase(this.env);
    const registered: string[] = [];

    for (let offset = 0; offset < selected.length; offset += 5) {
      const batch = selected.slice(offset, offset + 5);
      const results = await Promise.allSettled(
        batch.map(async (path) => {
          const entryUrl = new URL(path, directoryUrl).toString();
          const html = await fetchDiscoveryHtml(entryUrl);
          const nameMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
          const websiteMatch =
            /class="[^"]*exhibitor_website[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"/i.exec(
              html
            );
          const name = nameMatch ? decodeDirectoryText(nameMatch[1]) : "";
          if (!name || !websiteMatch?.[1]) {
            throw new Error(`Directory entry lacks name or official site: ${entryUrl}`);
          }
          const officialUrl = new URL(decodeDirectoryText(websiteMatch[1]));
          if (
            officialUrl.protocol !== "https:" ||
            officialUrl.hostname === "londongalleryweekend.art"
          ) {
            throw new Error(`Directory entry has invalid official site: ${entryUrl}`);
          }
          officialUrl.search = "";
          officialUrl.hash = "";
          const galleryId = await registerMarketGallery(db, {
            market: "ldn",
            name,
            sources: { kind: "homepage", mainUrl: officialUrl.toString() },
            location: { kind: "unknown" }
          });
          const { error } = await db
            .from("galleries")
            .update({
              source_config: {
                kind: "directory_discovery",
                directory: directoryUrl,
                entry: entryUrl,
                discoveredAt: new Date().toISOString()
              }
            })
            .eq("id", galleryId);
          if (error) throw new Error(`[recordDiscovery] ${error.message}`);
          const observer = await getAgentByName<Env, GalleryObserver>(
            this.env.GalleryObserver,
            galleryId
          );
          await observer.configureGallery(galleryId);
          return galleryId;
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") registered.push(result.value);
        else {
          console.warn(
            JSON.stringify({
              event: "gallery_directory_entry_failed",
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
            })
          );
        }
      }
    }
    return {
      kind: "directory_batch" as const,
      directoryEntries: uniquePaths.length,
      registered: registered.length
    };
  }
}

function decodeDirectoryText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
