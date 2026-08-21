import type { ThinkWorkflowStep } from "@cloudflare/think/workflows";
import { ThinkWorkflow } from "@cloudflare/think/workflows";
import type { AgentWorkflowEvent } from "agents/workflows";
import type { GalleryObserver } from "./agent";
import type { ObservationExtraction } from "./schemas";
import { commitUnchangedSnapshotIfNeeded } from "./snapshot-lifecycle";

type ObservationParams = {
  galleryId: string;
  idempotencyKey: string;
  scheduledFor: number;
  mode:
    | { kind: "change_only" }
    | { kind: "force_extract" }
    | { kind: "unchecked_only" }
    | { kind: "profile_refresh" };
};

const SOURCE_PRIORITY: Record<string, number> = {
  events: 0,
  calendar: 1,
  feed: 2,
  other: 3,
  home: 4,
  about: 5
};

function prioritizedSources<T extends { kind: string; normalizedUrl: string }>(
  sources: T[]
): T[] {
  return [...sources].sort(
    (left, right) =>
      (SOURCE_PRIORITY[left.kind] ?? 99) -
        (SOURCE_PRIORITY[right.kind] ?? 99) ||
      left.normalizedUrl.localeCompare(right.normalizedUrl)
  );
}

export class GalleryObservationWorkflow extends ThinkWorkflow<
  GalleryObserver,
  ObservationParams
> {
  async run(
    event: AgentWorkflowEvent<ObservationParams>,
    step: ThinkWorkflowStep
  ) {
    const config = await step.do("load-observer-configuration", async () =>
      this.agent.getConfiguration()
    );
    if (
      config.kind !== "configured" ||
      config.galleryId !== event.payload.galleryId
    ) {
      throw new Error("Observer configuration does not match workflow payload");
    }

    const runId = await step.do("begin-observation-run", async () =>
      this.agent.beginRun({
        idempotencyKey: event.payload.idempotencyKey,
        scheduledFor: event.payload.scheduledFor
      })
    );

    if (event.payload.mode.kind === "profile_refresh") {
      let profileConfig = config;
      const discoveryErrors: string[] = [];
      for (const homeSource of config.sources.filter(
        (source) => source.enabled && source.kind === "home"
      )) {
        try {
          const refreshed = await step.do(
            `discover-profile-sources:${homeSource.id}`,
            {
              retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
              timeout: "1 minute"
            },
            async () => this.agent.discoverProfileSources(homeSource)
          );
          if (refreshed.kind === "configured") profileConfig = refreshed;
        } catch (error) {
          discoveryErrors.push(
            `${homeSource.normalizedUrl}: profile link discovery failed: ${
              error instanceof Error ? error.message : String(error)
            }`.slice(0, 1000)
          );
        }
        try {
          const eventRefreshed = await step.do(
            `discover-event-sources:${homeSource.id}`,
            {
              retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
              timeout: "1 minute"
            },
            async () => this.agent.discoverEventSources(homeSource)
          );
          if (eventRefreshed.kind === "configured") profileConfig = eventRefreshed;
        } catch (error) {
          discoveryErrors.push(
            `${homeSource.normalizedUrl}: event link discovery failed: ${
              error instanceof Error ? error.message : String(error)
            }`.slice(0, 1000)
          );
        }
      }
      const profileSources = prioritizedSources(
        profileConfig.sources.filter(
          (source) =>
            source.enabled && (source.kind === "home" || source.kind === "about")
        )
      );
      const errors: string[] = [...discoveryErrors];
      let sourcesChanged = 0;
      let sourcesSucceeded = 0;
      for (const source of profileSources) {
        try {
          const snapshot = await step.do(
            `fetch-profile:${source.id}`,
            {
              retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
              timeout: "2 minutes"
            },
            async () => this.agent.fetchAndArchive(runId, source)
          );
          const profile = await step.do(
            `extract-profile:${source.id}`,
            {
              retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
              timeout: "3 minutes"
            },
            async () =>
              this.agent.extractGalleryProfile(
                [
                  `Extract a verified visitor profile for ${config.name} from this official source.`,
                  `The gallery is in ${config.market.city}; interpret opening hours in ${config.market.timezone}.`,
                  "Use the venue's concise official description, street address, neighbourhood/area, normal weekly public opening hours, and art/collection/programme tags.",
                  "Ignore live open/closed status banners; the about field must describe the gallery's mission, collection, or programme.",
                  "Do not infer an address or hours from navigation, event times, or another venue. Ignore temporary holiday exceptions.",
                  `Official source URL: ${source.normalizedUrl}`,
                  "--- SOURCE CONTENT ---",
                  snapshot.content
                ].join("\n")
              )
          );
          await step.do(
            `persist-profile:${source.id}`,
            {
              retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
              timeout: "3 minutes"
            },
            async () =>
              this.agent.saveGalleryProfile(profile, source.normalizedUrl)
          );
          await step.do(`commit-profile:${source.id}`, async () =>
            this.agent.commitSnapshot(
              source,
              snapshot.contentHash,
              snapshot.changed
            )
          );
          if (snapshot.changed) sourcesChanged += 1;
          sourcesSucceeded += 1;
        } catch (error) {
          errors.push(
            `${source.normalizedUrl}: ${error instanceof Error ? error.message : String(error)}`.slice(
              0,
              1000
            )
          );
          try {
            await step.do(`record-profile-failure:${source.id}`, async () =>
              this.agent.markSourceFailed(
                source.id,
                error instanceof Error ? error.message : String(error)
              )
            );
          } catch {
            // The original profile error remains the actionable failure.
          }
        }
      }
      const status =
        profileSources.length === 0 || sourcesSucceeded === 0
          ? "failed"
          : errors.length > 0
            ? "partial"
            : "completed";
      await step.do("complete-profile-run", async () =>
        this.agent.finishRun(runId, {
          status,
          sourcesAttempted: profileSources.length,
          sourcesChanged,
          candidatesFound: 0,
          eventsPublished: 0,
          error: errors.length ? errors.join("\n").slice(0, 4000) : null
        })
      );
      if (status === "failed") {
        throw new Error(errors.join("; ") || "No official profile source succeeded");
      }
      return {
        runId,
        status,
        sourcesAttempted: profileSources.length,
        sourcesChanged,
        candidatesFound: 0,
        eventsPublished: 0,
        errors
      };
    }

    let sourcesAttempted = 0;
    let sourcesSucceeded = 0;
    let sourcesChanged = 0;
    let candidatesFound = 0;
    let eventsPublished = 0;
    const errors: string[] = [];

    const attemptedSourceIds = new Set<string>();
    let currentConfig = config;

    if (
      event.payload.mode.kind === "force_extract" ||
      event.payload.mode.kind === "unchecked_only"
    ) {
      for (const homeSource of config.sources.filter(
        (source) => source.enabled && source.kind === "home"
      )) {
        try {
          const refreshed = await step.do(
            `discover-event-navigation:${homeSource.id}`,
            {
              retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
              timeout: "1 minute"
            },
            async () => this.agent.discoverEventSources(homeSource)
          );
          if (refreshed.kind === "configured") currentConfig = refreshed;
        } catch (error) {
          errors.push(
            `${homeSource.normalizedUrl}: event link discovery failed: ${
              error instanceof Error ? error.message : String(error)
            }`.slice(0, 1000)
          );
        }
      }
    }

    for (let pass = 1; pass <= 3; pass += 1) {
      const sources = prioritizedSources(
        currentConfig.sources.filter(
          (entry) =>
            entry.enabled &&
            !(
              entry.quarantinedUntil &&
              Date.parse(entry.quarantinedUntil) > event.payload.scheduledFor
            ) &&
            entry.purpose !== "profile" &&
            !attemptedSourceIds.has(entry.id) &&
            (event.payload.mode.kind === "force_extract" ||
              event.payload.mode.kind === "change_only" &&
                entry.polling.kind !== "scheduled" ||
              event.payload.mode.kind === "unchecked_only" &&
                entry.polling.kind === "never_checked")
        )
      );
      if (sources.length === 0) break;

      for (const source of sources) {
        attemptedSourceIds.add(source.id);
        sourcesAttempted += 1;
        try {
          const snapshot = await step.do(
            `fetch-and-archive:${pass}:${source.id}`,
            {
              retries: {
                limit: 3,
                delay: "10 seconds",
                backoff: "exponential"
              },
              timeout: "2 minutes"
            },
            async () => this.agent.fetchAndArchive(runId, source)
          );

          if (
            await commitUnchangedSnapshotIfNeeded(
              event.payload.mode.kind,
              snapshot.changed,
              async () =>
                step.do(
                  `commit-unchanged-snapshot:${pass}:${source.id}`,
                  async () =>
                    this.agent.commitSnapshot(
                      source,
                      snapshot.contentHash,
                      snapshot.changed
                    )
                )
            )
          ) {
            sourcesSucceeded += 1;
            continue;
          }
          sourcesChanged += 1;
          const extractionPrompt = [
            `Observe the official source for ${currentConfig.name}.`,
            `Observation time: ${new Date(event.payload.scheduledFor).toISOString()}.`,
            "Extract every current or upcoming exhibition and public event explicitly supported by the source.",
            `For all ${currentConfig.market.city}-local times, return ISO 8601 with the correct ${currentConfig.market.timezone} offset.`,
            `${currentConfig.market.language} source material is valid evidence; preserve official artist, exhibition, and venue names.`,
            `Publish only events physically taking place at this gallery or elsewhere in ${currentConfig.market.city}.`,
            `Set venue.kind to "outside_market" for touring/off-site events in another city or country and "unknown" when the venue cannot be verified.`,
            `Every event must contain exactly one venue variant: {"kind":"market_or_gallery","evidence":"..."}, {"kind":"outside_market","venue":"...","evidence":"..."}, or {"kind":"unknown","reason":"..."}.`,
            "On an individual event page, extract that event and populate its description, artists, images, and canonical event URL.",
            "When the page contains curatorial or event body copy, write a concise factual description of 2-4 sentences; do not return a null description merely because a shorter listing omitted one.",
            "Discover same-origin event listings and current/upcoming event detail pages. Exclude archives, pagination, shop, login, press, and generic category links.",
            'For every discovered source set purpose to "listing" for a durable events/calendar/feed index, or "detail" for one specific exhibition/event page.',
            "Do not publish navigation labels, archive-only items, shop products, or undated editorial posts as events.",
            "Put a short exact evidence fragment in each event's evidence array.",
            "Use null for dates or URLs that are not explicit and lower confidence accordingly.",
            `Official source URL: ${source.normalizedUrl}`,
            `Source kind: ${source.kind}`,
            "--- SOURCE CONTENT ---",
            snapshot.content
          ].join("\n");
          const extraction: ObservationExtraction = await step.do(
            `extract-events:${pass}:${source.id}`,
            {
              retries: {
                limit: 3,
                delay: "5 seconds",
                backoff: "exponential"
              },
              timeout: "3 minutes"
            },
            async () => this.agent.extractStructuredSnapshot(extractionPrompt)
          );
          const saved = await step.do(
            `persist-extraction:${pass}:${source.id}`,
            {
              retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
              timeout: "3 minutes"
            },
            async () => this.agent.saveExtraction(runId, source, extraction)
          );
          await step.do(
            `commit-source-snapshot:${pass}:${source.id}`,
            async () =>
              this.agent.commitSnapshot(
                source,
                snapshot.contentHash,
                snapshot.changed
              )
          );
          candidatesFound += saved.candidates;
          eventsPublished += saved.published;
          sourcesSucceeded += 1;
        } catch (error) {
          const message =
            `${source.normalizedUrl}: ${error instanceof Error ? error.message : String(error)}`.slice(
              0,
              1000
            );
          errors.push(message);
          try {
            await step.do(
              `record-source-failure:${pass}:${source.id}`,
              {
                retries: { limit: 1, delay: "5 seconds" },
                timeout: "30 seconds"
              },
              async () =>
                this.agent.markSourceFailed(
                  source.id,
                  error instanceof Error ? error.message : String(error)
                )
            );
          } catch (failureRecordError) {
            errors.push(
              `${source.normalizedUrl}: could not record source failure: ${failureRecordError instanceof Error ? failureRecordError.message : String(failureRecordError)}`.slice(
                0,
                1000
              )
            );
          }
        }
      }

      if (pass === 3) break;
      try {
        const refreshed = await step.do(
          `refresh-observer-configuration:${pass}`,
          {
            retries: {
              limit: 2,
              delay: "5 seconds",
              backoff: "exponential"
            },
            timeout: "1 minute"
          },
          async () => this.agent.refreshGallerySources(config.galleryId)
        );
        if (refreshed.kind !== "configured") {
          throw new Error(
            "Observer became unconfigured during source discovery"
          );
        }
        currentConfig = refreshed;
      } catch (error) {
        errors.push(
          `Could not refresh discovered sources after pass ${pass}: ${
            error instanceof Error ? error.message : String(error)
          }`.slice(0, 1000)
        );
        break;
      }
    }

    const authoritativeCounts = await step.do(
      "summarize-observation-run",
      async () => this.agent.summarizeRun(runId)
    );
    candidatesFound = authoritativeCounts.candidates;
    eventsPublished = authoritativeCounts.published;

    const status =
      sourcesAttempted > 0 && sourcesSucceeded === 0
        ? "failed"
        : errors.length > 0
          ? "partial"
          : sourcesChanged === 0
            ? "unchanged"
            : "completed";

    await step.do("complete-observation-run", async () =>
      this.agent.finishRun(runId, {
        status,
        sourcesAttempted,
        sourcesChanged,
        candidatesFound,
        eventsPublished,
        error: errors.length ? errors.join("\n").slice(0, 4000) : null
      })
    );

    if (status === "failed") {
      throw new Error(errors.join("; ") || "Every source failed");
    }

    return {
      runId,
      status,
      sourcesAttempted,
      sourcesChanged,
      candidatesFound,
      eventsPublished,
      errors
    };
  }
}
