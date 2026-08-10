import type { GallerySource } from "./schemas";
import { sha256 } from "./url";

const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACTION_CHARS = 90_000;

async function readLimited(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("response exceeded observer limit");
      throw new Error(`Source response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

type BrowserMarkdownResponse = {
  success: boolean;
  result?: string;
  errors?: Array<{ message: string }>;
};

export type FetchedSnapshot = {
  content: string;
  contentHash: string;
  contentType: string;
  httpStatus: number;
  browserMs: number | null;
  byteLength: number;
};

async function browserMarkdown(browser: BrowserRun, url: string): Promise<FetchedSnapshot> {
  const response = await browser.quickAction("markdown", {
    url,
    gotoOptions: { waitUntil: "networkidle2", timeout: 45_000 },
    actionTimeout: 60_000,
    bestAttempt: true,
    cacheTTL: 0,
    rejectResourceTypes: ["image", "media", "font", "websocket"]
  });
  const body = await readLimited(response);
  let payload: BrowserMarkdownResponse;
  try {
    payload = JSON.parse(body) as BrowserMarkdownResponse;
  } catch {
    throw new Error(`Browser Run returned non-JSON (${response.status})`);
  }
  if (!response.ok || !payload.success || typeof payload.result !== "string") {
    const detail = payload.errors?.map((entry) => entry.message).join("; ") || response.statusText;
    throw new Error(`Browser Run markdown failed (${response.status}): ${detail}`);
  }
  const content = payload.result.slice(0, MAX_EXTRACTION_CHARS);
  const browserMs = Number(response.headers.get("x-browser-ms-used"));
  return {
    content,
    contentHash: await sha256(content),
    contentType: "text/markdown",
    httpStatus: 200,
    browserMs: Number.isFinite(browserMs) && browserMs > 0
      ? Math.round(browserMs)
      : null,
    byteLength: new TextEncoder().encode(content).byteLength
  };
}

async function httpHtml(url: string): Promise<FetchedSnapshot> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      "user-agent": "ZineObserver/1.0 (+https://zinelocal.com)"
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`HTTP fetch failed (${response.status})`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "text/plain";
  if (!/^(text\/|application\/xhtml\+xml)/.test(contentType)) {
    throw new Error(`Unsupported source content type: ${contentType}`);
  }
  const content = (await readLimited(response)).slice(0, MAX_EXTRACTION_CHARS);
  return {
    content,
    contentHash: await sha256(content),
    contentType,
    httpStatus: response.status,
    browserMs: null,
    byteLength: new TextEncoder().encode(content).byteLength
  };
}

export async function fetchSource(browser: BrowserRun, source: GallerySource) {
  return source.strategy === "http_html"
    ? httpHtml(source.normalizedUrl)
    : browserMarkdown(browser, source.normalizedUrl);
}

export async function browserLinks(browser: BrowserRun, url: string): Promise<string[]> {
  const response = await browser.quickAction("links", {
    url,
    visibleLinksOnly: false,
    excludeExternalLinks: true,
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 30_000 },
    actionTimeout: 45_000,
    bestAttempt: true,
    cacheTTL: 300,
    rejectResourceTypes: ["image", "media", "font", "websocket"]
  });
  const body = await readLimited(response);
  const payload = JSON.parse(body) as {
    success: boolean;
    result?: string[];
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || !payload.success) {
    throw new Error(payload.errors?.map((entry) => entry.message).join("; ") || "link fetch failed");
  }
  return (payload.result ?? []).slice(0, 500);
}
