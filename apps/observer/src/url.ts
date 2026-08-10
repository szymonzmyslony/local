const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i
];

export function normalizeSourceUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("Source URLs cannot contain credentials");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Source URLs cannot use non-standard ports");
  }
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new Error("Private or local source URLs are not allowed");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function assertAllowedSourceUrl(input: string, allowed: string[]): string {
  const normalized = normalizeSourceUrl(input);
  const candidate = new URL(normalized);
  const allowedOrigins = new Set(allowed.map((value) => new URL(value).origin));
  if (!allowedOrigins.has(candidate.origin)) {
    throw new Error(`URL origin is outside this gallery's allowlist: ${candidate.origin}`);
  }
  return normalized;
}

export function stableMinute(identifier: string, startMinute = 120, spanMinutes = 240): number {
  let hash = 2166136261;
  for (const char of identifier) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return startMinute + ((hash >>> 0) % spanMinutes);
}

export function minuteToWallClock(minute: number): ThinkTime {
  const hours = Math.floor(minute / 60).toString().padStart(2, "0");
  const minutes = (minute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}` as ThinkTime;
}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function workflowInstanceId(idempotencyKey: string): Promise<string> {
  // Keep comfortably inside Cloudflare's 100-character, ASCII-safe Workflow
  // ID contract while retaining 96 bits of deterministic collision resistance.
  return `obs_${(await sha256(idempotencyKey)).slice(0, 24)}`;
}
import type { ThinkTime } from "@cloudflare/think";
