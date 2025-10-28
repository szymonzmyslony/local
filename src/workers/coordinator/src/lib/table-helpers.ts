import type { EntityType } from "@/shared/messages";
import type { Database } from "@/types/database_types";
import type { SupabaseServiceClient } from "@/shared/supabase";

// Type-safe table name mappings
export type ExtractedTableName =
  | "extracted_artists"
  | "extracted_galleries"
  | "extracted_events";
export type GoldenTableName =
  | "golden_artists"
  | "golden_galleries"
  | "golden_events";
export type LinksTableName =
  | "extracted_artist_links"
  | "extracted_gallery_links"
  | "extracted_event_links";

// Helper to get extracted table name from entity type
export function getExtractedTableName(
  entityType: EntityType
): ExtractedTableName {
  switch (entityType) {
    case "artist":
      return "extracted_artists";
    case "gallery":
      return "extracted_galleries";
    case "event":
      return "extracted_events";
  }
}

// Helper to get golden table name from entity type
export function getGoldenTableName(entityType: EntityType): GoldenTableName {
  switch (entityType) {
    case "artist":
      return "golden_artists";
    case "gallery":
      return "golden_galleries";
    case "event":
      return "golden_events";
  }
}

// Helper to get links table name from entity type
export function getLinksTableName(entityType: EntityType): LinksTableName {
  switch (entityType) {
    case "artist":
      return "extracted_artist_links";
    case "gallery":
      return "extracted_gallery_links";
    case "event":
      return "extracted_event_links";
  }
}

// Helper to get search field name from entity type
export function getSearchFieldName(entityType: EntityType): string {
  return entityType === "event" ? "title" : "name";
}

// Helper to get similarity function name from entity type
export function getSimilarityFunctionName(entityType: EntityType): string {
  switch (entityType) {
    case "artist":
      return "get_artist_pairs_for_review";
    case "gallery":
      return "get_gallery_pairs_for_review";
    case "event":
      return "get_event_pairs_for_review";
  }
}

// Type-safe query builders for extracted entities
export function queryExtractedEntities(
  sb: SupabaseServiceClient,
  entityType: EntityType
) {
  const tableName = getExtractedTableName(entityType);
  return sb.from(tableName);
}

export function queryGoldenEntities(
  sb: SupabaseServiceClient,
  entityType: EntityType
) {
  const tableName = getGoldenTableName(entityType);
  return sb.from(tableName);
}

export function queryLinksTable(
  sb: SupabaseServiceClient,
  entityType: EntityType
) {
  const tableName = getLinksTableName(entityType);
  return sb.from(tableName);
}
