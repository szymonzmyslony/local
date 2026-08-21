import type { GallerySource } from "./schemas";
import { normalizeSourceUrl } from "./url";

const EVENT_PATH =
  /(?:^|\/)(?:events?|exhibitions?|shows?|what-?s-on|programme|program|calendar|agenda|wydarzenia|wystawy|kalendarium|aktualn(?:e|osci)|obecne|planowane)(?:\/|\.|$)/i;
const LISTING_TAIL =
  /\/(?:events?|exhibitions?|shows?|what-?s-on|programme|program|calendar|agenda|wydarzenia|wystawy|kalendarium|aktualn(?:e|osci)|obecne|planowane)(?:\.html?)?$/i;
const REJECTED_PATH =
  /(?:^|\/)(?:archive|archiwum|archiwalne|past|previous|press|news|blog|shop|privacy|terms|login|search|tag|category)(?:\/|$)/i;
const EVENT_TAXONOMY_PATH =
  /\/(?:tag|category)\/(?:events?|exhibitions?|shows?|wydarzenia|wystawy)(?:\/|$)/i;
const PAGINATION = /(?:\/page\/\d+\/?$|[?&](?:page|paged|offset)=\d+)/i;
const MNW_EPHEMERAL_CALENDAR =
  /\/wydarzenia\/kalendarz-wydarzen\/(?:\d{2}-\d{2}-\d{4},dzien|\d{2}-\d{4},miesiac)\.html$/i;
const MNW_EVENT_DETAIL =
  /\/wydarzenia\/kalendarz-wydarzen\/\d+,wydarzenie\.html$/i;

export type AdmittedEventSource = {
  url: string;
  kind: GallerySource["kind"];
  purpose: Extract<GallerySource["purpose"], "listing" | "detail">;
  score: number;
};

export const SOURCE_ADMISSION_LIMITS = {
  bootstrap: 2,
  profile: 4,
  listing: 8,
  detail: 40
} as const satisfies Record<GallerySource["purpose"], number>;

function isSameOfficialOrigin(url: string, officialUrl: string): boolean {
  return new URL(url).origin === new URL(officialUrl).origin;
}

export function isRejectedEventSourceUrl(value: string): boolean {
  try {
    const parsed = new URL(normalizeSourceUrl(value));
    const pathAndSearch = `${parsed.pathname}${parsed.search}`;
    return (
      REJECTED_PATH.test(parsed.pathname) &&
        !EVENT_TAXONOMY_PATH.test(parsed.pathname) ||
      PAGINATION.test(pathAndSearch) ||
      MNW_EPHEMERAL_CALENDAR.test(parsed.pathname)
    );
  } catch {
    return true;
  }
}

export function classifyEventSourceUrl(
  value: string,
  officialUrl: string,
  proposed?: Pick<AdmittedEventSource, "kind" | "purpose">
): AdmittedEventSource | null {
  let url: string;
  try {
    url = normalizeSourceUrl(new URL(value, officialUrl).toString());
  } catch {
    return null;
  }
  if (!isSameOfficialOrigin(url, officialUrl)) return null;
  const parsed = new URL(url);
  if (isRejectedEventSourceUrl(url)) {
    return null;
  }

  if (/\.(?:rss|atom|xml)$/i.test(parsed.pathname)) {
    return { url, kind: "feed", purpose: "listing", score: 110 };
  }
  if (MNW_EVENT_DETAIL.test(parsed.pathname)) {
    return { url, kind: "other", purpose: "detail", score: 85 };
  }
  if (LISTING_TAIL.test(parsed.pathname)) {
    const kind: GallerySource["kind"] = /calendar|kalend/i.test(parsed.pathname)
      ? "calendar"
      : "events";
    return { url, kind, purpose: "listing", score: 100 };
  }
  if (EVENT_PATH.test(parsed.pathname)) {
    return {
      url,
      kind: proposed?.kind ?? "other",
      purpose: "detail",
      score: 70
    };
  }
  return null;
}

export function resolveObservedSourcePurpose(
  source: Pick<GallerySource, "kind" | "normalizedUrl" | "purpose">,
  pageKind: "event" | "events" | "calendar" | "other"
): GallerySource["purpose"] {
  if (source.kind === "home") return "bootstrap";
  if (source.kind === "about") return "profile";
  const deterministic = classifyEventSourceUrl(
    source.normalizedUrl,
    source.normalizedUrl,
    source.purpose === "listing" || source.purpose === "detail"
      ? { kind: source.kind, purpose: source.purpose }
      : undefined
  );
  if (deterministic) return deterministic.purpose;
  if (pageKind === "event") return "detail";
  if (pageKind === "events" || pageKind === "calendar") return "listing";
  return source.purpose;
}

/** Deterministic, one-page discovery from a gallery's own navigation links. */
export function selectEventSourceUrls(
  links: string[],
  officialUrl: string,
  limit = 8
): AdmittedEventSource[] {
  const candidates = new Map<string, AdmittedEventSource>();
  for (const link of links) {
    const candidate = classifyEventSourceUrl(link, officialUrl);
    if (!candidate || candidate.url === normalizeSourceUrl(officialUrl)) continue;
    const current = candidates.get(candidate.url);
    if (!current || current.score < candidate.score) {
      candidates.set(candidate.url, candidate);
    }
  }
  return [...candidates.values()]
    .sort(
      (left, right) =>
        right.score - left.score || left.url.localeCompare(right.url)
    )
    .slice(0, Math.min(Math.max(limit, 1), 20));
}
