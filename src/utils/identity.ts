// Minimal, deterministic IDs
export function normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function websiteHost(url?: string | null): string {
    try {
        return url ? new URL(url).host.toLowerCase() : "";
    } catch {
        return "";
    }
}

/**
 * Artist ID = base64( normalizedName + "|" + websiteHost )[:16]
 * Stable across galleries if the website stays the same.
 */
export function generateArtistId(name: string, website?: string | null): string {
    const key = `${normalizeName(name)}|${websiteHost(website)}`;
    return Buffer.from(key).toString("base64").substring(0, 16);
}

/**
 * Event ID is per gallery (dedupe across the gallery's pages, not across galleries).
 */
export function generateEventId(galleryId: string, title: string, start: number): string {
    const uniqueString = `${galleryId}:${title}:${start}`;
    return Buffer.from(uniqueString).toString("base64").substring(0, 16);
}