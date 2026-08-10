import { ThinkWorkflow } from "@cloudflare/think/workflows";
import type { ThinkWorkflowStep } from "@cloudflare/think/workflows";
import type { AgentWorkflowEvent } from "agents/workflows";
import type { GalleryObserver } from "./agent";
import {
  observationExtractionSchema,
  type ObservationExtraction
} from "./schemas";

type ObservationParams = {
  galleryId: string;
  idempotencyKey: string;
  scheduledFor: number;
  mode: { kind: "change_only" } | { kind: "force_extract" };
};

export class GalleryObservationWorkflow extends ThinkWorkflow<
  GalleryObserver,
  ObservationParams
> {
  async run(event: AgentWorkflowEvent<ObservationParams>, step: ThinkWorkflowStep) {
    const config = await step.do("load-observer-configuration", async () =>
      this.agent.getConfiguration()
    );
    if (config.kind !== "configured" || config.galleryId !== event.payload.galleryId) {
      throw new Error("Observer configuration does not match workflow payload");
    }

    const runId = await step.do("begin-observation-run", async () =>
      this.agent.beginRun({
        idempotencyKey: event.payload.idempotencyKey,
        scheduledFor: event.payload.scheduledFor
      })
    );

    let sourcesAttempted = 0;
    let sourcesChanged = 0;
    let candidatesFound = 0;
    let eventsPublished = 0;
    const errors: string[] = [];

    for (const source of config.sources.filter((entry) => entry.enabled)) {
      sourcesAttempted += 1;
      try {
        const snapshot = await step.do(`fetch-and-archive:${source.id}`, {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "2 minutes"
        }, async () => this.agent.fetchAndArchive(runId, source));

        if (!snapshot.changed && event.payload.mode.kind === "change_only") continue;
        sourcesChanged += 1;
        const extractionPrompt = [
            `Observe the official source for ${config.name}.`,
            `Observation time: ${new Date(event.payload.scheduledFor).toISOString()}.`,
            "Extract every current or upcoming exhibition and public event explicitly supported by the source.",
            `For all ${config.market.city}-local times, return ISO 8601 with the correct ${config.market.timezone} offset.`,
            `${config.market.language} source material is valid evidence; preserve official artist, exhibition, and venue names.`,
            `Publish only events physically taking place at this gallery or elsewhere in ${config.market.city}.`,
            `Set venue.kind to "outside_market" for touring/off-site events in another city or country and "unknown" when the venue cannot be verified.`,
            `Every event must contain exactly one venue variant: {"kind":"market_or_gallery","evidence":"..."}, {"kind":"outside_market","venue":"...","evidence":"..."}, or {"kind":"unknown","reason":"..."}.`,
            "Do not publish navigation labels, archive-only items, shop products, or undated editorial posts as events.",
            "Put a short exact evidence fragment in each event's evidence array.",
            "Use null for dates or URLs that are not explicit and lower confidence accordingly.",
            `Official source URL: ${source.normalizedUrl}`,
            `Source kind: ${source.kind}`,
            "--- SOURCE CONTENT ---",
            snapshot.content
          ].join("\n");
        let extraction: ObservationExtraction;
        try {
          extraction = await step.prompt(`extract-events:${source.id}`, {
            key: snapshot.contentHash,
            timeout: "10 minutes",
            output: observationExtractionSchema,
            prompt: extractionPrompt
          });
        } catch (firstError) {
          try {
            extraction = await step.prompt(`extract-events-retry:${source.id}`, {
              key: snapshot.contentHash,
              timeout: "10 minutes",
              output: observationExtractionSchema,
              prompt: [
                extractionPrompt,
                "The first structured extraction failed validation. Return the exact required object and venue variants."
              ].join("\n")
            });
            console.warn(
              JSON.stringify({
                event: "structured_extraction_retry_recovered",
                source: source.normalizedUrl,
                firstError:
                  firstError instanceof Error ? firstError.message : String(firstError)
              })
            );
          } catch (retryError) {
            extraction = await step.do(
              `extract-events-sdk-fallback:${source.id}`,
              { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
              async () => this.agent.extractStructuredSnapshot(extractionPrompt)
            );
            console.warn(
              JSON.stringify({
                event: "structured_extraction_sdk_fallback_recovered",
                source: source.normalizedUrl,
                firstError:
                  firstError instanceof Error ? firstError.message : String(firstError),
                retryError:
                  retryError instanceof Error ? retryError.message : String(retryError)
              })
            );
          }
        }
        const saved = await step.do(`persist-extraction:${source.id}`, async () =>
          this.agent.saveExtraction(runId, source, extraction)
        );
        await step.do(`commit-source-snapshot:${source.id}`, async () =>
          this.agent.commitSnapshot(source.id, snapshot.contentHash, snapshot.changed)
        );
        candidatesFound += saved.candidates;
        eventsPublished += saved.published;
      } catch (error) {
        errors.push(
          `${source.normalizedUrl}: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            1000
          )
        );
      }
    }

    const authoritativeCounts = await step.do(
      "summarize-observation-run",
      async () => this.agent.summarizeRun(runId)
    );
    candidatesFound = authoritativeCounts.candidates;
    eventsPublished = authoritativeCounts.published;

    const status =
      errors.length === sourcesAttempted && sourcesAttempted > 0
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
