import { createHash } from "node:crypto";

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeName(name: string): string {
  return normalizeWhitespace(name).toLowerCase();
}

export function normalizeTitle(title: string): string {
  return normalizeWhitespace(title).toLowerCase();
}

export function websiteHost(url?: string | null): string {
  try {
    return url ? new URL(url).host.toLowerCase() : "";
  } catch {
    throw new Error(`Invalid artist website URL: ${url}`);
  }
}

function shortSha256(input: string, hexLength: number = 20): string {
  return createHash("sha256").update(input).digest("hex").slice(0, hexLength);
}

export function generateArtistId(
  name: string,
  website?: string | null
): string {
  const key = `${normalizeName(name)}|${website ? websiteHost(website) : ""}`;
  return shortSha256(key, 24);
}

export function generateEventId(
  galleryId: string,
  title: string,
  start?: number
): string {
  const gallerySegment = shortSha256(normalizeWhitespace(galleryId), 10);
  const eventSegment = shortSha256(`${normalizeTitle(title)}|${start ?? 0}`, 18);
  return `${gallerySegment}${eventSegment}`;
}
