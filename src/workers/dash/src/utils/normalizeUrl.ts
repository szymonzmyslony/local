export function normalizeUrl(raw: string): string {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
    u.hash = "";
    const TRACK = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^ref$/i, /^ref_$/i];
    const kept: [string, string][] = [];
    for (const [k, v] of u.searchParams.entries()) if (!TRACK.some(rx => rx.test(k))) kept.push([k, v]);
    kept.sort((a, b) => a[0].localeCompare(b[0]));
    u.search = "";
    for (const [k, v] of kept) u.searchParams.append(k, v);
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
}
