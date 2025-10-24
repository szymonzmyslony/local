import type { PageClassification } from "../schema";

export type ExtractionKind = "gallery-info" | "artists" | "events";

export interface ExtractionJobBase {
  jobId: string;
  galleryId: string;
  pageIds: string[];
  triggeredBy: string;
  enqueuedAt: number;
}

export interface GalleryInfoExtractionJob extends ExtractionJobBase {
  kind: "gallery-info";
  referenceDateIso: string;
}

export interface ArtistExtractionJob extends ExtractionJobBase {
  kind: "artists";
  referenceDateIso: string;
}

export interface EventExtractionJob extends ExtractionJobBase {
  kind: "events";
  currentTimestamp: number;
  url: string;
  scrapedPageId: string;
}

export type ExtractionJob =
  | GalleryInfoExtractionJob
  | ArtistExtractionJob
  | EventExtractionJob;

export const CLASSIFICATION_TO_KIND: Partial<
  Record<PageClassification, ExtractionKind>
> = {
  creator_info: "gallery-info",
  artists: "artists",
  event: "events"
};
