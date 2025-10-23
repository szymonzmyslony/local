import type { Event } from "../schema";

// Strongly typed Vectorize metadata filtering

type FilterValue = string | number | boolean | null;
type RangeValue = string | number;

// Filter operators
type EqualityFilter<T extends FilterValue> = T | { $eq: T } | { $ne: T };
type ArrayFilter<T extends FilterValue> = { $in: T[] } | { $nin: T[] };
type RangeFilter<T extends RangeValue> = {
  $lt?: T;
  $lte?: T;
  $gt?: T;
  $gte?: T;
};

// Combined filter for a single property
type PropertyFilter<T extends FilterValue | RangeValue> = T extends FilterValue
  ? EqualityFilter<T> | ArrayFilter<T>
  : T extends RangeValue
    ? EqualityFilter<T> | ArrayFilter<T> | RangeFilter<T>
    : never;

// Event metadata filter (strongly typed from Event schema)
export type EventMetadataFilter = {
  galleryId?: PropertyFilter<string>;
  eventType?: PropertyFilter<Event["eventType"]>;
  category?: PropertyFilter<Event["category"]>;
  price?: PropertyFilter<number>;
  start?: PropertyFilter<string>;
  end?: PropertyFilter<string>;
};

// Gallery metadata filter (strongly typed from Gallery schema)
export type GalleryMetadataFilter = {
  name?: PropertyFilter<string>;
  website?: PropertyFilter<string>;
  city?: PropertyFilter<string>;
  neighborhood?: PropertyFilter<string>;
  galleryType?: PropertyFilter<string>;
};

// Query options
export interface EventQueryOptions {
  topK?: number;
  filter?: EventMetadataFilter;
  returnValues?: boolean;
  returnMetadata?: "none" | "indexed" | "all";
}

export interface GalleryQueryOptions {
  topK?: number;
  filter?: GalleryMetadataFilter;
  returnValues?: boolean;
  returnMetadata?: "none" | "indexed" | "all";
}
