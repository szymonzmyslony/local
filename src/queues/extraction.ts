import type { ExtractionJob } from "../types/jobs";

interface ExtractionQueueMessage {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: ExtractionJob;
  readonly attempts: number;
  retry(options?: { delaySeconds?: number }): void;
  ack(): void;
}

export interface ExtractionQueueBatch {
  readonly messages: ReadonlyArray<ExtractionQueueMessage>;
  readonly queue: string;
  retryAll?(options?: { delaySeconds?: number }): void;
  ackAll?(): void;
}

async function runJob(
  message: ExtractionQueueMessage,
  env: Env
): Promise<void> {
  const job = message.body;
  console.log("[queue] received job", {
    jobId: job.jobId,
    kind: job.kind,
    galleryId: job.galleryId,
    pageCount: job.pageIds.length
  });

  try {
    let instancePromise: Promise<unknown> | undefined;
    switch (job.kind) {
      case "gallery-info":
        instancePromise = env.GALLERY_INFO_WORKFLOW.create({
          id: job.jobId,
          params: job
        });
        break;
      case "artists":
        instancePromise = env.ARTIST_EXTRACTION_WORKFLOW.create({
          id: job.jobId,
          params: job
        });
        break;
      case "events":
        instancePromise = env.EVENT_EXTRACTION_WORKFLOW.create({
          id: job.jobId,
          params: job
        });
        break;
    }

    if (!instancePromise) {
      throw new Error(`Unsupported job kind: ${job.kind}`);
    }

    await instancePromise;

    message.ack();
    console.log("[queue] workflow created, job acknowledged", {
      jobId: job.jobId,
      kind: job.kind
    });
  } catch (error) {
    // Handle the case where the workflow instance already exists
    // This can happen if the message is being retried
    if (
      error instanceof Error &&
      error.message.includes("instance.already_exists")
    ) {
      message.ack();
      console.log("[queue] workflow already exists, job acknowledged", {
        jobId: job.jobId,
        kind: job.kind
      });
      return;
    }

    console.error("[queue] job failed", {
      jobId: job.jobId,
      kind: job.kind,
      galleryId: job.galleryId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error
    });
    throw error;
  }
}

export default {
  async queue(batch: ExtractionQueueBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await runJob(message, env);
    }
  }
};
