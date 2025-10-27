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

// Identity indexing
export type IdentityIndexArtist = {
  type: "identity.index.artist";
  sourceArtistId: string;
};

export type IdentityIndexGallery = {
  type: "identity.index.gallery";
  sourceGalleryId: string;
};

export type IdentityIndexEvent = {
  type: "identity.index.event";
  sourceEventId: string;
};

export type IdentityQueueMessage =
  | IdentityIndexArtist
  | IdentityIndexGallery
  | IdentityIndexEvent;

// Golden materialization
export type GoldenQueueMessage = {
  type: "golden.materialize";
  entityType: EntityType;
  entityId: string;
};

// All queue messages
export type QueueMessage =
  | CrawlerQueueMessage
  | SourceQueueMessage
  | IdentityQueueMessage
  | GoldenQueueMessage;

// HTTP request types
export type IndexRequest = {
  entity_type: EntityType;
  source_id: string;
};

export type MergeRequest = {
  entity_type: EntityType;
  winner_id: string;
  loser_id: string;
};

export type MaterializeRequest = {
  entityType: EntityType;
  entityId: string;
};

export type MarkSameRequest = MergeRequest;
