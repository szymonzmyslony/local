import type { Database, Tables, TablesInsert, TablesUpdate, Enums } from "./database_types";

// Re-export for convenience
export type { Database, Tables, TablesInsert, Enums };

// Table row types
export type Gallery = Tables<"galleries">;
export type GalleryInfo = Tables<"gallery_info">;

export type GalleryHours = Tables<"gallery_hours">;

export type Page = Tables<"pages">;
export type PageContent = Tables<"page_content">;
export type PageStructured = Tables<"page_structured">;

export type Event = Tables<"events">;
export type EventInfo = Tables<"event_info">;

// Insert types
export type GalleryInsert = TablesInsert<"galleries">;
export type GalleryInfoInsert = TablesInsert<"gallery_info">;
export type GalleryHoursInsert = TablesInsert<"gallery_hours">;

export type PageInsert = TablesInsert<"pages">;
export type PageContentInsert = TablesInsert<"page_content">;
export type PageStructuredInsert = TablesInsert<"page_structured">;

export type EventInsert = TablesInsert<"events">;
export type EventInfoInsert = TablesInsert<"event_info">;

// Update types
export type GalleryUpdate = TablesUpdate<"galleries">;
export type GalleryInfoUpdate = TablesUpdate<"gallery_info">;
export type GalleryHoursUpdate = TablesUpdate<"gallery_hours">;

export type PageUpdate = TablesUpdate<"pages">;
export type PageContentUpdate = TablesUpdate<"page_content">;
export type PageStructuredUpdate = TablesUpdate<"page_structured">;

export type EventUpdate = TablesUpdate<"events">;
export type EventInfoUpdate = TablesUpdate<"event_info">;

// Enum types
export type EventStatus = Enums<"event_status">;
export type FetchStatus = Enums<"fetch_status">;
export type PageKind = Enums<"page_kind">;
export type ParseStatus = Enums<"parse_status">;

// Joined/extended types for common queries
export type PageWithContent = Page & {
    page_content: PageContent | null;
};

export type PageWithStructured = Page & {
    page_structured: PageStructured | null;
};

export type PageWithAll = Page & {
    page_content: PageContent | null;
    page_structured: PageStructured | null;
};

export type EventWithInfo = Event & {
    event_info: EventInfo | null;
};

// Removed: EventWithOccurrences and EventComplete - event_occurrences table no longer exists

export type GalleryWithInfo = Gallery & {
    gallery_info: GalleryInfo | null;
};
