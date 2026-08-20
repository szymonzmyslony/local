import type { MarketCode } from "@gallery-agents/shared";

const MAX_DIRECTORY_ENTRIES = 100;
const WEEKLY_BATCH_SIZE = 20;

const DIRECTORY_CONFIG = {
  ldn: {
    url: "https://londongalleryweekend.art/galleries/",
    host: "londongalleryweekend.art"
  },
  waw: {
    url: "https://warsawgalleryweekend.pl/en/venues",
    host: "warsawgalleryweekend.pl"
  }
} as const satisfies Record<MarketCode, { url: string; host: string }>;

const NON_OFFICIAL_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com"
]);

export type DirectoryDiscoveryMode = "weekly_batch" | "full";

export type DirectoryGalleryCandidate = {
  name: string;
  officialUrl: string;
  entryUrl: string;
  location:
    | { kind: "unknown" }
    | { kind: "address_only"; address: string };
};

export type DirectoryEntryResult =
  | { kind: "candidate"; candidate: DirectoryGalleryCandidate }
  | {
      kind: "skipped";
      reason:
        | "missing_name"
        | "no_dedicated_official_site"
        | "outside_market";
    };

export function directoryConfigForMarket(market: MarketCode) {
  return DIRECTORY_CONFIG[market];
}

function decodeDirectoryText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16))
    )
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function anchorHrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((href): href is string => Boolean(href));
}

function isDirectoryEntryPath(market: MarketCode, pathname: string) {
  return market === "waw"
    ? /^\/(?:en\/)?venues\/[^/?#]+\/?$/i.test(pathname)
    : /^\/(?:galleries|exhibitors)\/[^/?#]+\/?$/i.test(pathname);
}

export function listDirectoryEntryUrls(
  market: MarketCode,
  html: string
): string[] {
  const config = directoryConfigForMarket(market);
  const entries = new Set<string>();
  for (const href of anchorHrefs(html)) {
    try {
      const url = new URL(decodeDirectoryText(href), config.url);
      if (
        officialSiteHost(url.toString()) !== config.host ||
        !isDirectoryEntryPath(market, url.pathname)
      ) {
        continue;
      }
      url.search = "";
      url.hash = "";
      entries.add(url.toString());
    } catch {
      // A malformed directory navigation link is not a gallery candidate.
    }
  }
  return [...entries].sort().slice(0, MAX_DIRECTORY_ENTRIES);
}

export function selectDirectoryEntryBatch(
  entries: string[],
  mode: DirectoryDiscoveryMode,
  now = Date.now()
): string[] {
  if (mode === "full" || entries.length <= WEEKLY_BATCH_SIZE) return entries;
  const weekNumber = Math.floor(now / (7 * 24 * 60 * 60 * 1000));
  const start = (weekNumber * WEEKLY_BATCH_SIZE) % entries.length;
  return Array.from(
    { length: Math.min(WEEKLY_BATCH_SIZE, entries.length) },
    (_, index) => entries[(start + index) % entries.length]
  ).filter((entry): entry is string => Boolean(entry));
}

function sanitizedHttpsUrl(value: string): string | null {
  try {
    const url = new URL(decodeDirectoryText(value));
    if (url.protocol !== "https:") return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function officialSiteHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseWarsawAddress(html: string): string | null {
  const addressBlocks = html.matchAll(
    /<div>\s*((?:\s*<p[^>]*>[\s\S]*?<\/p>){3,6})\s*<\/div>/gi
  );
  for (const block of addressBlocks) {
    const parts = [...(block[1] ?? "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => decodeDirectoryText(match[1] ?? ""))
      .filter(Boolean);
    const cityIndex = parts.findIndex((part) => /^(warszawa|warsaw)$/i.test(part));
    if (cityIndex < 1) continue;
    const previous = parts[cityIndex - 1];
    const postalBeforeCity = previous?.match(/^\d{2}-\d{3}$/)?.[0];
    const street = postalBeforeCity ? parts[cityIndex - 2] : previous;
    const postalCode =
      postalBeforeCity ?? parts[cityIndex + 1]?.match(/^\d{2}-\d{3}$/)?.[0];
    if (!street) continue;
    return `${street}, ${postalCode ? `${postalCode} ` : ""}Warsaw`;
  }
  return null;
}

function parseLondonEntry(
  html: string,
  entryUrl: string
): DirectoryEntryResult {
  const nameMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const name = nameMatch ? decodeDirectoryText(nameMatch[1]) : "";
  if (!name) return { kind: "skipped", reason: "missing_name" };
  const websiteMatch =
    /class=["'][^"']*exhibitor_website[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/i.exec(
      html
    );
  const officialUrl = websiteMatch?.[1]
    ? sanitizedHttpsUrl(websiteMatch[1])
    : null;
  if (
    !officialUrl ||
    officialSiteHost(officialUrl) === directoryConfigForMarket("ldn").host
  ) {
    return { kind: "skipped", reason: "no_dedicated_official_site" };
  }
  return {
    kind: "candidate",
    candidate: {
      name,
      officialUrl,
      entryUrl,
      location: { kind: "unknown" }
    }
  };
}

function parseWarsawEntry(
  html: string,
  entryUrl: string
): DirectoryEntryResult {
  const nameMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const name = nameMatch ? decodeDirectoryText(nameMatch[1]) : "";
  if (!name) return { kind: "skipped", reason: "missing_name" };
  const address = parseWarsawAddress(html);
  if (!address) return { kind: "skipped", reason: "outside_market" };

  const directoryHost = directoryConfigForMarket("waw").host;
  const officialUrl = anchorHrefs(html)
    .map(sanitizedHttpsUrl)
    .filter((value): value is string => Boolean(value))
    .find((value) => {
      const host = officialSiteHost(value);
      return (
        host !== directoryHost &&
        ![...NON_OFFICIAL_HOSTS].some(
          (blocked) => host === blocked || host.endsWith(`.${blocked}`)
        )
      );
    });
  if (!officialUrl) {
    return { kind: "skipped", reason: "no_dedicated_official_site" };
  }
  return {
    kind: "candidate",
    candidate: {
      name,
      officialUrl,
      entryUrl,
      location: { kind: "address_only", address }
    }
  };
}

export function parseDirectoryEntry(
  market: MarketCode,
  html: string,
  entryUrl: string
): DirectoryEntryResult {
  return market === "waw"
    ? parseWarsawEntry(html, entryUrl)
    : parseLondonEntry(html, entryUrl);
}
