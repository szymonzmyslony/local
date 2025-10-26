import type { Database } from "@/types/database_types";

export type EntityType = Database["public"]["Enums"]["entity_type"];

export type SourceQueueMessage = { type: "source.extract"; url: string };

export type CrawlerQueueMessage = {
  type: "crawler.crawl";
  seed: string;
  maxPages?: number;
};

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

export type GoldenQueueMessage = {
  type: "golden.materialize";
  entityType: EntityType;
  entityId: string;
};

export type QueueMessage =
  | CrawlerQueueMessage
  | SourceQueueMessage
  | IdentityQueueMessage
  | GoldenQueueMessage;

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
