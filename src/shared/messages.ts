import type { Database } from "@/types/database_types";

export type EntityType = Database["public"]["Enums"]["entity_type"];

// Crawler messages - split into map and fetch
export type CrawlerMapMessage = {
  type: "crawler.map";
  jobId: string;
};

export type CrawlerFetchMessage = {
  type: "crawler.fetch";
  url: string;
  jobId: string;
};

export type CrawlerQueueMessage = CrawlerMapMessage | CrawlerFetchMessage;

// Source extraction
export type SourceQueueMessage = { type: "source.extract"; url: string };

// Similarity computation (triggered manually by curator after approval)
export type SimilarityComputeArtist = {
  type: "similarity.compute.artist";
  entityId: string;
  threshold?: number; // Default 0.86
};

export type SimilarityComputeGallery = {
  type: "similarity.compute.gallery";
  entityId: string;
  threshold?: number; // Default 0.86
};

export type SimilarityComputeEvent = {
  type: "similarity.compute.event";
  entityId: string;
  threshold?: number; // Default 0.88
};

export type SimilarityQueueMessage =
  | SimilarityComputeArtist
  | SimilarityComputeGallery
  | SimilarityComputeEvent;

// All queue messages
export type QueueMessage =
  | CrawlerQueueMessage
  | SourceQueueMessage
  | SimilarityQueueMessage;

// HTTP request types (used by coordinator APIs)
export type TriggerSimilarityRequest = {
  entity_type: EntityType;
  entity_ids: string[];
  threshold?: number;
};
